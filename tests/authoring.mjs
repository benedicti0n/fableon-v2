// Anchor strings, row expansion and deterministic compilation for the authoring board compiler.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { compileBoard, expandRow, parseAnchor } from '../cli/src/authoring.js';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function runAuthoring() {
  const errors = [];
  const checks = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}${detail ? `: ${detail}` : ''}`); };
  const anchors = [
    ['13.deer', { line: 13, word: 'deer', offset: -2 }],
    ['13.deer#1+0.4s', { line: 13, word: 'deer', nth: 1, offset: 12 }],
    ['shot+1.2s', { shot: true, offset: 36 }],
    ['shot-10f', { shot: true, offset: -10 }],
    ['end+4f', { end: true, offset: 4 }],
    ['f90', { frame: 90 }],
  ];
  for (const [s, want] of anchors) {
    try { ok(`anchor ${s}`, eq(parseAnchor(s, 30), want), JSON.stringify(parseAnchor(s, 30))); }
    catch (e) { ok(`anchor ${s}`, false, e.message); }
  }
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const row = expandRow({ row: ['a', 'b', 'c', 'd', 'e'], at: 'village.front', spacing: 0.8, curve: 0.15, facing: 'camera' }, ['village'], catalog, {});
  ok('row count', row.length === 5);
  ok('row x', eq(row.map((r) => r.pos[0]), [1.6, 0.8, 0, -0.8, -1.6]), JSON.stringify(row.map((r) => r.pos[0])));
  ok('row curve', eq(row.map((r) => r.pos[2].toFixed(2)), ['-24.20', '-24.35', '-24.50', '-24.35', '-24.20']), JSON.stringify(row.map((r) => r.pos[2])));

  const words = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'words.json'), 'utf8'));
  const board = {
    version: 1,
    cast: { kunti: { spec: 'C.kunti' } },
    shots: [{
      id: 'test', start: '1.Vyasa', light: 'day', sets: ['village'],
      camera: [{ raw: { at: '1.Vyasa', type: 'fixed', pos: [0, 2, 0], look: [0, 1.5, -5], fov: 40 } }],
      actors: [{ cast: 'kunti', id: 'kunti', at: 'village.front', pose: 'stir', says: ['2.His', '2.His+0.4s'] }],
    }],
  };
  const a = compileBoard(board, words, catalog);
  const b = compileBoard(board, words, catalog);
  ok('compile deterministic', eq(a.storyboard, b.storyboard));
  ok('compiled shot', a.storyboard.shots.length === 1 && a.storyboard.shots[0].actors.length === 1);
  ok('compiled talk beats', a.storyboard.shots[0].actors[0].beats?.length === 2);
  ok('compiled cast', a.storyboard.cast.kunti?.spec === 'C.kunti');
  const rideBoard = {
    version: 1, cast: { satyavati: { spec: 'C.satyavati' } },
    shots: [{ id: 'R', start: '5.Her', light: 'day', sets: ['village'], actors: [{ cast: 'satyavati', id: 'satyavati', ride: 'boat', nudge: [0, 0.12, 0] }], set: [{ piece: 'boat', id: 'boat', motion: { type: 'path', keys: [['shot', 'village.front'], ['shot+2s', 'village.front']] } }], camera: [{ at: '5.Her', size: 'wide', on: ['satyavati'], move: 'hold' }] }],
  };
  const ride = compileBoard(rideBoard, words, catalog).storyboard.shots[0].actors[0];
  ok('ride compiles', ride.ride === 'boat' && JSON.stringify(ride.rideOffset) === '[0,0.12,0]', JSON.stringify(ride));
  let glideMsg = '';
  try { compileBoard({ version: 1, cast: { kunti: { spec: 'C.kunti' } }, shots: [{ id: 'G', start: '1.Vyasa', light: 'day', sets: ['village'], actors: [{ cast: 'kunti', id: 'kunti', at: 'village.front' }], camera: [{ at: '1.Vyasa', size: 'medium', on: ['kunti'], move: 'glide', cut: true }] }] }, words, catalog); } catch (e) { glideMsg = e.message; }
  ok('glide with cut rejected', /glide\/crane cannot be combined with cut/.test(glideMsg), glideMsg);
  const faceBoard = (side, over = false) => ({ version: 1, cast: { pandu: { spec: 'C.pandu' }, deer: { spec: { skin: '#b9773f' } } }, shots: [{ id: 'F', start: '13.Pandu', light: 'day', sets: ['deer'], actors: [{ cast: 'pandu', id: 'pandu', at: 'deer.deer', nudge: [0, 0, 2], prop: 'bowDrawn', ...(over ? {} : { face: 'deer' }) }, { cast: 'deer', id: 'deer', special: 'deer', at: 'deer.deer' }], camera: [{ at: '13.Pandu', size: 'wide', on: ['deer'], side, move: 'hold', ...(over ? { over: 'pandu' } : {}) }] }] });
  const faceBeat = (side, over = false) => compileBoard(faceBoard(side, over), words, catalog).storyboard.shots[0].actors.find((a) => a.id === 'pandu').beats?.find((b) => b.facing !== undefined);
  const fl = faceBeat('left'), fr = faceBeat('right');
  ok('face flips across the line', !!fl && !!fr && fl.mirror !== fr.mirror, JSON.stringify([fl, fr]));
  ok('face aims the prop', !!fl && fl.facing !== 0 && fl.look !== 0, JSON.stringify(fl));
  const auto = faceBeat('left', true);
  ok('over auto-face', !!auto && (auto.facing !== 0 || auto.mirror), JSON.stringify(auto));
  const semantic = { ...board, shots: [{ ...board.shots[0], camera: [{ at: '1.Vyasa', size: 'close', on: ['kunti'], move: 'hold' }] }] };
  const cam = compileBoard(semantic, words, catalog).storyboard.shots[0].camera[0];
  ok('semantic camera solved', cam.type === 'dolly' && cam.fov === 37 && cam.push?.rate === 0.0015);
  ok('semantic camera dof', compileBoard(semantic, words, catalog).storyboard.shots[0].dof?.[0]?.cInf === 13);
  return { ok: errors.length === 0, errors, checks };
}
