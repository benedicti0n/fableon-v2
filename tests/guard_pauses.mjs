// Hindi pause guard: a pause after a determiner is shortened and the following word time shifts.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, findPython } from '../cli/src/env.js';
import { wavFromPcm } from '../cli/src/voice/wav.js';

export function runGuardPauseTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) { checks.push({ name: 'pause guard skipped', ok: true, detail: 'no python' }); return { ok: true, errors, checks, skipped: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-guard-'));
  try {
    const sr = 48000, n = sr * 1.6, pcm = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const on = t < 0.45 || t >= 0.65;
      pcm.writeInt16LE(on ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 12000) : 0, i * 2);
    }
    writeFileSync(join(dir, 'voice.wav'), wavFromPcm(pcm, sr));
    writeFileSync(join(dir, 'words.json'), JSON.stringify([{ w: 'एक', a: 0.2, b: 0.45, line: 0 }, { w: 'है', a: 0.65, b: 0.9, line: 0 }]));
    const r = spawnSync(py, [join(ROOT, 'cli', 'src', 'voice', 'guard_pauses.py'), join(dir, 'voice.wav'), join(dir, 'words.json')], { encoding: 'utf8' });
    ok('pause guard runs', r.status === 0, (r.stderr || r.stdout || '').slice(-200));
    const report = JSON.parse((r.stdout || '').trim().split('\n').at(-1));
    ok('pause guard cuts before है', report.cuts === 1 && report.removed > 0.1, JSON.stringify(report));
    const words = JSON.parse(readFileSync(join(dir, 'words.json'), 'utf8'));
    ok('pause guard shifts words', words[1].a < 0.55, JSON.stringify(words));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
