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
    const empty = JSON.parse(readFileSync(join(fixture, 'storyboard.json'), 'utf8'));
    empty.shots.find((s) => s.id === 'L5').camera[0].subjects = [];
    delete empty.shots.find((s) => s.id === 'L5').camera[0].scenery;
    writeFileSync(join(clean, 'storyboard.json'), JSON.stringify(empty, null, 2));
    const emptyCheck = checkFrames(clean);
    ok('unmarked empty key errors', emptyCheck.errors.some((e) => e.error === 'empty key (mark scenery:true)'), `${emptyCheck.errors.length} errors`);
    const blocker = JSON.parse(readFileSync(join(fixture, 'storyboard.json'), 'utf8'));
    const l12 = blocker.shots.find((s) => s.id === 'L12');
    l12.actors.push({ who: 'sage', pos: { at: 'DH', d: [0.05, 0, -2.0] }, pose: 'stand', expr: 'smile' });
    writeFileSync(join(clean, 'storyboard.json'), JSON.stringify(blocker, null, 2));
    const blockerCheck = checkFrames(clean);
    ok('foreground blocker errors', blockerCheck.errors.some((e) => e.error.startsWith('foreground blocker sage')), `${blockerCheck.errors.length} errors`);
    const close = JSON.parse(readFileSync(join(fixture, 'storyboard.json'), 'utf8'));
    const l5c = close.shots.find((s) => s.id === 'L5');
    l5c.actors.find((a) => a.who === 'fisher').pos = [0.2, 1.5, -19.5];
    writeFileSync(join(clean, 'storyboard.json'), JSON.stringify(close, null, 2));
    const closeCheck = checkFrames(clean);
    ok('too-close subject errors', closeCheck.errors.some((e) => e.error.startsWith('subject too close fisher')), `${closeCheck.errors.length} errors`);
  } finally { rmSync(clean, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
