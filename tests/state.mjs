// State v2: raw-byte hashing, v1->v2 migration preserving status/approval, and the project write lock.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { STAGES } from '../cli/src/core/stages.js';
import { computeHash, computeHashV1, migrateState, statusOf, stageOutputHash, loadState, STATE_VERSION } from '../cli/src/core/state.js';
import { acquireLock, readLock, lockPath, isLocked } from '../cli/src/core/lock.js';

export function runStateTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  for (const project of ['savitri-hi', 'bakasura-hi']) {
    const dir = mkdtempSync(join(tmpdir(), `fableon-state-${project}-`));
    try {
      cpSync(join(ROOT, 'fixtures', project), dir, { recursive: true });
      const proj = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
      mkdirSync(join(dir, '.fableon'), { recursive: true });
      const raw = { version: 1, stages: {} };
      for (const stage of STAGES) {
        const hash = computeHashV1(dir, proj, stage);
        const outputHash = stageOutputHash(dir, stage);
        raw.stages[stage.name] = { hash, outputHash, approvedHash: hash, status: 'approved', lastRun: new Date().toISOString() };
      }
      const before = STAGES.map((s) => statusOf(dir, proj, s, raw, computeHashV1));
      const migrated = migrateState(dir, raw);
      ok(`${project}: migration is v2`, migrated.version === STATE_VERSION, String(migrated.version));
      const after = STAGES.map((s) => statusOf(dir, proj, s, migrated, computeHash));
      const mismatch = before.map((s, i) => s.status !== after[i].status || s.approved !== after[i].approved ? `${s.name}:${s.status}/${s.approved} -> ${after[i].status}/${after[i].approved}` : null).filter(Boolean);
      ok(`${project}: statuses and approvals preserved`, mismatch.length === 0, mismatch.join(', '));
      // The real loadState path writes v2 and must agree with the in-memory migration.
      writeFileSync(join(dir, '.fableon', 'state.json'), JSON.stringify(raw, null, 2) + '\n');
      const loaded = loadState(dir);
      ok(`${project}: loadState writes v2`, loaded.version === 2 && JSON.parse(readFileSync(join(dir, '.fableon', 'state.json'), 'utf8')).version === 2, JSON.stringify(loaded.version));
      const afterLoad = STAGES.map((s) => statusOf(dir, proj, s, loaded));
      const mismatch2 = before.map((s, i) => s.status !== afterLoad[i].status || s.approved !== afterLoad[i].approved ? `${s.name}:${s.status} -> ${afterLoad[i].status}` : null).filter(Boolean);
      ok(`${project}: loadState statuses preserved`, mismatch2.length === 0, mismatch2.join(', '));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  // Lock: live holder rejects; a dead pid is stale and can be replaced.
  const dir = mkdtempSync(join(tmpdir(), 'fableon-lock-'));
  try {
    writeFileSync(join(dir, 'project.json'), '{}\n');
    mkdirSync(join(dir, '.fableon'), { recursive: true });
    writeFileSync(lockPath(dir), JSON.stringify({ pid: process.ppid, op: 'other-writer', startedAt: new Date().toISOString() }) + '\n');
    let code = null;
    try { acquireLock(dir, 'second'); } catch (e) { code = e.code; }
    ok('second writer is PROJECT_LOCKED', code === 'PROJECT_LOCKED', String(code));
    rmSync(lockPath(dir), { force: true });
    const l = acquireLock(dir, 'test');
    ok('lock path exists', existsSync(lockPath(dir)) && isLocked(dir), lockPath(dir));
    l.release();
    ok('lock releases', !existsSync(lockPath(dir)), lockPath(dir));
    writeFileSync(lockPath(dir), JSON.stringify({ pid: 999999, op: 'dead', startedAt: new Date(0).toISOString() }) + '\n');
    const l2 = acquireLock(dir, 'stale');
    ok('dead-pid lock is reclaimed', l2 && readLock(dir).pid === process.pid, JSON.stringify(readLock(dir)));
    l2.release();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
