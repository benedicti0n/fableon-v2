// Visibility-aware framing: invisible subjects fail; `later` waits for entry; moving subjects use a union of samples.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { compileBoard } from '../cli/src/authoring.js';
import { solveCamera } from '../cli/src/solver.js';

export function runVisibility() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const words = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'words.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const base = {
    version: 1,
    cast: { kunti: { spec: 'C.kunti' } },
    shots: [{
      id: 'T', start: '5.Her', sets: ['village'], light: 'day',
      actors: [{ cast: 'kunti', id: 'kunti', at: 'village.front', enter: '5.demand', exit: '5.son' }],
      camera: [{ at: '5.Her', size: 'medium', on: ['kunti'], move: 'hold' }],
    }],
  };
  let msg = '';
  try { compileBoard(base, words, catalog); } catch (e) { msg = e.message; }
  ok('invisible subject errors', /not visible at 5\.Her/.test(msg), msg);
  const later = JSON.parse(JSON.stringify(base));
  later.shots[0].camera[0].later = ['kunti'];
  later.shots[0].camera[0].at = '5.Her';
  let lateOk = true;
  try { compileBoard(later, words, catalog); } catch (e) { lateOk = false; msg = e.message; }
  ok('later subject accepted', lateOk, msg);
  const measure = catalog.measure.pigeon;
  ok('effect measure exists', measure && measure.standing > 0 && measure.description.length > 0);
  const m = { standing: 1.65, seated: 1.13, eye: 1.39, eyeSeated: 0.87, head: 0.46, halfWidth: 0.28 };
  const setInfo = { front: 180, bounds: { min: [-5, 0, -5], max: [5, 8, 5] } };
  const s1 = solveCamera({ key: { at: 'a', size: 'wide', move: 'hold' }, subjects: [{ id: 'a', pos: [0, 0, 0], measure: m, scale: 1, seated: false }], setInfo });
  const s2 = solveCamera({ key: { at: 'a', size: 'wide', move: 'hold' }, subjects: [{ id: 'a', pos: [0, 0, 0], samples: [[0, 0, 0], [4, 0, 0]], measure: m, scale: 1, seated: false }], setInfo });
  ok('moving union widens', s2.debug.distance > s1.debug.distance, `${s2.debug.distance} > ${s1.debug.distance}`);
  return { ok: errors.length === 0, errors, checks };
}
