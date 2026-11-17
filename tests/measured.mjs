// Measured coverage checks: the hand-written S27 keys produce blocker/size warnings, not errors.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { checkFramesMeasured } from '../cli/src/frames.js';
import { compileBoard } from '../cli/src/authoring.js';

export async function runMeasured() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-measured-'));
  try {
    const fix = join(ROOT, 'fixtures', 'adi-parva');
    copyFileSync(join(fix, 'words.json'), join(tmp, 'words.json'));
    const sb = JSON.parse(readFileSync(join(fix, 'storyboard.json'), 'utf8'));
    sb.shots = sb.shots.filter((s) => s.id === 'S27');
    sb.shots[0].end = { frame: 2673 };
    writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(sb, null, 2));
    const r = await checkFramesMeasured(tmp);
    ok('measured ran', r.measured && r.keys.length > 0, `${r.keys.length} keys`);
    ok('v1 findings are warnings', r.errors.length === 0, `${r.errors.length} errors`);
    ok('blocker measured', r.warnings.some((w) => w.code === 'blocker'), JSON.stringify(r.warnings.slice(0, 2)));
    ok('size measured', r.warnings.some((w) => w.code === 'subject too small' || w.code === 'subject too large'), 'no size warning');

    const authoring = join(ROOT, 'fixtures', 'adi-parva-authoring');
    copyFileSync(join(authoring, 'words.json'), join(tmp, 'words.json'));
    copyFileSync(join(authoring, 'storyboard.json'), join(tmp, 'storyboard.json'));
    const clean = await checkFramesMeasured(tmp);
    ok('authoring board 0/0', clean.errors.length === 0 && clean.warnings.length === 0, `${clean.errors.length} errors, ${clean.warnings.length} warnings: ${[...clean.errors, ...clean.warnings].map((x) => x.message).slice(0, 3).join('; ')}`);

    const baseBoard = JSON.parse(readFileSync(join(authoring, 'board.json'), 'utf8'));
    const aw = JSON.parse(readFileSync(join(authoring, 'words.json'), 'utf8'));
    const cat = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
    writeFileSync(join(tmp, 'words.json'), JSON.stringify(aw));
    const shotBoard = (id, edit) => { const b = structuredClone(baseBoard); b.shots = b.shots.filter((s) => s.id === id); edit(b.shots[0], b); return b; };
    const runBoard = async (board) => { writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(compileBoard(board, aw, cat).storyboard)); return checkFramesMeasured(tmp); };

    const tangent = await runBoard(shotBoard('S27', (s) => { for (const i of [0, 3]) { s.camera[i].side = 'front'; s.camera[i].angle = 'eye'; } }));
    ok('tangent rule fires', tangent.errors.some((e) => e.code === 'tangent'), JSON.stringify(tangent.errors.map((e) => e.code)));

    const edge = await runBoard(shotBoard('L5', (s) => { s.actors.find((a) => a.cast === 'satyavati').nudge = [1.5, 0, -0.5]; }));
    ok('edge intruder rule fires', edge.warnings.some((w) => w.code === 'edge intruder' && w.subject === 'satyavati'), JSON.stringify(edge.warnings.filter((w) => w.code === 'edge intruder')));

    const cut = await runBoard(shotBoard('L16', (s) => { const xs = [-1.6, -0.8, 0, 0.8, 1.6]; for (const [i, a] of s.actors.entries()) { a.nudge = [xs[i], 0, 0]; a.scale = 1; delete a.appear; } }));
    ok('cut subject rule fires', cut.errors.some((e) => e.code === 'cut subject'), JSON.stringify(cut.errors.map((e) => e.code)));

    const face = await runBoard(shotBoard('S38', (s) => { s.camera[1].size = 'wide'; s.camera[1].with = ['forestFire']; }));
    ok('face too small rule fires', face.errors.some((e) => e.code === 'face too small' && e.subject === 'agni'), JSON.stringify(face.errors.map((e) => e.code)));

    const entrance = await runBoard(shotBoard('S14', (s) => { s.camera[3].on = ['pandu']; const k = s.actors.find((a) => a.cast === 'kunti'); k.nudge = [-8, 0, 0]; }));
    ok('entrance off-screen rule fires', entrance.errors.some((e) => e.code === 'entrance off-screen' && e.subject === 'kunti'), JSON.stringify(entrance.errors.map((e) => e.code)));

    const over = await runBoard(shotBoard('S14', (s) => {
      s.end = '13.deer+0.1s';
      s.camera = [{ at: '13.Pandu', size: 'wide', on: ['deer'], over: 'pandu', angle: 'eye', side: 'left', move: 'hold' }];
      s.actors.find((a) => a.cast === 'pandu').nudge = [0, 0, 4];
    }));
    ok('screen-space over passes', ![...over.errors, ...over.warnings].some((e) => e.code === 'over not foreground'), JSON.stringify([...over.errors, ...over.warnings].map((e) => e.code)));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
