// F2: the ops registry and the CLI NDJSON event stream (offline mock provider).
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT, findPython } from '../cli/src/env.js';
import { newProject } from '../cli/src/core/new-project.js';
import { writeJsonArtifact } from '../cli/src/core/artifacts.js';

const runCli = (args, env = {}, timeout = 60000) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(ROOT, 'cli', 'bin', 'fableon.js'), ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timed = false;
  const timer = setTimeout(() => { timed = true; child.kill('SIGKILL'); }, timeout);
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, timed }); });
  return child;
});

export async function runEventsTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, 'schema', 'event.schema.json'), 'utf8')));
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-events-'));
  try {
    const created = newProject(tmp, { topic: 'The Moon Cheese', seconds: 20, voice: 'am_michael' });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'), join(tmp, 'research', 'sources', 'moon.md'));
    writeJsonArtifact(tmp, 'test', 'project.json', { ...created.project, voice: { ...created.project.voice, rate: { wordsPerSecond: 4.4 } }, models: { default: { provider: 'mock', model: 'mock-v1' } }, autopilot: true }, 'project');
    const env = { FABLEON_MOCK_DIR: join(ROOT, 'tests', 'fixtures', 'llm') };
    const run = await runCli(['run', '--project', tmp, '--to', 'factcheck', '--autopilot', '--events', 'ndjson'], env, 90000);
    ok('event run exits 0', run.code === 0 && !run.timed, `${run.code} ${run.timed ? 'timeout' : ''} ${run.stderr.slice(-300)}`);
    const lines = run.stdout.split('\n').filter(Boolean);
    ok('stdout is NDJSON only', lines.length > 5 && lines.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }), `${lines.length} lines`);
    const events = lines.map((l) => JSON.parse(l));
    ok('events validate against schema', events.every((e) => validate(e)), JSON.stringify(validate.errors?.slice(0, 3)));
    ok('stage events for the run', ['brief', 'research', 'script', 'factcheck'].every((s) => events.some((e) => e.type === 'stage' && e.stage === s && e.status === 'done')), JSON.stringify([...new Set(events.filter((e) => e.type === 'stage').map((e) => `${e.stage}:${e.status}`))]));
    ok('progress events carry done/total', events.some((e) => e.type === 'progress' && Number.isFinite(e.done) && Number.isFinite(e.total) && e.total > 0), JSON.stringify(events.filter((e) => e.type === 'progress').slice(0, 3)));
    ok('status events follow stages', events.some((e) => e.type === 'status' && e.stage === 'board') === false && events.some((e) => e.type === 'status' && e.stage === 'factcheck'), 'status event');
    const last = events.at(-1);
    ok('final job event is done', last?.type === 'job' && last?.status === 'done', JSON.stringify(last));

    const ops = await runCli(['ops', '--list', '--json'], {}, 30000);
    const registry = JSON.parse(ops.stdout);
    const names = new Set(registry.map((o) => o.name));
    ok('ops registry lists required actions', ['run', 'approve', 'cast', 'shotplan', 'board', 'voice-audition', 'voice-pace', 'voice-budget', 'lookdev', 'lookcheck', 'review', 'stills', 'final', 'clean', 'usage', 'models-check', 'models-catalog', 'doctor'].every((n) => names.has(n)), [...names].join(','));
    ok('ops registry has schemas and flags', registry.every((o) => o.argsSchema?.type === 'object' && typeof o.heavy === 'boolean' && typeof o.cancellable === 'boolean'), 'shape');

    // SIGTERM: a fake heavy job ends with a cancelled event and no human text on stdout.
    const child = spawn(process.execPath, [join(ROOT, 'cli', 'bin', 'fableon.js'), 'mock-sleep', '--ms', '4000', '--events', 'ndjson'], { cwd: ROOT, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    setTimeout(() => child.kill('SIGTERM'), 900);
    const code = await new Promise((r) => child.on('close', (c) => r(c)));
    const ce = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    ok('SIGTERM exits 143', code === 143, String(code));
    ok('SIGTERM emits a cancelled job', ce.at(-1)?.type === 'job' && ce.at(-1)?.status === 'cancelled', JSON.stringify(ce.at(-1)));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
