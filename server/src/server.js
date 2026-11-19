// Fableon local backend API. Binds 127.0.0.1, prints a per-launch token URL, and shares the CLI stage registry.
import Fastify from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../cli/src/env.js';
import { atomicWrite } from '../../cli/src/core/artifacts.js';
import { FableonError, ERROR_CODES } from '../../cli/src/core/errors.js';
import { newToken, installAuth } from './security.js';

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

export async function createServer({ root = join(ROOT, 'work'), token = newToken(), port = 4317, logger = false } = {}) {
  const projectRoot = resolve(root);
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024, trustProxy: false });
  installAuth(app, { token, port });

  app.setErrorHandler((err, req, reply) => {
    const code = err instanceof FableonError ? err.code : err.statusCode === 413 ? ERROR_CODES.BAD_REQUEST : ERROR_CODES.INTERNAL;
    const status = code === ERROR_CODES.NOT_FOUND ? 404 : code === ERROR_CODES.BAD_REQUEST ? 400 : code === ERROR_CODES.PROJECT_LOCKED ? 409 : code === ERROR_CODES.APPROVED_LOCKED ? 403 : code === ERROR_CODES.WAITING_APPROVAL ? 409 : 500;
    reply.code(err.statusCode ?? status).send({ error: err.message, code, details: err.details ?? undefined });
  });

  app.get('/', async () => ({ name: 'Fableon server', ok: true, hint: 'Use the token URL printed by `fableon serve`.' }));
  app.get('/api/health', async () => ({ ok: true, pid: process.pid, uptime: process.uptime(), root: projectRoot, version: '0.1.0' }));
  app.get('/api/doctor', async () => doctor());

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

  return { app, token, port, root: projectRoot };
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
