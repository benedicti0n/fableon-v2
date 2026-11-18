// Look QA on a synthetic frame: flat grey fails the warm/cool target and two overlapping head boxes warn crowded.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, findPython } from '../cli/src/env.js';

export function runLookQaTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) { checks.push({ name: 'look QA skipped', ok: true, detail: 'no python' }); return { ok: true, errors, checks, skipped: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-lookqa-'));
  try {
    const video = join(dir, 'animatic.mp4');
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=180x320:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8' });
    ok('look QA video fixture', ff.status === 0, (ff.stderr || '').slice(-200));
    writeFileSync(join(dir, 'qa_meta.json'), JSON.stringify({ shots: [{ id: 1, a: 0, b: 30 }] }));
    writeFileSync(join(dir, 'board.json'), JSON.stringify({ shots: [{ id: 'S', light: 'day', look: { mood: 'warm-side' } }] }));
    writeFileSync(join(dir, 'frames.json'), JSON.stringify({ rows: [{ shot: 'S', key: 0, frame: 0, primary: 'a', subjects: [
      { id: 'a', headBox: { x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.6 } },
      { id: 'b', headBox: { x0: 0.4, y0: 0.2, x1: 0.8, y1: 0.6 } },
    ] }] }));
    const r = spawnSync(py, [join(ROOT, 'tools', 'qa', 'look_qa.py'), dir, video], { encoding: 'utf8' });
    ok('look QA runs', r.status === 0, (r.stderr || r.stdout || '').slice(-200));
    const report = JSON.parse(readFileSync(join(dir, 'look-qa.json'), 'utf8'));
    ok('look QA flat light', report.warnings.some((w) => /flat light S/.test(w)), JSON.stringify(report.warnings));
    ok('look QA crowded', report.warnings.some((w) => /crowded a\/b/.test(w)), JSON.stringify(report.warnings));
    ok('look QA face metric', report.scenes[0]?.metrics?.face !== null, JSON.stringify(report.scenes[0]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
