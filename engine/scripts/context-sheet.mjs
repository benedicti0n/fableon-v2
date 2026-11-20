// Render the F4 context sheet: every iconography preset and new pose in the arena, day and golden, 1440x2560.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBoard } from '../../cli/src/authoring.js';
import { RENDER_CJS, ROOT, findPython, run } from '../../cli/src/env.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'schema/catalog.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'fableon-context-'));
const OUT = join(ROOT, 'docs', 'reports', 'phase-7', 'context-sheet.jpg');
const BASE = { skin: '#c98c5c', build: 'adult', top: '#c8342e', lower: '#f2e6c4', border: '#e8b53a', head: 'hair', hairCol: '#1e1418' };
const POSES = ['kneel', 'pranam', 'lie', 'fallen', 'sleep', 'strike', 'guard', 'blowConch', 'drive', 'ride', 'dance', 'weep', 'lift'];
const EXPRS = ['angry', 'sad', 'smirk', 'determined', 'sleepy'];
const PROPS = { strike: 'sword', guard: 'shield', blowConch: 'conch', drive: null, ride: 'sword', dance: null, weep: null, lift: 'chakra', fallen: 'sword' };
const presets = catalog.iconography ?? [];
const items = [
  ...presets.map((p) => ({ id: `preset-${p.name}`, name: p.name, kind: 'preset', spec: p.spec, pose: 'stand', expr: p.name === 'shakuni' ? 'smirk' : 'neutral', prop: (p.props ?? [])[0] ?? null })),
  ...POSES.map((pose) => ({ id: `pose-${pose}`, name: pose, kind: 'pose', spec: { ...BASE, top: '#c8342e' }, pose, expr: pose === 'weep' ? 'sad' : pose === 'sleep' || pose === 'fallen' ? 'sleepy' : 'neutral', prop: PROPS[pose] ?? null })),
  ...EXPRS.map((expr) => ({ id: `expr-${expr}`, name: `expression: ${expr}`, kind: 'expression', spec: { ...BASE, top: '#2f8a8a', head: 'crownSmall' }, pose: 'stand', expr, prop: null })),
];
const words = Array.from({ length: 420 }, (_, i) => ({ w: `w${i}`, a: +(i * 0.8).toFixed(2), b: +(i * 0.8 + 0.7).toFixed(2), line: 0 }));
const cast = Object.fromEntries(items.map((it) => [it.id, { spec: it.spec }]));
const shots = [];
items.forEach((it, i) => {
  for (const light of ['day', 'golden']) {
    const n = shots.length;
    const start = `f${n * 90}`, end = `f${(n + 1) * 90}`;
    shots.push({
      id: `${it.id}-${light}-${i}`, start, end, light, sets: ['arena'],
      look: { mood: light === 'day' ? 'noon' : 'golden-glow' },
      actors: [{ cast: it.id, at: 'arena.floor', nudge: [0.8, 0, 2], pose: it.pose, expr: it.expr, prop: it.prop, facing: 'camera', scale: it.kind === 'expression' ? 1.8 : 1 }],
      camera: [{ at: start, size: ['pranam', 'lie', 'fallen', 'sleep', 'strike', 'guard', 'dance', 'lift'].includes(it.pose) ? 'wide' : 'medium', on: [it.id], move: 'hold', side: 'front', angle: 'eye' }],
    });
  }
});
const storyboard = compileBoard({ version: 1, cast, shots }, words, catalog).storyboard;
items.forEach((it, i) => {
  for (let j = 0; j < 2; j++) {
    const cam = storyboard.shots[i * 2 + j].camera[0];
    const k = 1;
    cam.pos = [cam.look[0] + (cam.pos[0] - cam.look[0]) * k, cam.look[1] + (cam.pos[1] - cam.look[1]) * k, cam.look[2] + (cam.pos[2] - cam.look[2]) * k];
  }
});
writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(storyboard, null, 2) + '\n');
writeFileSync(join(tmp, 'words.json'), JSON.stringify(words) + '\n');
writeFileSync(join(tmp, 'project.json'), JSON.stringify({ version: 1, id: 'context', title: 'Context', topic: 'Context', seconds: 340, language: 'en', voice: {}, models: {}, autopilot: false, look: { featureRim: true }, style: 'toon3d' }) + '\n');
const frames = items.flatMap((it, i) => [i * 2 * 90 + 45, (i * 2 + 1) * 90 + 45]);
const prefix = join(tmp, 'crop-');
await run(process.execPath, [RENDER_CJS, 'stills', '--out', prefix, '--frames', frames.join(','), '--project', tmp, '--size', '1440x2560', '--msaa', '0'], { cwd: ROOT });
const manifest = items.map((it, i) => ({ name: it.name, kind: it.kind, day: `${prefix}${i * 2 * 90 + 45}.jpg`, golden: `${prefix}${(i * 2 + 1) * 90 + 45}.jpg` }));
const manifestFile = join(tmp, 'manifest.json');
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
const py = findPython();
if (!py) throw new Error('context sheet needs Python/Pillow');
mkdirSync(dirname(OUT), { recursive: true });
const script = join(tmp, 'compose.py');
writeFileSync(script, readFileSync(join(root, 'scripts', 'context-sheet.py'), 'utf8'));
await run(py, [script, manifestFile, OUT], { cwd: ROOT });
console.log(`context sheet: ${OUT}`);
rmSync(tmp, { recursive: true, force: true });
