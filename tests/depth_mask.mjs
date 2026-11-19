// A character behind a world occluder (the hermitage hut post): the char mask and the frame must be clean on the post.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, RENDER_CJS, findPython } from '../cli/src/env.js';

export function runDepthMaskTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) { checks.push({ name: 'depth mask skipped', ok: true, detail: 'no python' }); return { ok: true, errors, checks, skipped: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-occlusion-'));
  try {
    const src = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'storyboard.json'), 'utf8'));
    const cast = src.cast ?? {};
    const who = cast.devavrata ? 'devavrata' : Object.keys(cast)[0];
    const sb = {
      version: 1, fps: 30, tailFrames: 0, crossfade: 0, featureRim: false, kicks: [], cast,
      shots: [{
        id: 'occlusion', start: { frame: 0 }, end: { frame: 60 }, light: 'day', sets: ['hermitage'], look: { mood: 'warm-side' },
        camera: [{ at: { frame: 0 }, type: 'fixed', pos: [-147.1, 3.1, -77], look: [-146.5, 2.2, -62], fov: 40, size: 'wide' }],
        actors: [{ who, id: 'actor', pos: [-146.5, 1.5, -62], view: 0, pose: 'stand', expr: 'neutral' }],
      }],
    };
    writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(sb));
    writeFileSync(join(dir, 'words.json'), '[]');
    const render = (out, extra = []) => spawnSync(process.execPath, [RENDER_CJS, 'stills', '--project', dir, '--frames', '10', '--size', '540x960', '--msaa', '4', '--png', '--out', join(dir, out), ...extra], { encoding: 'utf8' });
    const v = render('vis_');
    const h = render('hid_', ['--hide', 'actor']);
    const m = render('mask_', ['--mask']);
    ok('occlusion frames render', v.status === 0 && h.status === 0 && m.status === 0, (v.stderr || h.stderr || m.stderr || '').slice(-300));
    const r = spawnSync(py, [join(ROOT, 'tools', 'qa', 'occlusion_check.py'), join(dir, 'vis_10.png'), join(dir, 'hid_10.png'), join(dir, 'mask_10.png')], { encoding: 'utf8' });
    ok('occlusion measurement runs', r.status === 0, (r.stderr || r.stdout || '').slice(-300));
    const d = JSON.parse(r.stdout);
    ok('world occluder has no character mask', d.post.mask_max === 0 && d.post.mask_pixels === 0, JSON.stringify(d));
    ok('world occluder is identical with the actor hidden', d.post.diff_max <= 1 && d.post.diff_over1 === 0, JSON.stringify(d));
    ok('actor is present beside the occluder', d.actor.mask_max === 255 && d.actor.mask_pixels > 100 && d.actor.diff_over1 > 100, JSON.stringify(d));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
