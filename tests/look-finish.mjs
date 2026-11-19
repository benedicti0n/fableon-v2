// World-only finishing look: an extreme draft must change the world while leaving eroded character pixels alone.
import { cpSync, mkdtempSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findPython, ROOT } from '../cli/src/env.js';
import { lookFor } from '../cli/src/look-adjust.js';

export async function runFinishLookTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const shot = { look: { mood: 'dusk', shafts: true } };
  ok('lookFor without adjustments returns the exact look block', JSON.stringify(lookFor(shot, 'warm-side', null)) === JSON.stringify(shot.look), JSON.stringify(lookFor(shot, 'warm-side', null)));
  const dir = mkdtempSync(join(tmpdir(), 'fableon-look-'));
  try {
    cpSync(join(ROOT, 'fixtures', 'savitri-hi'), dir, { recursive: true });
    for (const f of ['stills/f_100.jpg', 'stills/f_100.png']) { try { rmSync(join(dir, f)); } catch { /* absent */ } }
    const cli = join(ROOT, 'cli', 'bin', 'fableon.js');
    const run = (args) => { const r = spawnSync(process.execPath, [cli, ...args], { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r; };
    run(['stills', '--project', dir, '--frames', '100', '--quality', 'preview']);
    copyFileSync(join(dir, 'stills', 'f_100.jpg'), join(dir, 'before.jpg'));
    const look = { version: 1, scenes: { 'palace-day': { exposure: 0.5, warmth: 1, glow: 1.5, haze: 1.5, shafts: 'strong', vignette: 1.5 } } };
    run(['stills', '--project', dir, '--frames', '100', '--quality', 'preview', '--look', JSON.stringify(look)]);
    copyFileSync(join(dir, 'stills', 'f_100.jpg'), join(dir, 'after.jpg'));
    const mask = spawnSync(process.execPath, [join(ROOT, 'engine', 'scripts', 'render.cjs'), 'stills', '--out', join(dir, 'stills', 'm_'), '--frames', '100', '--project', dir, '--size', '720x1280', '--msaa', '0', '--mask'], { cwd: ROOT, encoding: 'utf8' });
    if (mask.status !== 0) throw new Error(mask.stderr || mask.stdout);
    const py = findPython();
    if (!py) throw new Error('no Python for the look diff (set FABLEON_PYTHON or create .venv)');
    const script = `from PIL import Image\nimport numpy as np, json, sys\na=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.int16)\nb=np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.int16)\nm=np.asarray(Image.open(sys.argv[3]).convert('L'))>128\ne=m.copy()\nfor _ in range(2): e=e&np.roll(e,1,0)&np.roll(e,-1,0)&np.roll(e,1,1)&np.roll(e,-1,1)\nd=np.abs(a-b).mean(axis=2)\nprint(json.dumps({'char':float(d[e].mean()) if e.any() else 999,'world':float(d[~e].mean()),'px':int(e.sum())}))`;
    const diff = spawnSync(py, ['-c', script, join(dir, 'before.jpg'), join(dir, 'after.jpg'), join(dir, 'stills', 'm_100.png')], { cwd: ROOT, encoding: 'utf8' });
    if (diff.status !== 0) throw new Error(diff.stderr || diff.stdout);
    const d = JSON.parse(diff.stdout.trim().split('\n').at(-1));
    ok('character pixels stay within 0.5/255', d.char <= 0.5, JSON.stringify(d));
    ok('world pixels change measurably', d.world > 1, JSON.stringify(d));
    ok('look preview is 720x1280', (() => { const s = spawnSync(py, ['-c', 'from PIL import Image; import sys; print(Image.open(sys.argv[1]).size)', join(dir, 'after.jpg')], { encoding: 'utf8' }); return s.stdout.trim() === '(720, 1280)'; })(), 'size');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
