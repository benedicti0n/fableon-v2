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
    const animalFile = join(ROOT, 'engine', 'dist', 'special-bounds.js');
    await build({ entryPoints: [join(ROOT, 'engine', 'src', 'pose-mask.ts')], bundle: true, format: 'iife', outfile: maskFile, logLevel: 'error' });
    await build({ entryPoints: [join(ROOT, 'engine', 'src', 'expression-diff.ts')], bundle: true, format: 'iife', outfile: exprFile, logLevel: 'error' });
    await build({ entryPoints: [join(ROOT, 'engine', 'src', 'special-bounds.ts')], bundle: true, format: 'iife', outfile: animalFile, logLevel: 'error' });
    const browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body><script>${readFileSync(maskFile, 'utf8')}</script><script>${readFileSync(exprFile, 'utf8')}</script><script>${readFileSync(animalFile, 'utf8')}</script></body></html>`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
      const rows = await page.evaluate(() => window.poseIoU());
      const stand = rows.filter((r) => r.a === 'stand');
      const pair = rows.filter((r) => r.a !== 'stand');
      ok('every new pose differs from stand (IoU < 0.85)', stand.every((r) => r.iou < 0.85), JSON.stringify(stand));
      ok('every pair of new poses differs (IoU < 0.85)', pair.every((r) => r.iou < 0.85), JSON.stringify(pair.filter((r) => r.iou >= 0.85)));
      const animalRows = await page.evaluate(() => window.specialBounds());
      const animals = ['horse', 'elephant', 'cow', 'calf', 'dog', 'monkey', 'crane', 'boar', 'mongoose', 'swan', 'owl', 'crow', 'python'];
      ok('every animal has a catalog measure', animals.every((a) => catalog.specials.some((x) => x.name === a) && catalog.measure[a]), JSON.stringify(animals.filter((a) => !catalog.measure[a])));
      ok('animal measures match the drawn silhouettes', animals.every((a) => { const r = animalRows.find((x) => x.name === a), m = catalog.measure[a]; return r && Math.abs(r.standing - m.standing) < 0.02 && Math.abs(r.halfWidth - m.halfWidth) < 0.02; }), JSON.stringify(animalRows.filter((r) => { const m = catalog.measure[r.name]; return !m || Math.abs(r.standing - m.standing) >= 0.02 || Math.abs(r.halfWidth - m.halfWidth) >= 0.02; })));
      ok('animal cards stay inside their frame', animalRows.every((r) => r.bounds.minY >= 0 && r.bounds.maxY <= 1000 && r.bounds.minX >= 0 && r.bounds.maxX <= 1000), JSON.stringify(animalRows.filter((r) => r.bounds.maxY > 1000 || r.bounds.maxX > 1000)));
      ok('the Hanuman preset differs from the plain monkey', animalRows.find((r) => r.name === 'hanuman').pixels > animalRows.find((r) => r.name === 'monkey').pixels * 1.02, JSON.stringify(animalRows.filter((r) => r.name === 'hanuman' || r.name === 'monkey')));
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

    const mountWords = Array.from({ length: 40 }, (_, i) => ({ w: `m${i}`, a: i * 0.5, b: i * 0.5 + 0.4, line: 0 }));
    const mountBase = { ...base, top: '#c0392b' };
    const mountSpec = { spec: { skin: '#8a2f24' } };
    const mountShots = [['horse', 'rider', 'medium'], ['elephant', 'driver', 'medium'], ['chariot', 'driver', 'wide']].map(([special, seat, size], i) => ({
      id: `mount${i}`, start: `f${i * 90}`, end: `f${(i + 1) * 90}`, light: 'day', sets: ['arena'], look: { mood: 'warm-side' },
      actors: [
        { cast: 'mount', special, id: 'mount', at: 'arena.floor', params: {} },
        { cast: 'rider', id: 'rider', ride: 'mount', seat, pose: seat === 'driver' ? 'drive' : 'ride', facing: 'camera' },
      ],
      camera: [{ at: `f${i * 90}`, size, on: ['rider'], move: 'hold', side: 'front', angle: 'eye' }],
    }));
    const mountBoard = { version: 1, cast: { mount: mountSpec, rider: { spec: mountBase } }, shots: mountShots };
    const mountSb = compileBoard(mountBoard, mountWords, catalog).storyboard;
    ok('mounts resolve seats into ride offsets', mountSb.shots.every((s) => s.actors[1].rideOffset?.length === 3), JSON.stringify(mountSb.shots.map((s) => s.actors[1])));
    ok('the solver frames the mount and rider as one subject', mountSb.shots.every((s) => s.camera[0].subjects.includes('rider') && s.camera[0].subjects.includes('mount')), JSON.stringify(mountSb.shots.map((s) => s.camera[0].subjects)));
    const mountDir = mkdtempSync(join(tmpdir(), 'fableon-mount-frame-'));
    try {
      writeFileSync(join(mountDir, 'storyboard.json'), JSON.stringify(mountSb, null, 2) + '\n');
      writeFileSync(join(mountDir, 'words.json'), JSON.stringify(mountWords));
      const measured = await checkFramesMeasured(mountDir);
      const framing = measured.errors.filter((e) => ['edge', 'head cut', 'blocker', 'subject hidden', 'cut subject', 'face too small', 'group too wide'].includes(e.code));
      ok('the solver frames horse, elephant and chariot mounts', framing.length === 0, JSON.stringify(framing.slice(0, 6)));
    } finally { rmSync(mountDir, { recursive: true, force: true }); }
    let seatError = '';
    try {
      compileBoard({ version: 1, cast: { mount: mountSpec, rider: { spec: mountBase } }, shots: [{ ...mountShots[0], actors: [{ ...mountShots[0].actors[0] }, { ...mountShots[0].actors[1], seat: 'roof' }] }] }, mountWords, catalog);
    } catch (e) { seatError = e.message; }
    ok('the validator rejects an unknown mount seat', /asks for seat "roof"/.test(seatError), seatError);

    const variantWords = [{ w: 'one', a: 0, b: 1, line: 0 }, { w: 'two', a: 1, b: 2, line: 1 }, { w: 'three', a: 2, b: 3, line: 1 }];
    const variantBoard = { version: 1, cast: { k: { spec: { ...base, head: 'hair' }, variants: [{ at: '1:0', name: 'crowned', spec: { ...base, head: 'crownSmall' } }] } }, shots: [
      { id: 'a', start: '0:0', end: '1:0', light: 'day', sets: ['village'], actors: [{ cast: 'k', id: 'k', at: 'village.front', pose: 'stand', expr: 'neutral' }], camera: [{ at: '0:0', size: 'medium', on: ['k'], move: 'hold', side: 'front', angle: 'eye' }] },
      { id: 'b', start: '1:0', end: 'end', light: 'day', sets: ['village'], actors: [{ cast: 'k', id: 'k', at: 'village.front', pose: 'stand', expr: 'neutral' }], camera: [{ at: '1:0', size: 'medium', on: ['k'], move: 'hold', side: 'front', angle: 'eye' }] },
    ] };
    const variantSb = compileBoard(variantBoard, variantWords, catalog).storyboard;
    ok('costume variants switch at the word anchor', variantSb.shots[0].actors[0].who === 'k' && variantSb.shots[0].actors[0].variants?.[0]?.who === 'k@crowned', JSON.stringify(variantSb.shots.map((s) => s.actors[0])));
    ok('the variant spec is compiled into the cast', variantSb.cast['k@crowned']?.spec?.head === 'crownSmall', JSON.stringify(variantSb.cast['k@crowned']));

    const sheet = join(ROOT, 'docs', 'reports', 'phase-7', 'kit-sheet.jpg');
    const animalSheet = join(ROOT, 'docs', 'reports', 'phase-7', 'animals-sheet.jpg');
    ok('the kit review sheet is committed', existsSync(sheet) && statSync(sheet).size > 100_000, String(existsSync(sheet) ? statSync(sheet).size : 0));
    ok('the animals review sheet is committed', existsSync(animalSheet) && statSync(animalSheet).size > 100_000, String(existsSync(animalSheet) ? statSync(animalSheet).size : 0));
  } catch (e) {
    errors.push(e.message);
  }
  return { ok: errors.length === 0, errors, checks };
}
