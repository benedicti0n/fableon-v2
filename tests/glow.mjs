// A look frame with glow on/off must not change on character-mask pixels; the world ink floor stays near black.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, RENDER_CJS, findPython } from '../cli/src/env.js';

export function runGlowTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) { checks.push({ name: 'glow mask skipped', ok: true, detail: 'no python' }); return { ok: true, errors, checks, skipped: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-glow-'));
  try {
    for (const f of ['words.json', 'storyboard.json']) copyFileSync(join(ROOT, 'fixtures', 'savitri-hi', f), join(dir, f));
    const sb = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8'));
    for (const s of sb.shots ?? []) s.look = { mood: 'warm-side' };
    writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(sb));
    const render = (out, extra = []) => spawnSync(process.execPath, [RENDER_CJS, 'stills', '--project', dir, '--frames', '111', '--size', '540x960', '--msaa', '0', '--png', '--out', join(dir, out), ...extra], { encoding: 'utf8' });
    const g = render('glow_');
    const n = render('noglow_', ['--off', 'bloom,halation']);
    const m = render('mask_', ['--mask']);
    ok('glow frame renders', g.status === 0 && n.status === 0 && m.status === 0, (g.stderr || n.stderr || m.stderr || '').slice(-200));
    const r = spawnSync(py, [join(ROOT, 'tools', 'qa', 'glow_check.py'), join(dir, 'glow_111.png'), join(dir, 'noglow_111.png'), join(dir, 'mask_111.png')], { encoding: 'utf8' });
    ok('glow mask runs', r.status === 0, (r.stderr || r.stdout || '').slice(-200));
    const d = JSON.parse(r.stdout);
    ok('glow never crosses a character', d.max <= 2 && d.over2 === 0, JSON.stringify(d));
    ok('world ink stays near black', d.ink_min <= 0.08, JSON.stringify(d));
    ok('character mask is non-empty', d.mask_pixels > 1000, JSON.stringify(d));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
