// Part regeneration: word snapping, pinned edges, cut rules, patch isolation and per-shot final cache.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRangePatch, buildRangePatch, rangeFrames, rangePatchErrors, snapRange } from '../cli/src/ranges.js';
import { makeContext } from '../cli/src/frames.js';
import { finalPlan } from '../cli/src/final.js';

const write = (dir, p, data) => { mkdirSync(join(dir, p.split('/').slice(0, -1).join('/')), { recursive: true }); writeFileSync(join(dir, p), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'); };

const storyboard = {
  version: 1, fps: 30, tailFrames: 0, points: {}, cast: { mira: { spec: { skin: '#c98c5c', build: 'kid', top: '#c8342e', lower: '#f6efdc', head: 'hair' } } },
  shots: [
    { id: 'one', start: { frame: 0 }, end: { frame: 90 }, light: 'day', sets: ['village'], look: { mood: 'warm-side' }, actors: [{ who: 'mira', id: 'mira', pos: [0, 0, 0], pose: 'stand', expr: 'neutral', beats: [] }], camera: [{ at: { frame: 0 }, type: 'dolly', pos: [0, 2, 6], look: [0, 2, 0], fov: 40, push: { from: { frame: 0 }, rate: 0.002 }, subjects: ['mira'] }, { at: { frame: 45 }, type: 'dolly', pos: [0, 2, 4], look: [0, 2, 0], fov: 40, push: { from: { frame: 45 }, rate: 0.002 }, subjects: ['mira'] }] },
    { id: 'two', start: { frame: 90 }, end: { frame: 180 }, light: 'night', sets: ['village'], look: { mood: 'night-moon' }, actors: [{ who: 'mira', id: 'mira', pos: [0, 0, 0], pose: 'talk', expr: 'grin', beats: [] }], camera: [{ at: { frame: 90 }, type: 'dolly', pos: [0, 2, 6], look: [0, 2, 0], fov: 40, push: { from: { frame: 90 }, rate: 0.002 }, subjects: ['mira'] }] },
  ],
};

export async function runRangeTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const dir = mkdtempSync(join(tmpdir(), 'fableon-ranges-'));
  const oldEngine = process.env.FABLEON_ENGINE_ID;
  try {
    const words = [];
    for (let i = 0; i < 12; i++) words.push({ w: `w${i}`, a: i * 0.5 + 0.05, b: i * 0.5 + 0.4, line: Math.floor(i / 4) });
    write(dir, 'project.json', { version: 1, id: 'range-test', title: 'Range', seconds: 6, language: 'en', voice: {} });
    write(dir, 'words.json', words);
    write(dir, 'storyboard.json', storyboard);
    write(dir, 'shots.json', [[1, 0, 90], [2, 90, 180]]);
    write(dir, 'board.json', { version: 1, shots: [{ id: 'one' }, { id: 'two' }] });
    write(dir, 'cast.json', { version: 1, characters: [] });
    write(dir, 'cues.json', { version: 1, music: [], stingers: [], sfx: [] });
    write(dir, 'audio/mix.wav', 'mix');

    const snapped = snapRange(words, 0.61, 2.12);
    ok('range snaps to word boundaries', snapped.fromFrame === 17 && snapped.toFrame === 57, JSON.stringify(snapped));
    const exact = rangeFrames(dir, 1.0, 2.0, { frames: true });
    ok('Alt mode uses exact frames', exact.fromFrame === 30 && exact.toFrame === 60, JSON.stringify(exact));

    const match = buildRangePatch(dir, 30, 60, 'match', 3);
    ok('match take touches only the shot under the range', match.replaceIds.length === 1 && match.replaceIds[0] === 'one', JSON.stringify(match.replaceIds));
    ok('match take pins the camera', JSON.stringify(match.shots[0].camera) === JSON.stringify(storyboard.shots[0].camera), 'camera changed');
    const beats = match.shots[0].actors[0].beats;
    ok('match take pins the in and out character states', beats.some((b) => b.at.frame === 30) && beats.some((b) => b.at.frame === 60), JSON.stringify(beats));
    ok('match take keeps beats outside the range', beats.filter((b) => b.at.frame < 30 || b.at.frame > 60).length === 0, JSON.stringify(beats));
    ok('match take is valid', rangePatchErrors(match, makeContext(dir), 30, 60, 'match').length === 0, JSON.stringify(rangePatchErrors(match, makeContext(dir), 30, 60, 'match')));

    const cut = buildRangePatch(dir, 30, 60, 'cut', 4);
    ok('cut take splits at both edges', cut.shots.length === 3 && cut.shots[0].id.endsWith('a') && cut.shots[2].id.endsWith('b'), JSON.stringify(cut.shots.map((s) => s.id)));
    ok('cut take keeps every piece >= 0.6 s', cut.shots.every((s) => { const c = makeContext(dir); return c.anchor(s.end, c.anchor(s.start)) - c.anchor(s.start) >= 18; }), JSON.stringify(cut.shots.map((s) => s.id)));
    ok('cut take passes the editing rules', rangePatchErrors(cut, makeContext(dir), 30, 60, 'cut').length === 0, JSON.stringify(rangePatchErrors(cut, makeContext(dir), 30, 60, 'cut')));
    const badCut = structuredClone(cut); badCut.shots[0].end = { frame: 10 };
    ok('cut rejects a shot shorter than 0.6 s', rangePatchErrors(badCut, makeContext(dir), 30, 60, 'cut').some((e) => /0.6|18/.test(e)), JSON.stringify(rangePatchErrors(badCut, makeContext(dir), 30, 60, 'cut')));

    const patched = applyRangePatch(storyboard, match);
    ok('patch leaves shots outside the range byte-identical', JSON.stringify(patched.shots[1]) === JSON.stringify(storyboard.shots[1]), 'shot two changed');
    ok('patch keeps the shot count for a match take', patched.shots.length === 2 && patched.shots[0].id === 'one', JSON.stringify(patched.shots.map((s) => s.id)));
    const cutPatched = applyRangePatch(storyboard, cut);
    ok('cut patch replaces one shot with three', cutPatched.shots.length === 4 && cutPatched.shots.map((s) => s.id).slice(0, 3).join(',') !== 'one,two', JSON.stringify(cutPatched.shots.map((s) => s.id)));

    // Final cache identity: a range edit to shot one must leave shot two cached.
    process.env.FABLEON_ENGINE_ID = 'range-test-engine';
    write(dir, 'storyboard.json', storyboard);
    const p1 = finalPlan(dir);
    write(dir, 'render/final/manifest.json', {
      version: 1, engine: p1.engine, quality: p1.quality, size: p1.size, audioHash: p1.audioHash, finalHash: 'same',
      segments: Object.fromEntries(p1.segments.map((s) => [s.shot, { hash: s.hash, file: s.file, frames: s.frames, engine: p1.engine, size: p1.size, lookHash: s.lookHash }])),
      transitions: Object.fromEntries(p1.transitions.map((t, i) => [String(i), { hash: t.hash, file: t.file, from: t.start, to: t.end }])),
    });
    for (const s of p1.segments) { mkdirSync(join(dir, 'render', 'final', 'segments'), { recursive: true }); writeFileSync(join(dir, s.file), 'segment'); }
    write(dir, 'storyboard.json', patched);
    const p2 = finalPlan(dir);
    const dirty = p2.segments.filter((s) => !s.cached).map((s) => s.shot);
    ok('a range edit dirties only the affected shot segment', dirty.length === 1 && dirty[0] === '1' && p2.segments.find((s) => s.shot === '2').cached, JSON.stringify(p2.segments.map((s) => [s.shot, s.cached, s.reason])));
  } finally {
    if (oldEngine === undefined) delete process.env.FABLEON_ENGINE_ID; else process.env.FABLEON_ENGINE_ID = oldEngine;
    rmSync(dir, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, checks };
}
