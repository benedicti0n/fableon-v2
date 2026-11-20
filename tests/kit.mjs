// Character kit: catalog presets, cast preference, pose measures and drawing smoke tests for every new field.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { applyIconography, castErrors } from '../cli/src/stages/cast.js';
import { compileBoard } from '../cli/src/authoring.js';
import { checkFramesMeasured } from '../cli/src/frames.js';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import pw from '../engine/node_modules/playwright/index.js';

export async function runKitTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema/catalog.json'), 'utf8'));
  const smokeFile = join(ROOT, 'engine', 'dist', 'kit-smoke.mjs');
  await build({ entryPoints: [join(ROOT, 'engine', 'src', 'kit-smoke.ts')], bundle: true, format: 'esm', outfile: smokeFile, logLevel: 'error' });
  const { poseMeasure, POSE_MEASURES } = await import(pathToFileURL(smokeFile).href);
  const base = { skin: '#c98c5c', build: 'adult', top: '#2f8a8a', lower: '#f2e6c4', head: 'hair' };
  try {
    const poses = ['kneel', 'pranam', 'lie', 'fallen', 'sleep', 'strike', 'guard', 'blowConch', 'drive', 'ride', 'dance', 'weep', 'lift'];
    const exprs = ['angry', 'sad', 'smirk', 'determined', 'sleepy'];
    const props = ['conch', 'flute', 'chakra', 'sword', 'shield', 'dice', 'trident', 'lotus', 'bowl', 'pestle', 'plough', 'umbrella', 'chamara', 'banner'];
    ok('every new pose is in the catalog', poses.every((p) => catalog.poses.some((x) => x.name === p)), JSON.stringify(catalog.poses.map((p) => p.name)));
    ok('every new expression is in the catalog', exprs.every((p) => catalog.expressions.some((x) => x.name === p)), JSON.stringify(catalog.expressions.map((p) => p.name)));
    ok('every new prop is in the catalog', props.every((p) => catalog.props.some((x) => x.name === p)), JSON.stringify(catalog.props.map((p) => p.name)));

    const stand = { description: 'adult', standing: 1.8, seated: 1.1, eye: 1.62, eyeSeated: 0.95, head: 0.26, halfWidth: 0.42 };
    const lie = poseMeasure('lie', stand);
    ok('pose measures reduce the lying height', lie.standing < stand.standing && lie.halfWidth > stand.halfWidth, JSON.stringify({ stand, lie }));
    ok('pose measures keep a positive, bounded eye line', poses.every((p) => { const m = poseMeasure(p, stand); return m.eye > 0 && m.eye < m.standing * 1.8; }), JSON.stringify(poses.map((p) => [p, poseMeasure(p, stand).eye, poseMeasure(p, stand).standing])));
    ok('every new pose has an envelope', poses.every((p) => !!POSE_MEASURES[p]), JSON.stringify(Object.keys(POSE_MEASURES)));

    const presets = catalog.iconography ?? [];
    ok('all 16 iconography presets exist', presets.length === 16, String(presets.length));
    ok('preset names are unique', new Set(presets.map((p) => p.name)).size === presets.length, JSON.stringify(presets.map((p) => p.name)));
    for (const p of presets) {
      const script = { characters: [{ id: p.name, name: p.name }], mentions: [] };
      const errs = castErrors({ version: 1, characters: [{ id: p.name, name: p.name, spec: p.spec, mustHave: p.mustHave, notes: '' }] }, script, catalog);
      ok(`preset ${p.name} is a valid cast spec`, errs.length === 0, errs.join('; '));
    }
    const krishna = presets.find((p) => p.name === 'krishna');
    const applied = applyIconography({ characters: [{ id: 'krishna', name: 'कृष्ण', spec: { ...base }, mustHave: ['young-man'], notes: '' }] }, { characters: [{ id: 'krishna', name: 'कृष्ण' }] }, catalog);
    ok('the cast stage prefers the Krishna preset', applied.characters[0].spec.head === 'featherCrown' && applied.characters[0].mustHave.includes('indigo-skin'), JSON.stringify(applied.characters[0]));
    ok('iconography presets carry props for the shot planner', krishna?.props?.includes('flute'), JSON.stringify(krishna?.props));

    const maskFile = join(ROOT, 'engine', 'dist', 'pose-mask.js');
    const exprFile = join(ROOT, 'engine', 'dist', 'expression-diff.js');
    await build({ entryPoints: [join(ROOT, 'engine', 'src', 'pose-mask.ts')], bundle: true, format: 'iife', outfile: maskFile, logLevel: 'error' });
    await build({ entryPoints: [join(ROOT, 'engine', 'src', 'expression-diff.ts')], bundle: true, format: 'iife', outfile: exprFile, logLevel: 'error' });
    const browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body><script>${readFileSync(maskFile, 'utf8')}</script><script>${readFileSync(exprFile, 'utf8')}</script></body></html>`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
      const rows = await page.evaluate(() => window.poseIoU());
      const stand = rows.filter((r) => r.a === 'stand');
      const pair = rows.filter((r) => r.a !== 'stand');
      ok('every new pose differs from stand (IoU < 0.85)', stand.every((r) => r.iou < 0.85), JSON.stringify(stand));
      ok('every pair of new poses differs (IoU < 0.85)', pair.every((r) => r.iou < 0.85), JSON.stringify(pair.filter((r) => r.iou >= 0.85)));
      const exprRows = await page.evaluate(() => window.expressionDiff());
      const newExprs = new Set(['angry', 'sad', 'smirk', 'determined', 'sleepy']);
      const facePairs = exprRows.filter((r) => newExprs.has(r.a) || newExprs.has(r.b));
      ok('every new expression differs in the face region', facePairs.every((r) => r.changed >= 200 && r.mad >= 0.4), JSON.stringify(facePairs.filter((r) => r.changed < 200 || r.mad < 0.4)));
    } finally { await browser.close(); }

    const frameDir = mkdtempSync(join(tmpdir(), 'fableon-pose-frame-'));
    try {
      const words = Array.from({ length: 40 }, (_, i) => ({ w: `w${i}`, a: i * 0.5, b: i * 0.5 + 0.4, line: 0 }));
      const frameShots = poses.map((pose, i) => ({ id: `p${i}`, start: `f${i * 90}`, end: `f${(i + 1) * 90}`, light: 'day', sets: ['village'], actors: [{ cast: 'p', at: 'village.front', pose, expr: 'neutral', facing: 'camera' }], camera: [{ at: `f${i * 90}`, size: 'medium', on: ['p'], move: 'hold', side: 'front', angle: 'eye' }] }));
      const board = { version: 1, cast: { p: { spec: { ...base, top: '#c8342e' } } }, shots: frameShots };
      const sb = compileBoard(board, words, catalog).storyboard;
      writeFileSync(join(frameDir, 'storyboard.json'), JSON.stringify(sb, null, 2) + '\n');
      writeFileSync(join(frameDir, 'words.json'), JSON.stringify(words));
      const measured = await checkFramesMeasured(frameDir);
      const framing = measured.errors.filter((e) => ['edge', 'head cut', 'blocker', 'subject hidden', 'cut subject', 'face too small'].includes(e.code));
      ok('the solver frames every new pose at medium size', framing.length === 0, JSON.stringify(framing.slice(0, 6)));
    } finally { rmSync(frameDir, { recursive: true, force: true }); }

    const variantWords = [{ w: 'one', a: 0, b: 1, line: 0 }, { w: 'two', a: 1, b: 2, line: 1 }, { w: 'three', a: 2, b: 3, line: 1 }];
    const variantBoard = { version: 1, cast: { k: { spec: { ...base, head: 'hair' }, variants: [{ at: '1:0', name: 'crowned', spec: { ...base, head: 'crownSmall' } }] } }, shots: [
      { id: 'a', start: '0:0', end: '1:0', light: 'day', sets: ['village'], actors: [{ cast: 'k', id: 'k', at: 'village.front', pose: 'stand', expr: 'neutral' }], camera: [{ at: '0:0', size: 'medium', on: ['k'], move: 'hold', side: 'front', angle: 'eye' }] },
      { id: 'b', start: '1:0', end: 'end', light: 'day', sets: ['village'], actors: [{ cast: 'k', id: 'k', at: 'village.front', pose: 'stand', expr: 'neutral' }], camera: [{ at: '1:0', size: 'medium', on: ['k'], move: 'hold', side: 'front', angle: 'eye' }] },
    ] };
    const variantSb = compileBoard(variantBoard, variantWords, catalog).storyboard;
    ok('costume variants switch at the word anchor', variantSb.shots[0].actors[0].who === 'k' && variantSb.shots[0].actors[0].variants?.[0]?.who === 'k@crowned', JSON.stringify(variantSb.shots.map((s) => s.actors[0])));
    ok('the variant spec is compiled into the cast', variantSb.cast['k@crowned']?.spec?.head === 'crownSmall', JSON.stringify(variantSb.cast['k@crowned']));

    const sheet = join(ROOT, 'docs', 'reports', 'phase-7', 'kit-sheet.jpg');
    ok('the kit review sheet is committed', existsSync(sheet) && statSync(sheet).size > 100_000, String(existsSync(sheet) ? statSync(sheet).size : 0));
  } catch (e) {
    errors.push(e.message);
  }
  return { ok: errors.length === 0, errors, checks };
}
