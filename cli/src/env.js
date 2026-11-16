// Shared paths, process helpers and Python discovery for the fableon CLI.
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const ENGINE = join(ROOT, 'engine');
export const CLI = join(ROOT, 'cli');
export const RENDER_CJS = join(ENGINE, 'scripts', 'render.cjs');
export const ASSEMBLE_MJS = join(ENGINE, 'scripts', 'assemble.mjs');

export function findPython() {
  const candidates = [];
  if (process.env.FABLEON_PYTHON) candidates.push(process.env.FABLEON_PYTHON);
  candidates.push(process.platform === 'win32' ? join(ROOT, '.venv', 'Scripts', 'python.exe') : join(ROOT, '.venv', 'bin', 'python'));
  candidates.push('python3', 'python');
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) return c;
      continue;
    }
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

// Run a command in the foreground; rejects on a non-zero exit.
export function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

// Run a command and capture stdout (stderr is folded in on failure).
export function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `${cmd} exited with ${r.status}`).trim());
  return r.stdout.trim();
}

export function runPython(py, args, opts = {}) {
  return run(py, args, opts);
}

// Say()/fail() keep CLI output consistent and keep failures readable.
export const say = (msg = '') => console.log(msg);
export const fail = (msg) => { console.error(`fableon: ${msg}`); process.exitCode = 1; };
