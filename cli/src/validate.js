// `fableon validate`: JSON Schema v1 + catalog names + word anchors + time order. One path + reason per error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT, fail } from './env.js';
import { projectDir, requireFile } from './project.js';

const schema = JSON.parse(readFileSync(join(ROOT, 'schema', 'storyboard.schema.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z']/g, '');
const C = new Set(catalog.cast.C), KIDS = new Set(catalog.cast.KIDS);
const places = new Set(Object.keys(catalog.places));
const sets = new Set(catalog.sets), poses = new Set(catalog.poses), exprs = new Set(catalog.expressions);
const props = new Set(catalog.props), specials = new Set(catalog.specials), effects = new Set(catalog.effects);
const pieces = new Set(catalog.setPieces), lights = new Set(catalog.lights);

export function validateStoryboard(dirArg) {
  const dir = projectDir(dirArg);
  const file = requireFile(dir, 'storyboard.json', 'run: fableon init <name> --from fixtures/adi-parva');
  const wordsFile = requireFile(dir, 'words.json');
  const sb = JSON.parse(readFileSync(file, 'utf8'));
  const words = JSON.parse(readFileSync(wordsFile, 'utf8'));
  const errors = [];
  const err = (path, reason) => errors.push(`${path}: ${reason}`);

  if (!validateSchema(sb)) for (const e of validateSchema.errors) {
    const path = (e.instancePath || '') + (e.params?.missingProperty ? `/${e.params.missingProperty}` : '');
    err(path || '/', e.message);
  }

  const fps = sb.fps ?? 30;
  const END = Math.round((words[words.length - 1]?.b ?? 0) * fps);
  const wordFrame = (a) => {
    if (a.frame !== undefined) return a.frame + (a.offset ?? 0);
    if (a.end) return END + (a.offset ?? 0);
    const line = words.filter((w) => w.line === a.line && norm(w.w) === norm(a.word));
    const hit = line[a.nth ?? 0];
    return hit ? Math.max(0, Math.round(hit.a * fps)) + (a.offset ?? 0) : null;
  };

  // ---- word anchors: every anchor must exist, with one clear message ----
  const walk = (v, path) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}/${i}`)); return; }
    if (!v || typeof v !== 'object') return;
    if (v.line !== undefined || v.end !== undefined || (v.frame !== undefined && Object.keys(v).every((k) => ['frame', 'offset'].includes(k)))) {
      if (v.line !== undefined) {
        if (typeof v.word !== 'string' || typeof v.line !== 'number') return;
        const hits = words.filter((w) => w.line === v.line && norm(w.w) === norm(v.word));
        if (!hits[v.nth ?? 0]) err(path, `no word ${v.line}:${v.word}${v.nth ? ` #${v.nth}` : ''} in words.json`);
      }
      if (v.end !== undefined && v.end !== true) err(path, 'end must be true');
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, `${path}/${k}`);
  };
  walk(sb, '');

  // ---- shots, catalog names, anchors in time order ----
  const shots = Array.isArray(sb.shots) ? sb.shots : [];
  const cast = sb.cast && typeof sb.cast === 'object' ? sb.cast : {};
  const points = new Set([...places, ...Object.keys(sb.points ?? {})]);
  let prevStart = -Infinity;
  shots.forEach((s, i) => {
    const sp = `/shots/${i}`;
    if (!s || typeof s !== 'object') return;
    const sf = s.start ? wordFrame(s.start) : null;
    if (sf !== null) {
      if (!(sf > prevStart)) err(`${sp}/start`, `shot start ${sf} is not after the previous start ${prevStart}`);
      prevStart = sf;
    }
    if (s.light && !lights.has(s.light)) err(`${sp}/light`, `unknown light "${s.light}"`);
    for (const [j, x] of (s.sets ?? []).entries()) if (!sets.has(x)) err(`${sp}/sets/${j}`, `unknown set "${x}"`);
    if (s.camera) {
      let prev = -Infinity;
      s.camera.forEach((k, j) => {
        const f = k?.at ? wordFrame(k.at) : null;
        if (f !== null) { if (f < prev) err(`${sp}/camera/${j}/at`, `camera key ${f} is before ${prev}`); prev = f; }
      });
    }
    (s.actors ?? []).forEach((a, j) => {
      const ap = `${sp}/actors/${j}`;
      if (!a || typeof a !== 'object') return;
      if (a.who !== undefined && !(a.who in cast)) err(`${ap}/who`, `unknown cast id "${a.who}" (declare it under cast)`);
      if (a.special != null && !specials.has(a.special)) err(`${ap}/special`, `unknown special "${a.special}"`);
      if (a.pose && !poses.has(a.pose)) err(`${ap}/pose`, `unknown pose "${a.pose}"`);
      if (a.expr && !exprs.has(a.expr)) err(`${ap}/expr`, `unknown expression "${a.expr}"`);
      if (a.prop != null && !props.has(a.prop)) err(`${ap}/prop`, `unknown prop "${a.prop}"`);
      if (a.pos && typeof a.pos === 'object' && !Array.isArray(a.pos) && !points.has(a.pos.at)) err(`${ap}/pos/at`, `unknown point "${a.pos.at}"`);
      let prev = -Infinity;
      (a.beats ?? []).forEach((b, k) => {
        const bf = b?.at ? wordFrame(b.at) : null;
        if (bf !== null) { if (bf < prev) err(`${ap}/beats/${k}/at`, `beat ${bf} is before ${prev}`); prev = bf; }
        if (b?.pose && !poses.has(b.pose)) err(`${ap}/beats/${k}/pose`, `unknown pose "${b.pose}"`);
        if (b?.expr && !exprs.has(b.expr)) err(`${ap}/beats/${k}/expr`, `unknown expression "${b.expr}"`);
      });
    });
    (s.fx ?? []).forEach((e, j) => {
      if (!e || typeof e !== 'object') return;
      if (e.kind && !effects.has(e.kind)) err(`${sp}/fx/${j}/kind`, `unknown effect "${e.kind}"`);
      if (e.pos && typeof e.pos === 'object' && !Array.isArray(e.pos) && !points.has(e.pos.at)) err(`${sp}/fx/${j}/pos/at`, `unknown point "${e.pos.at}"`);
    });
    (s.set ?? []).forEach((x, j) => { if (x?.piece && !pieces.has(x.piece)) err(`${sp}/set/${j}/piece`, `unknown set piece "${x.piece}"`); });
  });

  // ---- named points, cast specs ----
  for (const [name, p] of Object.entries(sb.points ?? {})) if (p && typeof p === 'object' && !Array.isArray(p) && !points.has(p.at)) err(`/points/${name}/at`, `unknown point "${p.at}"`);
  for (const [id, c] of Object.entries(cast)) {
    if (typeof c?.spec !== 'string') continue;
    const [group, ...rest] = c.spec.split('.');
    const key = rest.join('.');
    const list = group === 'C' ? C : group === 'KIDS' ? KIDS : null;
    if (!list || !list.has(key)) err(`/cast/${id}/spec`, `unknown cast spec "${c.spec}" (use C.<id>, KIDS.<id> or an inline Spec)`);
  }

  if (errors.length) {
    console.error(`validate: ${file} has ${errors.length} error(s)`);
    for (const e of errors) console.error(`  ${e}`);
    return { ok: false, errors, dir, file };
  }
  console.log(`validate: OK (${shots.length} shots, ${Object.keys(cast).length} cast ids) — ${file}`);
  return { ok: true, errors: [], dir, file };
}

export function validateCommand(dirArg) {
  const r = validateStoryboard(dirArg);
  if (!r.ok) fail(`${r.errors.length} storyboard error(s)`);
}
