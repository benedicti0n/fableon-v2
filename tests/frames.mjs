// In-frame validator: a subject moved out of frame and a pillar between camera and subject must be errors.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { checkFrames } from '../cli/src/frames.js';

const fixture = join(ROOT, 'fixtures', 'adi-parva');

export function runFramesTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const clean = mkdtempSync(join(tmpdir(), 'fableon-frames-'));
  try {
    copyFileSync(join(fixture, 'words.json'), join(clean, 'words.json'));
    copyFileSync(join(fixture, 'storyboard.json'), join(clean, 'storyboard.json'));
    const base = checkFrames(clean);
    ok('fixture frames pass', base.ok, `${base.errors.length} errors`);
    const bad = JSON.parse(readFileSync(join(clean, 'storyboard.json'), 'utf8'));
    const l5 = bad.shots.find((s) => s.id === 'L5');
    l5.actors.find((a) => a.who === 'fisher').pos = [999, 1.5, 999];
    writeFileSync(join(clean, 'storyboard.json'), JSON.stringify(bad, null, 2));
    const moved = checkFrames(clean);
    ok('moved subject errors', !moved.ok && moved.errors.length > 0, `${moved.errors.length} errors`);
    const pillar = { kind: 'box', name: 'test pillar', min: [-2, 0, -23], max: [2, 4, -21] };
    writeFileSync(join(clean, 'storyboard.json'), JSON.stringify(JSON.parse(readFileSync(join(fixture, 'storyboard.json'), 'utf8')), null, 2));
    const blocked = checkFrames(clean, { keepout: [pillar] });
    ok('pillar occlusion errors', !blocked.ok && blocked.errors.some((e) => e.blocked === 'test pillar'), `${blocked.errors.length} errors`);
  } finally { rmSync(clean, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
