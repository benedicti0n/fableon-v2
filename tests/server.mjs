// Phase 4 integration: HTTP API, mock-project job + events, cancel/restart, range, security and locking.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { createServer } from '../server/src/server.js';
import { JobManager } from '../server/src/jobs.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runServerTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const root = mkdtempSync(join(tmpdir(), 'fableon-server-'));
  const oldMock = process.env.FABLEON_MOCK_DIR;
  process.env.FABLEON_MOCK_DIR = join(ROOT, 'tests', 'fixtures', 'llm');
  const envFile = join(ROOT, '.env');
  const envBefore = existsSync(envFile) ? readFileSync(envFile) : null;
  let app, token, port;
  const cleanup = async () => {
    try { await app?.close(); } catch { /* already closed */ }
    if (envBefore) writeFileSync(envFile, envBefore); else rmSync(envFile, { force: true });
    if (oldMock === undefined) delete process.env.FABLEON_MOCK_DIR; else process.env.FABLEON_MOCK_DIR = oldMock;
    rmSync(root, { recursive: true, force: true });
  };
  try {
    token = 'test-token-phase4';
    ({ app } = await createServer({ root, token, port: 0 }));
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = app.server.address().port;
    app.fableonAuthPort?.(port);
    const base = `http://127.0.0.1:${port}`;
    const api = (path, opts = {}) => fetch(base + path, {
      method: opts.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(opts.body && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) },
      body: opts.body instanceof FormData ? opts.body : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
    const wait = async (id, statuses = ['done', 'failed', 'cancelled', 'interrupted'], timeout = 20000) => {
      const end = Date.now() + timeout; let last = null;
      while (Date.now() < end) {
        const r = await json(await api(`/api/jobs/${id}`));
        last = r.body;
        if (statuses.includes(last?.status)) return last;
        await sleep(100);
      }
      return last;
    };

    // Unauthorized and DNS-rebinding/CSRF guards.
    ok('no token is 401', (await fetch(base + '/api/health')).status === 401, 'health');
    const badHost = await new Promise((resolve) => {
      const req = httpRequest({ hostname: '127.0.0.1', port, path: '/api/health', headers: { Host: 'evil.test', Authorization: `Bearer ${token}` } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', () => resolve(0)); req.end();
    });
    ok('foreign Host is 403', badHost === 403, String(badHost));
    ok('foreign Origin is 403', (await api('/api/health', { headers: { Origin: 'https://evil.test' } })).status === 403, 'origin');
    ok('health has no token', !(await (await api('/api/health')).text()).includes(token), 'token leak');

    // Create, configure, upload, run to factcheck.
    const created = await json(await api('/api/projects', { method: 'POST', body: { id: 'api-test', topic: 'API Test', seconds: 20, language: 'en' } }));
    ok('project created', created.status === 201 && created.body.id === 'api-test', JSON.stringify(created.body).slice(0, 200));
    const patched = await json(await api('/api/projects/api-test', { method: 'PATCH', body: { models: { default: { provider: 'mock', model: 'mock-v1' } }, voice: { rate: { wordsPerSecond: 4.4 } } } }));
    ok('project patched', patched.status === 200 && patched.body.project.models.default.provider === 'mock', JSON.stringify(patched.body).slice(0, 200));
    const form = new FormData();
    form.append('file', new Blob([readFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'))], { type: 'text/markdown' }), 'moon.md');
    const up = await json(await api('/api/projects/api-test/sources', { method: 'POST', body: form }));
    ok('source upload', up.status === 200 && up.body.path === 'research/sources/moon.md', JSON.stringify(up.body));

    const wsEvents = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/events?project=api-test&token=${encodeURIComponent(token)}`);
    const wsOpen = await new Promise((resolve) => { ws.onopen = () => resolve(true); ws.onerror = () => resolve(false); setTimeout(() => resolve(false), 3000); });
    if (wsOpen) ws.onmessage = (m) => { try { wsEvents.push(JSON.parse(m.data)); } catch { /* ignore */ } };
    const run = await json(await api('/api/projects/api-test/run', { method: 'POST', body: { to: 'factcheck', autopilot: true } }));
    ok('run returns a job', run.status === 202 && run.body.id, JSON.stringify(run.body).slice(0, 160));
    const done = await wait(run.body.id);
    ok('run job completes', done?.status === 'done', JSON.stringify(done).slice(0, 300));
    await sleep(250);
    ok('websocket gets stage/progress events', wsEvents.some((e) => e.type === 'stage') && wsEvents.some((e) => e.type === 'progress' && e.done > 0), JSON.stringify(wsEvents.slice(0, 3)));
    if (ws.readyState === 1) ws.close();

    const docs = await json(await api('/api/projects/api-test/files/script.json'));
    ok('script artifact readable', docs.status === 200 && docs.body.lines.length > 1, String(docs.status));
    const appr = await json(await api('/api/projects/api-test/stages/factcheck/approve', { method: 'POST', body: {} }));
    ok('factcheck approves', appr.status === 200 && appr.body.status === 'approved', JSON.stringify(appr.body));
    const touched = { ...docs.body, wps: 4.4001 };
    const put = await json(await api('/api/projects/api-test/files/script.json', { method: 'PUT', body: touched }));
    ok('script edit accepted', put.status === 200 && put.body.status === 'edited', JSON.stringify(put.body));
    const stages = await json(await api('/api/projects/api-test/stages'));
    const fc = stages.body.stages.find((s) => s.stage === 'factcheck');
    ok('downstream becomes stale after PUT', fc?.status === 'stale' || fc?.status === 'edited', JSON.stringify(fc));

    const notes = await json(await api('/api/projects/api-test/stages/cast/notes', { method: 'POST', body: { text: 'cast note from the API' } }));
    ok('cast notes endpoint', notes.status === 200 && notes.body.notes === 1, JSON.stringify(notes.body));

    // Range and path traversal.
    const media = Buffer.from('0123456789abcdef');
    writeFileSync(join(root, 'api-test', 'voice.wav'), media);
    const rr = await api('/api/projects/api-test/files/voice.wav', { headers: { Range: 'bytes=2-5' } });
    const rb = Buffer.from(await rr.arrayBuffer());
    ok('range returns 206 and exact bytes', rr.status === 206 && rr.headers.get('content-range') === `bytes 2-5/${media.length}` && rb.equals(media.subarray(2, 6)), `${rr.status} ${rr.headers.get('content-range')} ${rb.toString()}`);
    ok('traversal is 400', (await api('/api/projects/api-test/files/..%2F..%2Fpackage.json')).status === 400, 'traversal');

    // A secret written through settings must never be echoed.
    const secret = 'sk-phase4-never-echo-this';
    const keyPut = await api('/api/settings/keys/TAVILY_API_KEY', { method: 'PUT', body: { value: secret } });
    const keyText = await keyPut.text();
    ok('key PUT does not echo the value', keyPut.status === 200 && !keyText.includes(secret), keyText);
    const keyGet = await api('/api/settings/keys');
    ok('key GET is set/unset only', !(await keyGet.text()).includes(secret), 'set/unset');
    const jobText = existsSync(join(root, '.fableon-server', 'jobs.jsonl')) ? readFileSync(join(root, '.fableon-server', 'jobs.jsonl'), 'utf8') : '';
    ok('key never enters job files', !jobText.includes(secret), 'jobs');

    // Cancel and one-heavy/one-writer.
    const slow = await json(await api('/api/projects/api-test/ops/mock-sleep', { method: 'POST', body: { ms: 5000 } }));
    await sleep(300);
    const second = await api('/api/projects/api-test/ops/mock-sleep', { method: 'POST', body: { ms: 100 } });
    ok('second writer is PROJECT_LOCKED', second.status === 409 && (await second.json()).code === 'PROJECT_LOCKED', String(second.status));
    const cancelled = await json(await api(`/api/jobs/${slow.body.id}/cancel`, { method: 'POST' }));
    const canceled = await wait(slow.body.id, ['cancelled'], 10000);
    ok('cancel ends cancelled', canceled?.status === 'cancelled', JSON.stringify(canceled).slice(0, 200));

    // A running job left in the file becomes interrupted and resumable on the next manager.
    await app.close();
    const jf = join(root, '.fableon-server', 'jobs.jsonl');
    writeFileSync(jf, (existsSync(jf) ? readFileSync(jf, 'utf8') : '') + JSON.stringify({ id: 'job_restart', project: 'api-test', op: 'render', status: 'running', createdAt: new Date().toISOString(), args: {} }) + '\n');
    const jm = new JobManager(root);
    const restarted = jm.get('job_restart', false);
    ok('restart marks running job interrupted', restarted.status === 'interrupted' && restarted.resumable === true, JSON.stringify(restarted));
    await jm.close();
    app = null;
  } finally { await cleanup(); }
  return { ok: errors.length === 0, errors, checks };
}
