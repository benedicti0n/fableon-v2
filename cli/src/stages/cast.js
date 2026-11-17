// Cast stage: design every character/mention, check visual distinctness, write asset gaps and render the cast sheet.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RENDER_CJS, ROOT, findPython, run } from '../env.js';
import { atomicWrite, backupBeforeWrite, validationErrors, writeJsonArtifact } from '../core/artifacts.js';
import { compileBoard } from '../authoring.js';
import { CAST } from './prompts.js';

const HEX = /^#[0-9a-f]{6}$/i;
const simpleClothes = (s) => !!s.lower && !s.top && !s.drape;
const TRAITS = {
  'dark-skin': { field: 'skin', ok: (s) => HEX.test(s.skin ?? '') && luminance(s.skin) < 0.12, hint: 'skin must be a dark hex colour' },
  'red-attire': { field: 'top/sari/drape', ok: hasRedGarment, hint: 'top, sari or drape must be red' },
  crown: { field: 'head', ok: (s) => s.head === 'crown' || s.head === 'crownSmall', hint: 'head must be crown or crownSmall' },
  woman: { field: 'sari', ok: (s) => !!s.sari, hint: 'sari must be set' },
  sari: { field: 'sari', ok: (s) => !!s.sari, hint: 'sari must be set' },
  'long-hair': { field: 'head', ok: (s) => s.head === 'long', hint: 'head must be long' },
  young: { field: 'build', ok: (s) => ['kid', 'adult', 'slim'].includes(s.build), hint: 'build must be kid, adult or slim' },
  'young-man': { field: 'build', ok: (s) => ['kid', 'adult', 'slim'].includes(s.build), hint: 'build must be kid, adult or slim' },
  'forest-clothes': { field: 'lower/top/drape', ok: simpleClothes, hint: 'lower must be set and top/drape null' },
  'simple-clothes': { field: 'lower/top/drape', ok: simpleClothes, hint: 'lower must be set and top/drape null' },
  sage: { field: 'build', ok: (s) => s.build === 'elder', hint: 'build must be elder' },
  topknot: { field: 'head', ok: (s) => s.head === 'topknot', hint: 'head must be topknot' },
  beard: { field: 'beard/beardLong', ok: (s) => !!s.beard && s.beardLong === true, hint: 'beard must be set and beardLong true' },
  princess: { field: 'sari', ok: (s) => !!s.sari, hint: 'sari must be set' },
  god: { field: 'head', ok: (s) => s.head === 'crown' || s.head === 'crownSmall', hint: 'head must be crown or crownSmall' },
};

const normTrait = (t) => String(t).trim().toLowerCase().replace(/[\s_]+/g, '-');
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function luminance(hex) { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function hasRedGarment(s) {
  return [s.top, s.sari, s.drape].some((c) => HEX.test(c ?? '') && (() => { const [r, g, b] = rgb(c); return r > 100 && r > g * 1.4 && r > b * 1.4; })());
}
const primaryGarment = (s) => s.sari ?? s.drape ?? s.top ?? s.lower ?? '#000000';

function lab(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a, b) => {
  if (!HEX.test(a ?? '') || !HEX.test(b ?? '')) return 0;
  const x = lab(a), y = lab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000; };
const castKeySpec = (key, catalog) => {
  const [group, ...rest] = String(key).split('.');
  const list = catalog.cast?.[group];
  return list?.find((e) => e.name === rest.join('.'))?.spec ?? null;
};
const specOf = (c, catalog) => c.spec ?? (c.cast ? castKeySpec(c.cast, catalog) : null);

/** Colour/build/head distinctness and every mustHave trait. */
export function castErrors(data, script, catalog) {
  const errs = [];
  const wanted = new Map([...(script.characters ?? []), ...(script.mentions ?? [])].map((c) => [c.id, c]));
  const seen = new Set();
  for (const c of data.characters ?? []) {
    if (seen.has(c.id)) errs.push(`/characters duplicate id ${c.id}`);
    seen.add(c.id);
    const want = wanted.get(c.id);
    if (!want) { errs.push(`/characters ${c.id} is not in the script`); continue; }
    if (c.name !== want.name) errs.push(`/characters/${c.id}/name must be "${want.name}"`);
    const spec = specOf(c, catalog);
    if (!spec) { errs.push(`/characters/${c.id} needs a spec or an existing cast key`); continue; }
    const specErrs = validationErrors('cast', { version: 1, characters: [{ id: c.id, name: c.name, spec, scale: c.scale ?? 1, mustHave: c.mustHave, notes: c.notes ?? '' }] });
    for (const e of specErrs) errs.push(`/characters/${c.id}${e}`);
    if (!(c.scale === undefined || c.scale > 0)) errs.push(`/characters/${c.id}/scale must be > 0`);
    for (const trait of c.mustHave ?? []) {
      const t = TRAITS[normTrait(trait)];
      if (!t) { errs.push(`/characters/${c.id}/mustHave "${trait}" is not a mapped trait`); continue; }
      if (!t.ok(spec)) errs.push(`/characters/${c.id}/mustHave "${trait}" needs ${t.field}: ${t.hint}`);
    }
  }
  for (const id of wanted.keys()) if (!seen.has(id)) errs.push(`/characters is missing ${id}`);
  const main = (script.characters ?? []).map((c) => data.characters?.find((x) => x.id === c.id)).filter(Boolean);
  for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) {
    const a = main[i], b = main[j], sa = specOf(a, catalog), sb = specOf(b, catalog);
    if (!sa || !sb) continue;
    const ds = deltaE(sa.skin, sb.skin), dc = deltaE(primaryGarment(sa), primaryGarment(sb));
    if (ds < 15) errs.push(`/characters ${a.id}/${b.id} skin DeltaE ${ds.toFixed(1)} < 15`);
    if (dc < 15) errs.push(`/characters ${a.id}/${b.id} garment DeltaE ${dc.toFixed(1)} < 15`);
  }
  if (main.length > 1) {
    const specs = main.map((c) => specOf(c, catalog)).filter(Boolean);
    if (new Set(specs.map((s) => s.build)).size < 2) errs.push('/characters main characters all share one build');
    if (new Set(specs.map((s) => s.head)).size < 2) errs.push('/characters main characters all share one head');
  }
  return errs;
}

const gapRules = [
  { object: 'noose', re: /(noose|पाश)/i, standIn: 'net', priority: 'high', note: "Yama's noose; use the net prop until a noose card exists" },
];
export function assetGaps(script, catalog) {
  const known = new Set([...(catalog.props ?? []), ...(catalog.effects ?? []), ...(catalog.setPieces ?? [])].map((x) => x.name));
  const out = [];
  for (const r of gapRules) {
    if (known.has(r.object)) continue;
    const lines = (script.lines ?? []).filter((l) => r.re.test(l.text ?? '') || r.re.test(l.gloss ?? '') || r.re.test(l.look?.note ?? '')).map((l) => l.n);
    if (lines.length) out.push({ object: r.object, lines: [...new Set(lines)], standIn: r.standIn, priority: r.priority, note: r.note });
  }
  return out;
}

const compactSpec = (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));

function sheetBoard(characters, catalog) {
  const specs = Object.fromEntries(characters.map((c) => [c.id, specOf(c, catalog)]));
  const cast = Object.fromEntries(characters.map((c) => [c.id, { spec: compactSpec(specs[c.id]), seed: seedOf(c.id) }]));
  const actors = (spacing) => characters.map((c, i) => ({ cast: c.id, at: 'hermitage.clearing', nudge: [(i - (characters.length - 1) / 2) * spacing, 0, 0], pose: 'stand', expr: 'neutral', facing: 'camera', scale: c.scale ?? 1 }));
  const shots = [{
    id: 'cast', start: 'f0', end: 'f90', light: 'day', sets: ['hermitage'],
    actors: actors(1.1),
    camera: [{ at: 'f0', size: 'wide', on: characters.map((c) => c.id), move: 'hold' }],
  }];
  characters.forEach((c, i) => {
    const start = 90 * (i + 1), end = start + 90;
    shots.push({
      id: c.id, start: `f${start}`, end: `f${end}`, light: 'day', sets: ['hermitage'],
      actors: [{ cast: c.id, at: 'hermitage.clearing', pose: 'stand', expr: 'neutral', facing: 'camera', scale: c.scale ?? 1 }],
      camera: [{ at: `f${start}`, size: 'full', on: [c.id], move: 'hold' }],
    });
  });
  return { version: 1, fps: 30, tailFrames: 0, cast, shots };
}

async function castSheet(projectDir, characters, catalog) {
  const words = [{ w: 'cast', a: 0, b: 10, line: 0 }];
  let storyboard = null, last = null;
  for (const spacing of [1.1, 1.0, 0.9, 0.8]) {
    try {
      const board = sheetBoard(characters, catalog);
      for (const a of board.shots[0].actors) a.nudge[0] = (a.nudge[0] / 1.1) * spacing;
      storyboard = compileBoard(board, words, catalog).storyboard;
      break;
    } catch (e) { last = e; }
  }
  if (!storyboard) throw new Error(`cast sheet board: ${last?.message ?? 'cannot frame the group'}`);
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-cast-'));
  try {
    atomicWrite(join(tmp, 'storyboard.json'), JSON.stringify(storyboard));
    atomicWrite(join(tmp, 'words.json'), JSON.stringify(words));
    const frames = [45, ...characters.map((_, i) => 45 + 90 * (i + 1))];
    await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(tmp, 'f_'), '--frames', frames.join(','), '--project', tmp, '--size', '270x480', '--msaa', '0', '--jpeg', '0.92'], { cwd: ROOT });
    const manifest = {
      out: join(projectDir, 'cast', 'cast-sheet.jpg'),
      images: [{ path: join(tmp, 'f_45.jpg'), label: 'cast' }, ...characters.map((c, i) => ({ path: join(tmp, `f_${45 + 90 * (i + 1)}.jpg`), label: c.id }))],
    };
    atomicWrite(join(tmp, 'sheet.json'), JSON.stringify(manifest));
    const py = findPython();
    if (!py) throw new Error('cast sheet needs Python/Pillow (set FABLEON_PYTHON or create .venv)');
    mkdirSync(join(projectDir, 'cast'), { recursive: true });
    await run(py, [join(ROOT, 'tools', 'qa', 'cast_sheet.py'), join(tmp, 'sheet.json')], { cwd: ROOT });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return join(projectDir, 'cast', 'cast-sheet.jpg');
}

export async function runCast({ projectDir, project, router }) {
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(projectDir, 'research', 'facts.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const notesPath = join(projectDir, 'cast.notes.json');
  const notes = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')).notes?.map((n) => n.text) ?? [] : [];
  const verified = (facts.facts ?? []).filter((f) => f.verified);
  const examples = ['C.satyavati', 'C.shantanu', 'C.vyasa', 'C.sage', 'C.priest', 'KIDS.yudhi'].map((key) => {
    const [group, ...rest] = key.split('.');
    const hit = catalog.cast?.[group]?.find((e) => e.name === rest.join('.'));
    return hit ? { cast: key, spec: hit.spec } : null;
  }).filter(Boolean);
  const data = {
    characters: script.characters ?? [],
    mentions: script.mentions ?? [],
    facts: verified.map((f) => ({ id: f.id, claim: f.claim })),
    sceneLooks: (script.lines ?? []).map((l) => ({ n: l.n, who: l.look?.who ?? [], note: l.look?.note ?? '' })),
    castlist: examples,
    notes,
  };
  const { data: draft, usage } = await router.callJson('cast', [
    { role: 'system', content: CAST },
    { role: 'user', content: `DATA:\n${JSON.stringify(data, null, 2)}\nReturn one json object with characters only.` },
  ], {
    validate: (d) => {
      const errs = validationErrors('cast', d);
      return errs.length ? errs : castErrors(d, script, catalog);
    },
    repairHint: 'Use only the listed Spec fields and trait names. Every script character and mention needs an entry. Inline spec is preferred for new characters.',
  });
  const characters = draft.characters.map((c) => ({ ...c, scale: c.scale ?? 1, notes: c.notes ?? '' }));
  const assets = assetGaps(script, catalog);
  backupBeforeWrite(projectDir, 'cast', 'cast/cast-sheet.jpg', Buffer.from([0]));
  const sheet = await castSheet(projectDir, characters, catalog);
  writeJsonArtifact(projectDir, 'cast', 'cast.json', { version: 1, characters }, 'cast');
  writeJsonArtifact(projectDir, 'cast', 'assets.todo.json', { version: 1, assets }, 'assets');
  return { characters: characters.length, assets: assets.length, sheet, usage: router.stageUsage('cast') };
}
