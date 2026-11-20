// Character kit: catalog presets, cast preference, pose measures and drawing smoke tests for every new field.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { applyIconography, castErrors } from '../cli/src/stages/cast.js';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

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
    ok('pose measures keep the eye inside the body', poses.every((p) => { const m = poseMeasure(p, stand); return m.eye > 0 && m.eye < m.standing + 0.2; }), JSON.stringify(poses.map((p) => [p, poseMeasure(p, stand).eye, poseMeasure(p, stand).standing])));
    ok('every new pose has an envelope', poses.every((p) => !!POSE_MEASURES[p]), JSON.stringify(Object.keys(POSE_MEASURES)));

    const presets = catalog.iconography ?? [];
    ok('all 15 iconography presets exist', presets.length === 15, String(presets.length));
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

    const sheet = join(ROOT, 'docs', 'reports', 'phase-7', 'kit-sheet.jpg');
    ok('the kit review sheet is committed', existsSync(sheet) && statSync(sheet).size > 100_000, String(existsSync(sheet) ? statSync(sheet).size : 0));
  } catch (e) {
    errors.push(e.message);
  }
  return { ok: errors.length === 0, errors, checks };
}
