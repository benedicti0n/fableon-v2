// A white disc on a dark sky: the clean glow stays centred, falls off monotonically and has no ring.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, RENDER_CJS, findPython } from '../cli/src/env.js';

export function runGlowDiscTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) { checks.push({ name: 'glow disc skipped', ok: true, detail: 'no python' }); return { ok: true, errors, checks, skipped: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-disc-'));
  try {
    writeFileSync(join(dir, 'words.json'), '[]');
    const sb = { version: 1, fps: 30, tailFrames: 0, shots: [{ id: 'disc', start: { frame: 0 }, end: { frame: 60 }, light: 'night', look: { mood: 'night-moon', halo: false }, sets: ['village'], sun: { az: 0, el: 0 }, camera: [{ at: { frame: 0 }, type: 'fixed', pos: [0, 5, 0], look: [0, 5, -100], fov: 40, size: 'wide' }] }] };
    writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(sb));
    const render = (out, extra = []) => spawnSync(process.execPath, [RENDER_CJS, 'stills', '--project', dir, '--frames', '10', '--size', '540x960', '--msaa', '4', '--png', '--out', join(dir, out), ...extra], { encoding: 'utf8' });
    const g = render('glow_');
    const n = render('noglow_', ['--off', 'bloom,halation']);
    ok('disc frames render', g.status === 0 && n.status === 0, (g.stderr || n.stderr || '').slice(-200));
    const r = spawnSync(py, [join(ROOT, 'tools', 'qa', 'glow_disc.py'), join(dir, 'glow_10.png'), join(dir, 'noglow_10.png')], { encoding: 'utf8' });
    ok('disc measurement runs', r.status === 0, (r.stderr || r.stdout || '').slice(-200));
    const d = JSON.parse(r.stdout);
    ok('disc is present', d.ok && d.disc_pixels > 100, JSON.stringify(d));
    ok('glow is centred', d.offset <= 0.5, JSON.stringify(d));
    ok('glow falls off monotonically', d.monotonic && !d.ring, JSON.stringify(d));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
