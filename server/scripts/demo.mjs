// Demo: start the local API on a temp root, drive a mock project through it and print live events.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../cli/src/env.js';
import { createServer } from '../src/server.js';

const root = mkdtempSync(join(tmpdir(), 'fableon-demo-'));
process.env.FABLEON_MOCK_DIR = join(ROOT, 'tests', 'fixtures', 'llm');
const { app, token } = await createServer({ root, token: 'demo-token', port: 0 });
await app.listen({ host: '127.0.0.1', port: 0 });
const port = app.server.address().port;
app.fableonAuthPort?.(port);
const base = `http://127.0.0.1:${port}`;
const api = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`demo: ${base}/?token=${token}`);
try {
  const created = await api('/api/projects', { method: 'POST', body: { id: 'demo', topic: 'The Moon Cheese', seconds: 20, language: 'en' } });
  console.log('demo: project', created.status, created.body?.id);
  await api('/api/projects/demo', { method: 'PATCH', body: { models: { default: { provider: 'mock', model: 'mock-v1' } }, voice: { rate: { wordsPerSecond: 4.4 } } } });
  const form = new FormData();
  form.append('file', new Blob([readFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'))], { type: 'text/markdown' }), 'moon.md');
  console.log('demo: source', (await api('/api/projects/demo/sources', { method: 'POST', body: form })).status);

  const events = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/events?project=demo&token=${encodeURIComponent(token)}`);
  await new Promise((resolve) => { ws.onopen = resolve; setTimeout(resolve, 2000); });
  ws.onmessage = (m) => { try { const e = JSON.parse(m.data); events.push(e); console.log('event', JSON.stringify(e)); } catch { /* ignore */ } };

  const run = await api('/api/projects/demo/run', { method: 'POST', body: { to: 'factcheck', autopilot: true } });
  const id = run.body.id;
  let job = null;
  for (let i = 0; i < 200; i++) { job = (await api(`/api/jobs/${id}`)).body; if (['done', 'failed', 'cancelled'].includes(job.status)) break; await sleep(100); }
  console.log('demo: job', job.status);
  await api('/api/projects/demo/stages/factcheck/approve', { method: 'POST', body: {} });
  const script = (await api('/api/projects/demo/files/script.json')).body;
  await api('/api/projects/demo/files/script.json', { method: 'PUT', body: { ...script, wps: 4.4001 } });
  const stages = (await api('/api/projects/demo/stages')).body.stages;
  console.log('demo: factcheck after edit', stages.find((s) => s.stage === 'factcheck')?.status);
  ws.close();
  console.log(events.length ? 'demo: PASS' : 'demo: no events');
} finally {
  await app.close();
  rmSync(root, { recursive: true, force: true });
}
