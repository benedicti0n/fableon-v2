// Final plan/cache identity checks. No renderer is started here; a manifest with dummy segment files stands in
// for a previous render so the cache decisions can be tested deterministically.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalPlan } from '../cli/src/final.js';

export async function runFinalTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const dir = mkdtempSync(join(tmpdir(), 'fableon-final-'));
  const old = process.env.FABLEON_ENGINE_ID;
  try {
    process.env.FABLEON_ENGINE_ID = 'test-engine-a';
    const write = (p, data) => { mkdirSync(join(dir, p.split('/').slice(0, -1).join('/')), { recursive: true }); writeFileSync(join(dir, p), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'); };
    write('project.json', { version: 1, id: 'plan-test', title: 'Plan', seconds: 4, language: 'en', voice: {} });
    write('words.json', [{ w: 'go', a: 0, b: 1, line: 0 }, { w: 'stop', a: 2, b: 4, line: 1 }]);
    write('board.json', { version: 1, shots: [
      { id: 'one', start: '0:0', end: '1:0', light: 'day', look: { mood: 'warm-side' } },
      { id: 'two', start: '1:0', end: 'end', light: 'night', look: { mood: 'night-moon' }, transition: { type: 'crossfade', frames: 7 } },
    ] });
    write('storyboard.json', { version: 1, fps: 30, crossfade: 10, tailFrames: 0, shots: [
      { id: 'one', start: { frame: 0 }, light: 'day' }, { id: 'two', start: { frame: 60 }, light: 'night' },
    ] });
    write('shots.json', [[1, 0, 60], [2, 60, 120]]);
    write('cast.json', { version: 1, characters: [] });
    write('cues.json', { version: 1, music: [], stingers: [], sfx: [] });
    write('audio/mix.wav', 'mix-a');
    write('final.mp4', 'old-final');
    const p1 = finalPlan(dir);
    ok('plan has one segment per shot', p1.segments.length === 2, JSON.stringify(p1.segments));
    ok('new project renders every frame', p1.framesToRender === 127 && p1.segments.every((s) => !s.cached), JSON.stringify({ frames: p1.framesToRender, cached: p1.segments.map((s) => s.cached) }));
    ok('crossfade transition is planned', p1.transitions.length === 1 && p1.transitions[0].type === 'crossfade', JSON.stringify(p1.transitions));
    write('render/final/manifest.json', {
      version: 1, engine: p1.engine, quality: p1.quality, size: p1.size, audioHash: p1.audioHash, finalHash: 'same',
      segments: Object.fromEntries(p1.segments.map((s) => [s.shot, { hash: s.hash, file: s.file, frames: s.frames, engine: p1.engine, size: p1.size, boardHash: null, lookHash: null }])),
      transitions: Object.fromEntries(p1.transitions.map((t, i) => [String(i), { hash: t.hash, file: t.file, from: t.start, to: t.end }])),
    });
    for (const s of p1.segments) { mkdirSync(join(dir, 'render', 'final', 'segments'), { recursive: true }); writeFileSync(join(dir, s.file), 'segment'); }
    for (const t of p1.transitions) { mkdirSync(join(dir, 'render', 'final', 'transitions'), { recursive: true }); writeFileSync(join(dir, t.file), 'transition'); }
    const p2 = finalPlan(dir);
    ok('unchanged inputs report zero dirty frames', p2.framesToRender === 0 && p2.segments.every((s) => s.cached), JSON.stringify({ frames: p2.framesToRender, reasons: p2.segments.map((s) => s.reason) }));
    write('audio/mix.wav', 'mix-b');
    const p3 = finalPlan(dir);
    ok('audio-only change reports audioOnly', p3.audioOnly === true && p3.framesToRender === 0, JSON.stringify({ audioOnly: p3.audioOnly, frames: p3.framesToRender }));
    process.env.FABLEON_ENGINE_ID = 'test-engine-b';
    const p4 = finalPlan(dir);
    ok('engine change dirties every shot', p4.segments.every((s) => !s.cached) && p4.segments.every((s) => s.reason === 'engine'), JSON.stringify(p4.segments.map((s) => s.reason)));
  } finally {
    if (old === undefined) delete process.env.FABLEON_ENGINE_ID; else process.env.FABLEON_ENGINE_ID = old;
    rmSync(dir, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, checks };
}
