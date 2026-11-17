// Reference camera language: burst easing, transitions, direction-mark translation and film stats.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ENGINE, ROOT } from '../cli/src/env.js';
import { baseShot } from '../cli/src/stages/board.js';
import { compileBoard } from '../cli/src/authoring.js';
import { directorErrors } from '../cli/src/stages/shotplan.js';
import { filmErrors, filmStats } from '../cli/src/film.js';

const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
const words = Array.from({ length: 12 }, (_, i) => ({ w: `w${i}`, a: i * 0.4, b: i * 0.4 + 0.3, line: Math.floor(i / 6) }));
const script = { lines: [
  { n: 0, beat: 'hook', text: 'w0 w1 w2 w3 w4 w5', look: { who: [] } },
  { n: 1, beat: 'payoff', text: 'w6 w7 w8 w9 w10 w11', look: { who: [] } },
] };

export async function runDirectorTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const req = createRequire(join(ENGINE, 'package.json'));
  const { build } = req('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-director-'));
  try {
    const timingOut = join(tmp, 'timing.mjs');
    await build({ entryPoints: [join(ENGINE, 'src', 'core', 'timing.ts')], bundle: true, platform: 'node', format: 'esm', outfile: timingOut, logLevel: 'silent' });
    const timing = await import(pathToFileURL(timingOut).href);
    ok('burst peaks early', timing.burst(0.1) > timing.glide(0.1) && timing.burst(0.5) > timing.glide(0.5), `${timing.burst(0.1)} vs ${timing.glide(0.1)}`);
    ok('burst endpoints', timing.burst(0) === 0 && timing.burst(1) === 1, `${timing.burst(0)}, ${timing.burst(1)}`);

    const shotOut = join(tmp, 'shotlist.mjs');
    await build({ entryPoints: [join(ENGINE, 'src', 'core', 'shotlist.ts')], bundle: true, platform: 'node', format: 'esm', outfile: shotOut, logLevel: 'silent' });
    const shotlist = await import(pathToFileURL(shotOut).href);
    const legacy = shotlist.transitionMaps([{ id: 1, a: 0, light: 'day' }, { id: 2, a: 100, light: 'golden' }], 7);
    ok('legacy crossfade kept', !legacy.explicit && legacy.xfade[2] === 7 && legacy.flashes.length === 0, JSON.stringify(legacy));
    const explicit = shotlist.transitionMaps([
      { id: 1, a: 0, light: 'day' },
      { id: 2, a: 100, light: 'day', transition: { type: 'cut' } },
      { id: 3, a: 200, light: 'golden', transition: { type: 'crossfade', frames: 6 } },
      { id: 4, a: 300, light: 'night', transition: { type: 'flash' } },
    ], 10);
    ok('explicit transitions', explicit.explicit && explicit.xfade[3] === 6 && explicit.flashes[0] === 300 && !explicit.xfade[2] && !explicit.xfade[4], JSON.stringify(explicit));

    const cast = { savitri: { spec: { build: 'adult', skin: '#e7b07e', top: '#c8342e', lower: '#f6efdc', head: 'crownSmall' }, seed: 1 } };
    const board = { version: 1, cast, shots: [{
      id: 'S1', start: '0:0', end: 'end', light: 'day', sets: ['village'], transition: { type: 'crossfade', frames: 7 },
      actors: [{ cast: 'savitri', id: 'savitri', at: 'village.front', pose: 'stand', expr: 'neutral', do: [['0:2', { expr: 'stern' }]] }],
      camera: [{ at: '0:0', size: 'medium', on: ['savitri'], angle: 'low', side: 'front', move: 'glide', ease: 'burst', easeFrames: 10, punch: '0:2', impact: '0:3', drama: true, reveal: true, foreground: 'village.palms' }],
    }] };
    const compiled = compileBoard(board, words, catalog).storyboard;
    const key = compiled.shots[0].camera[0];
    ok('transition compiled', compiled.shots[0].transition?.type === 'crossfade' && compiled.shots[0].transition?.frames === 7, JSON.stringify(compiled.shots[0].transition));
    ok('burst compiled', key.ease === 'burst' && key.dur === 10, JSON.stringify({ ease: key.ease, dur: key.dur }));
    ok('punch compiled', key.push?.punch === 0.006 && key.push?.punchAt?.line === 0, JSON.stringify(key.push));
    ok('drama roll compiled', Math.abs((key.roll ?? 0) - (4.5 * Math.PI) / 180) < 1e-9, String(key.roll));
    ok('reveal pull-back', key.push?.rate === -0.004, JSON.stringify(key.push));
    ok('foreground compiled', key.over === 'village.palms', String(key.over));
    ok('reaction lands before word', compiled.shots[0].actors[0].beats[0].at.offset === -2, JSON.stringify(compiled.shots[0].actors[0].beats[0].at));

    const planShot = { id: 'S1', start: '0:0', set: 'village', light: 'day', scene: 'v1', characters: ['savitri'], keys: [{ at: '0:0', size: 'full', on: ['savitri'], side: 'front', move: 'follow', punch: '0:2', foreground: 'village.palms' }], moves: [{ who: 'savitri', from: 'village.front', to: 'village.palms', at: '0:1', until: '0:6', gait: 'walk' }] };
    const boardShot = baseShot(planShot, 0, { shots: [planShot] }, { characters: [{ id: 'savitri' }] }, catalog);
    ok('moves path compiled', boardShot.actors[0].motion?.type === 'path' && boardShot.actors[0].motion.keys.length === 2, JSON.stringify(boardShot.actors[0].motion));
    ok('low height default', boardShot.camera[0].angle === 'low', boardShot.camera[0].angle);

    const stats = filmStats(compiled, words, script);
    ok('film stats', stats.transition === undefined && stats.shots === 1 && stats.foregroundShare === 1 && stats.punches === 1 && stats.rolls === 1, JSON.stringify(stats));
    ok('film checks fire', filmErrors(stats, { words, script }).length > 0, JSON.stringify(filmErrors(stats, { words, script })));

    const followNoMove = directorErrors({ shots: [
      { id: 'S1', start: '0:0', set: 'village', light: 'day', scene: 'v1', characters: ['savitri'], keys: [{ at: '0:0', size: 'full', on: ['savitri'], angle: 'low', side: 'front', move: 'follow', punch: '0:1' }] },
      { id: 'S2', start: '0:6', set: 'village', light: 'day', scene: 'v1', characters: ['savitri'], transition: { type: 'crossfade', frames: 7 }, keys: [{ at: '0:6', size: 'medium', on: ['savitri'], angle: 'low', side: 'front', move: 'push', punch: '1:2' }] },
    ] }, { script, words, catalog });
    ok('follow needs moves', followNoMove.some((e) => /follow needs a moves path/.test(e)), followNoMove.join('; '));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
