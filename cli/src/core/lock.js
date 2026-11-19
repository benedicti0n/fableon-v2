// A per-project write lock. Reads never take it; every writing operation takes it for its whole run.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './artifacts.js';
import { FableonError, ERROR_CODES } from './errors.js';

const held = new Set();
export const lockPath = (projectDir) => join(projectDir, '.fableon', 'lock');

const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
};

export function readLock(projectDir) {
  const p = lockPath(projectDir);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { pid: -1, op: 'unknown', startedAt: null, corrupt: true }; }
}

export function isLocked(projectDir) {
  const l = readLock(projectDir);
  return !!l && pidAlive(l.pid);
}

export function acquireLock(projectDir, op = 'write') {
  if (held.has(projectDir)) return { projectDir, op, reentrant: true, release: () => {} };
  const cur = readLock(projectDir);
  if (cur && pidAlive(cur.pid)) {
    throw new FableonError(ERROR_CODES.PROJECT_LOCKED, `${op} is blocked: ${cur.op ?? 'another operation'} (pid ${cur.pid}) is writing this project`, { by: cur.op ?? 'unknown', pid: cur.pid, startedAt: cur.startedAt ?? null });
  }
  if (cur) rmSync(lockPath(projectDir), { force: true });
  const info = { pid: process.pid, op, startedAt: new Date().toISOString() };
  atomicWrite(lockPath(projectDir), JSON.stringify(info, null, 2) + '\n');
  held.add(projectDir);
  return {
    projectDir, op, release: () => {
      try {
        const now = readLock(projectDir);
        if (now?.pid === process.pid) rmSync(lockPath(projectDir), { force: true });
      } catch { /* best effort */ }
      held.delete(projectDir);
    },
  };
}

export async function withProjectLock(projectDir, op, fn) {
  const lock = acquireLock(projectDir, op);
  try { return await fn(); } finally { lock.release(); }
}
