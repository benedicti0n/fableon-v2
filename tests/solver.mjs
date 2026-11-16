// Framing solver unit tests: eye-line band, both fov directions, occlusion fallback order.
import { fitDistance, fovH, solveCamera, blocked } from '../cli/src/solver.js';

const measure = { standing: 1.65, seated: 1.13, eye: 1.39, eyeSeated: 0.87, head: 0.46, halfWidth: 0.28 };
const setInfo = { front: 180, bounds: { min: [-5, 0, -5], max: [5, 8, 5] } };
const subject = (id, x = 0) => ({ id, pos: [x, 0, 0], measure, scale: 1, seated: false });

export function runSolver() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  for (const size of ['close', 'medium']) {
    const r = solveCamera({ key: { at: 'a', size, move: 'hold' }, subjects: [subject('a')], setInfo });
    ok(`${size} eye line`, r.debug.eyeLine >= 0.38 && r.debug.eyeLine <= 0.42, String(r.debug.eyeLine));
  }
  const v = 45, h = fovH(v);
  ok('horizontal fov from vertical', h > 20 && h < 27, String(h));
  const dv = 1.6 / (2 * Math.tan((v * Math.PI) / 360));
  const dh = 4 / (2 * Math.tan((h * Math.PI) / 360));
  ok('both directions fit', fitDistance(1.6, 4, v) === Math.max(dv, dh) && dh > dv, `${dh} > ${dv}`);
  const box = { kind: 'box', name: 'pillar', min: [-0.2, 0.8, -1.5], max: [0.2, 1.8, -0.7] };
  const pos = [0, 1.39, -1.65], head = [0, 1.7, 0];
  ok('blocked before fallback', !!blocked(pos, head, [box]));
  const r = solveCamera({ key: { at: 'a', size: 'close', move: 'hold' }, subjects: [subject('a')], setInfo, keepout: [box] });
  ok('fallback rotates', r.debug.yawOffset !== 0, JSON.stringify(r.debug));
  ok('fallback clear', !blocked(r.key.pos, head, [box]), JSON.stringify(r.key.pos));
  const wideOne = solveCamera({ key: { at: 'a', size: 'wide', move: 'hold' }, subjects: [subject('a')], setInfo });
  ok('wide band centre', wideOne.debug.primaryHeight >= 0.18 && wideOne.debug.primaryHeight <= 0.30, String(wideOne.debug.primaryHeight));
  const ctx = { kind: 'mark', id: 'ctx', pos: [3, 1.5, 0], measure, scale: 1, seated: false };
  const withCtx = solveCamera({ key: { at: 'a', size: 'wide', move: 'hold' }, subjects: [subject('a')], context: [ctx], setInfo });
  const boxCtx = { kind: 'mark', id: 'tree', pos: [3, 1.5, 0], box: [2, 1.5, -1, 4, 9, 1], measure: { standing: 1.65, seated: 1.13, eye: 1.39, eyeSeated: 0.87, head: 0.46, halfWidth: 0.28 }, scale: 1, seated: false };
  const withBox = solveCamera({ key: { at: 'a', size: 'wide', move: 'hold' }, subjects: [subject('a')], context: [boxCtx], setInfo });
  ok('with mark box widens', withBox.debug.distance > wideOne.debug.distance, `${withBox.debug.distance} > ${wideOne.debug.distance}`);
  const bow = { kind: 'mark', id: 'bow', pos: [0, 1.5, 0], box: [-2.6, 1.5, -0.5, 2.6, 3.1, 0.5], measure: { standing: 1.65, seated: 1.13, eye: 1.39, eyeSeated: 0.87, head: 0.46, halfWidth: 0.28 }, scale: 1, seated: false };
  const ins = solveCamera({ key: { at: 'a', size: 'insert', move: 'hold' }, subjects: [bow], setInfo });
  ok('insert fills a wide prop', ins.debug.distance > 8, String(ins.debug.distance));
  ok('with context widens', withCtx.debug.distance > wideOne.debug.distance, `${withCtx.debug.distance} > ${wideOne.debug.distance}`);
  let groupMsg = ''; try { solveCamera({ key: { at: 'a', size: 'wide', move: 'hold' }, subjects: [subject('a', -5), subject('b', 5)], setInfo }); } catch (e) { groupMsg = e.message; }
  ok('group too wide hint', /group too wide/.test(groupMsg) && /split into keys/.test(groupMsg), groupMsg);
  const b = { id: 'b', pos: [0, 0, -3], measure, scale: 1, seated: false };
  const over = solveCamera({ key: { at: 'a', size: 'wide', move: 'hold', over: 'b', side: 'left' }, subjects: [subject('a')], over: b, setInfo });
  ok('over composition', over.key.over === 'b' && over.key.pos[2] < -1.2, JSON.stringify(over.key.pos));
  ok('over head lower third', !!over.debug.over && over.debug.over.top.x >= 0 && over.debug.over.top.x <= 1 && over.debug.over.center > 0.5, JSON.stringify(over.debug.over));
  const left = solveCamera({ key: { at: 'a', size: 'medium', move: 'hold', third: 'left' }, subjects: [subject('a')], setInfo });
  const centre = solveCamera({ key: { at: 'a', size: 'medium', move: 'hold' }, subjects: [subject('a')], setInfo });
  ok('third shifts look', Math.abs(left.key.look[0] - centre.key.look[0]) > 0.05, `${left.key.look[0]} vs ${centre.key.look[0]}`);
  const tilt = solveCamera({ key: { at: 'a', size: 'wide', move: 'pan' }, subjects: [subject('a')], setInfo, toLook: [2, 1, 0] });
  ok('pan target look', tilt.key.type === 'tilt' && JSON.stringify(tilt.key.lookTo) === JSON.stringify([2, 1, 0]), JSON.stringify(tilt.key.lookTo));
  const inside = { kind: 'box', name: 'wall', min: [-3, 0, -2.5], max: [3, 5, -0.5] };
  let threw = false;
  try { solveCamera({ key: { at: 'a', size: 'close', move: 'hold' }, subjects: [subject('a')], setInfo, keepout: [inside] }); } catch { threw = true; }
  ok('camera inside keep-out', threw);
  return { ok: errors.length === 0, errors, checks };
}
