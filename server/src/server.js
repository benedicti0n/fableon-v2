// Fableon local backend API. Binds 127.0.0.1, prints a per-launch token URL, and shares the CLI stage registry.
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../cli/src/env.js';
import { atomicWrite } from '../../cli/src/core/artifacts.js';
import { FableonError, ERROR_CODES } from '../../cli/src/core/errors.js';
import { newToken, installAuth } from './security.js';
import { acquireLock } from '../../cli/src/core/lock.js';
import * as P from './projects.js';
import * as A from './artifacts.js';
import { EventHub } from './hub.js';
import { JobManager } from './jobs.js';
import { STAGES } from '../../cli/src/core/stages.js';
import { repoModels, modelForStage, fallbackConfigsForStage, modelId } from '../../cli/src/core/model-config.js';
import { collectUsage, summarize } from '../../cli/src/usage.js';
import { SARVAM_V4, NACHIKET } from '../../cli/src/voice/sarvam.js';

export const KEY_ALLOWLIST = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'SARVAM_API_KEY', 'ELEVENLABS_API_KEY', 'OPENROUTER_API_KEY', 'TAVILY_API_KEY'];

const envPath = () => join(ROOT, '.env');
const envLines = () => existsSync(envPath()) ? readFileSync(envPath(), 'utf8').split('\n') : [];
const keySet = (name) => {
  if (process.env[name]) return true;
  return envLines().some((l) => new RegExp(`^\\s*${name}\\s*=`).test(l) && l.split('=').slice(1).join('=').trim().length > 0);
};

function setKey(name, value) {
  if (!KEY_ALLOWLIST.includes(name)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `key ${name} is not in the allowlist`, { name });
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'key value must be one non-empty line', { name });
  const lines = envLines().filter((l) => !new RegExp(`^\\s*${name}\\s*=`).test(l));
  lines.push(`${name}=${value}`);
  atomicWrite(envPath(), lines.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n').replace(/\n?$/, '\n'));
}

function deleteKey(name) {
  if (!KEY_ALLOWLIST.includes(name)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `key ${name} is not in the allowlist`, { name });
  atomicWrite(envPath(), envLines().filter((l) => !new RegExp(`^\\s*${name}\\s*=`).test(l)).join('\n').replace(/\n?$/, '\n'));
}

function doctor() {
  const r = spawnSync(process.execPath, [join(ROOT, 'cli', 'bin', 'fableon.js'), 'doctor'], { cwd: ROOT, encoding: 'utf8', env: process.env, timeout: 120000 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const checks = output.split('\n').map((line) => {
    const m = /^\s*(OK|FAIL)\s+(.*?)(?:\s+—\s+(.*))?$/.exec(line);
    return m ? { ok: m[1] === 'OK', label: m[2].trim(), detail: m[3] ?? '' } : null;
  }).filter(Boolean);
  return { ok: r.status === 0, checks, output };
}

let voiceCache = { at: 0, eleven: [], credit: null };
async function voiceInfo() {
  if (Date.now() - voiceCache.at < 60000) return voiceCache;
  let eleven = [], credit = null;
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      if (r.ok) { const j = await r.json(); eleven = (j.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category ?? null, labels: v.labels ?? null })); }
    } catch { /* offline is fine */ }
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      if (r.ok) { const j = await r.json(); credit = { elevenlabs: { plan: j.tier ?? j.status ?? null, used: j.character_count ?? null, limit: j.character_limit ?? null, remaining: j.character_limit != null && j.character_count != null ? j.character_limit - j.character_count : null, reset: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null } }; }
    } catch { /* offline is fine */ }
  }
  voiceCache = { at: Date.now(), eleven, credit };
  return voiceCache;
}

function spentUsd(ctx) {
  try {
    const state = JSON.parse(readFileSync(join(ctx.dir, '.fableon', 'state.json'), 'utf8'));
    return Object.values(state.stages ?? {}).reduce((n, s) => n + Number(s.usage?.costUsd ?? 0), 0);
  } catch { return 0; }
}

function budgetCheck(ctx, op, body) {
  const modelOps = new Set(['run', 'cast', 'shotplan', 'board', 'sound', 'factcheck', 'script']);
  const cost = spentUsd(ctx);
  const estimate = modelOps.has(op) ? 0.05 : 0;
  const limit = ctx.project?.budget?.maxUsd ?? null;
  if (limit != null && cost + estimate > limit) return { ok: false, spent: +cost.toFixed(4), estimate, limit, message: `budget ${limit} USD would be exceeded (spent ${cost.toFixed(2)}, estimate ${estimate.toFixed(2)})` };
  const provider = ctx.project?.models?.default?.provider ?? 'deepseek';
  const providerLimit = ctx.project?.budget?.providers?.[provider] ?? null;
  if (providerLimit != null && cost + estimate > providerLimit) return { ok: false, spent: +cost.toFixed(4), estimate, limit: providerLimit, provider, message: `provider budget ${provider} ${providerLimit} USD would be exceeded` };
  return { ok: true, spent: +cost.toFixed(4), estimate, limit };
}

export async function createServer({ root = join(ROOT, 'work'), token = newToken(), port = 4317, logger = false } = {}) {
  const projectRoot = resolve(root);
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024, trustProxy: false });
  app.addContentTypeParser(['text/plain', 'text/markdown'], { parseAs: 'string' }, (_req, body, done) => done(null, body));
  // Every direct project mutation takes the same lock as the CLI/jobs; job starts are skipped (the child locks).
  app.addHook('preHandler', (req, reply, done) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return done();
    const url = String(req.raw.url ?? req.url ?? '');
    const m = /^\/api\/projects\/([^/?]+)/.exec(url);
    if (!m) return done();
    if (/\/ops\//.test(url) || /\/run(?:[?#]|$)/.test(url)) return done();
    try {
      const ctx = P.resolveProject(projectRoot, decodeURIComponent(m[1]));
      req.fableonLock = acquireLock(ctx.dir, `api:${req.method.toLowerCase()}`);
      reply.raw.once('close', () => { try { req.fableonLock?.release(); } catch { /* best effort */ } });
      return done();
    } catch (e) { return done(e); }
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(websocket);
  const ctxOf = (id) => P.resolveProject(projectRoot, id);
  const hub = new EventHub();
  const jobs = new JobManager(projectRoot, (event) => hub.broadcast(event));
  installAuth(app, { token, port });

  app.setErrorHandler((err, req, reply) => {
    const code = err instanceof FableonError ? err.code : err.statusCode === 413 ? ERROR_CODES.BAD_REQUEST : ERROR_CODES.INTERNAL;
    const status = code === ERROR_CODES.NOT_FOUND ? 404 : code === ERROR_CODES.BAD_REQUEST ? 400 : code === ERROR_CODES.PROJECT_LOCKED ? 409 : code === ERROR_CODES.APPROVED_LOCKED ? 403 : code === ERROR_CODES.WAITING_APPROVAL ? 409 : 500;
    reply.code(err.statusCode ?? status).send({ error: err.message, code, details: err.details ?? undefined });
  });

  app.get('/', async () => ({ name: 'Fableon server', ok: true, hint: 'Use the token URL printed by `fableon serve`.' }));
  app.get('/api/health', async () => ({ ok: true, pid: process.pid, uptime: process.uptime(), root: projectRoot, version: '0.1.0' }));
  app.get('/api/doctor', async () => doctor());

  app.get('/api/projects', async () => ({ projects: P.listProjects(projectRoot), root: projectRoot }));
  app.post('/api/projects', async (req, reply) => {
    const ctx = P.createProject(projectRoot, req.body ?? {});
    return reply.code(201).send(P.details(ctx));
  });
  app.get('/api/projects/:id', async (req) => P.details(ctxOf(req.params.id)));
  app.patch('/api/projects/:id', async (req) => P.patchProject(ctxOf(req.params.id), req.body ?? {}));
  app.post('/api/projects/:id/archive', async (req) => P.archiveProject(projectRoot, ctxOf(req.params.id)));

  app.get('/api/projects/:id/stages', async (req) => {
    const d = P.details(ctxOf(req.params.id));
    return { id: d.id, stages: d.stages, todos: d.todos, craft: d.craft, readOnly: d.readOnly };
  });
  app.post('/api/projects/:id/stages/:stage/approve', async (req) => P.approveStage(ctxOf(req.params.id), String(req.params.stage), req.body?.override ?? null));
  app.post('/api/projects/:id/stages/:stage/notes', async (req) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'notes text is required');
    return P.stageNotes(ctxOf(req.params.id), String(req.params.stage), text);
  });

  app.post('/api/projects/:id/run', async (req, reply) => {
    const ctx = ctxOf(req.params.id);
    const budget = budgetCheck(ctx, 'run', req.body ?? {});
    if (!budget.ok && !req.body?.confirmBudget) {
      const event = { ts: new Date().toISOString(), type: 'budget', project: ctx.id, op: 'run', estimateUsd: budget.estimate, spentUsd: budget.spent, limitUsd: budget.limit, message: budget.message };
      hub.broadcast(event);
      return reply.code(409).send({ error: budget.message, code: ERROR_CODES.BUDGET_EXCEEDED, ...event });
    }
    const job = jobs.create(ctx, 'run', { ...(req.body ?? {}), project: ctx.dir });
    return reply.code(202).send(job);
  });
  app.post('/api/projects/:id/ops/:op', async (req, reply) => {
    const ctx = ctxOf(req.params.id);
    const op = String(req.params.op);
    const budget = budgetCheck(ctx, op, req.body ?? {});
    if (!budget.ok && !req.body?.confirmBudget) {
      const event = { ts: new Date().toISOString(), type: 'budget', project: ctx.id, op, estimateUsd: budget.estimate, spentUsd: budget.spent, limitUsd: budget.limit, message: budget.message };
      hub.broadcast(event);
      return reply.code(409).send({ error: budget.message, code: ERROR_CODES.BUDGET_EXCEEDED, ...event });
    }
    const job = jobs.create(ctx, op, { ...(req.body ?? {}), project: ctx.dir });
    return reply.code(202).send(job);
  });
  app.get('/api/models', async () => {
    const repo = repoModels();
    const keys = Object.fromEntries(KEY_ALLOWLIST.map((name) => [name, keySet(name) ? 'set' : 'unset']));
    const stages = STAGES.filter((s) => s.prompt).map((s) => {
      const primary = modelForStage({ models: {} }, s.name, repo);
      const fallbacks = fallbackConfigsForStage({ models: {} }, s.name, repo);
      const id = modelId(primary);
      const price = repo.prices?.[id] ?? null;
      return { stage: s.name, primary: { ...primary, id }, fallbacks: fallbacks.map((f) => ({ ...f, id: modelId(f) })), price };
    });
    return { stages, keys, prices: repo.prices ?? {}, source: 'models.json', date: repo.date ?? null };
  });
  app.post('/api/models/check', async (req, reply) => {
    const job = jobs.create({ id: 'server', dir: projectRoot, project: {}, readOnly: false }, 'models-check', req.body ?? {});
    return reply.code(202).send(job);
  });
  app.get('/api/voices', async () => {
    const keys = { elevenlabs: keySet('ELEVENLABS_API_KEY'), sarvam: keySet('SARVAM_API_KEY') };
    const live = await voiceInfo();
    const cached = P.listProjects(projectRoot).map((p) => {
      const f = join(p.path, 'voice', 'auditions', 'auditions.md');
      if (!existsSync(f)) return null;
      const lines = readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.includes('---') && !l.startsWith('| file'));
      return { project: p.id, auditions: lines.slice(0, 40) };
    }).filter(Boolean);
    return {
      providers: [
        { name: 'kokoro', configured: true, model: 'kokoro', speakers: ['am_michael'] },
        { name: 'elevenlabs', configured: keys.elevenlabs, model: 'eleven_multilingual_v2', speakers: live.eleven },
        { name: 'sarvam', configured: keys.sarvam, model: SARVAM_V4, speakers: ['anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', NACHIKET] },
      ],
      cached,
      credit: live.credit ?? { elevenlabs: { available: false, note: 'set ELEVENLABS_API_KEY or run fableon voice budget' }, sarvam: { budgetInr: 200, note: 'logged spend is in fableon usage' } },
    };
  });
  app.get('/api/usage', async (req) => {
    const since = req.query?.from ? String(req.query.from) : null;
    const project = req.query?.project ? String(req.query.project) : null;
    const usage = collectUsage(ROOT, { since });
    const deep = project ? usage.deep.filter((r) => String(r.project).includes(project)) : usage.deep;
    const eleven = project ? usage.eleven.filter((r) => String(r.project).includes(project)) : usage.eleven;
    const totals = summarize({ deep, eleven });
    const to = req.query?.to ? String(req.query.to) : null;
    const byDay = new Map();
    for (const rel of usage.files) {
      let lines = [];
      try { lines = readFileSync(join(ROOT, rel), 'utf8').split('\n'); } catch { continue; }
      for (const line of lines) {
        if (!line.trim()) continue;
        let l; try { l = JSON.parse(line); } catch { continue; }
        const day = String(l.ts ?? '').slice(0, 10);
        if (!day || (since && day < since) || (to && day > to)) continue;
        if (project && !String(rel).includes(project)) continue;
        const key = `${day}\0${l.provider ?? '?'}\0${l.stage ?? '?'}\0${l.model ?? '?'}`;
        const row = byDay.get(key) ?? { day, provider: l.provider ?? null, stage: l.stage ?? null, model: l.model ?? null, calls: 0, cached: 0, characters: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0 };
        if (l.cached) row.cached++; else row.calls++;
        row.characters += Number(l.characters ?? 0);
        row.promptTokens += Number(l.promptTokens ?? 0);
        row.completionTokens += Number(l.completionTokens ?? 0);
        row.reasoningTokens += Number(l.reasoningTokens ?? 0);
        row.costUsd += Number(l.costUsd ?? 0);
        byDay.set(key, row);
      }
    }
    return { since, to, project, byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day) || String(a.provider).localeCompare(String(b.provider)) || String(a.stage).localeCompare(String(b.stage))), totals, deep, eleven, mock: usage.mock };
  });

  app.get('/api/jobs', async (req) => ({ jobs: jobs.list(req.query?.project ? String(req.query.project) : null) }));
  app.get('/api/jobs/:id', async (req) => jobs.get(String(req.params.id)));
  app.post('/api/jobs/:id/cancel', async (req) => jobs.cancel(String(req.params.id)));

  app.get('/api/events', { websocket: true }, (socket, req) => {
    const ws = socket.socket ?? socket;
    const send = (e) => { try { ws.send(JSON.stringify(e)); } catch { /* closed */ } };
    const remove = hub.add({ kind: 'ws', socket: ws }, req.query?.project ?? null);
    send({ ts: new Date().toISOString(), type: 'log', message: 'connected' });
    ws.on('close', remove);
    ws.on('error', remove);
  });
  app.get('/api/events/sse', async (req, reply) => {
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    reply.raw.write(`data: ${JSON.stringify({ ts: new Date().toISOString(), type: 'log', message: 'connected' })}\n\n`);
    const remove = hub.add({ kind: 'sse', res: reply.raw }, req.query?.project ?? null);
    req.raw.on('close', remove);
    return reply;
  });

  app.get('/api/projects/:id/files/*', async (req, reply) => {
    const ctx = ctxOf(req.params.id);
    try {
      const file = A.filePath(ctx, req.params['*']);
      return A.rangeReply(req, reply, file);
    } catch (e) {
      if (e.code === ERROR_CODES.BAD_REQUEST) return reply.code(400).send({ error: 'path traversal', code: ERROR_CODES.BAD_REQUEST });
      throw e;
    }
  });
  app.put('/api/projects/:id/files/*', async (req) => {
    const ctx = ctxOf(req.params.id);
    const rel = String(req.params['*']).replace(/^\/+/, '');
    return A.putFile(ctx, rel, req.body);
  });
  app.post('/api/projects/:id/sources', async (req) => {
    const ctx = ctxOf(req.params.id);
    const file = await req.file();
    if (!file) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'multipart file is required');
    const buf = await file.toBuffer();
    if (buf.length > 10 * 1024 * 1024) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'source is larger than 10 MB');
    return A.saveSource(ctx, file.filename, buf);
  });
  app.get('/api/projects/:id/history', async (req) => {
    const ctx = ctxOf(req.params.id);
    return { versions: A.history(ctx, req.query?.path ? String(req.query.path) : null) };
  });
  app.post('/api/projects/:id/history/restore', async (req) => {
    const ctx = ctxOf(req.params.id);
    const version = String(req.body?.version ?? '');
    if (!version) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'version is required');
    return A.restore(ctx, version);
  });

  app.get('/api/settings/keys', async () => Object.fromEntries(KEY_ALLOWLIST.map((name) => [name, keySet(name) ? 'set' : 'unset'])));
  app.put('/api/settings/keys/:name', async (req) => {
    const name = String(req.params.name);
    const value = req.body?.value;
    setKey(name, value);
    return { name, status: keySet(name) ? 'set' : 'unset' };
  });
  app.delete('/api/settings/keys/:name', async (req) => {
    const name = String(req.params.name);
    deleteKey(name);
    return { name, status: keySet(name) ? 'set' : 'unset' };
  });

  app.addHook('onClose', async () => { await jobs.close(); });
  return { app, token, port, root: projectRoot, jobs, hub };
}

export async function startServer({ port = 4317, root = join(ROOT, 'work'), open = false } = {}) {
  const token = newToken();
  const { app } = await createServer({ root, token, port });
  await app.listen({ host: '127.0.0.1', port });
  const actualPort = app.server.address().port;
  app.fableonAuthPort?.(actualPort);
  const url = `http://127.0.0.1:${actualPort}/?token=${encodeURIComponent(token)}`;
  console.log(url);
  if (open) {
    try { await import('node:child_process').then(({ spawn }) => spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()); } catch { /* optional */ }
  }
  return { app, token, port: actualPort, url };
}
