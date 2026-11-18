// Clean removes regenerable segments/auditions but keeps the final and the current animatic.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanProject } from '../cli/src/clean.js';

export function runCleanTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const dir = mkdtempSync(join(tmpdir(), 'fableon-clean-'));
  try {
    for (const f of ['render/seg_01.mp4', 'voice/auditions/take.wav', 'qa/sheet.jpg', 'final.mp4', 'animatic.mp4']) {
      mkdirSync(join(dir, f.split('/').slice(0, -1).join('/')), { recursive: true });
      writeFileSync(join(dir, f), 'x');
    }
    const dry = cleanProject(dir, { dryRun: true });
    ok('clean dry run lists files', dry.files.length === 3 && dry.bytes === 3, JSON.stringify(dry));
    ok('clean dry run keeps files', existsSync(join(dir, 'render/seg_01.mp4')));
    const real = cleanProject(dir, { dryRun: false });
    ok('clean removes regenerable files', real.files.length === 3 && !existsSync(join(dir, 'render/seg_01.mp4')) && !existsSync(join(dir, 'voice/auditions/take.wav')));
    ok('clean keeps final/animatic', existsSync(join(dir, 'final.mp4')) && existsSync(join(dir, 'animatic.mp4')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
