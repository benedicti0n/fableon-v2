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
const byName = (arr) => new Map(arr.map((e) => [e.name, e]));
const C = new Set(catalog.cast.C.map((e) => e.name)), KIDS = new Set(catalog.cast.KIDS.map((e) => e.name));
const places = new Set(Object.keys(catalog.places));
const sets = byName(catalog.sets), poses = byName(catalog.poses), exprs = byName(catalog.expressions);
const props = byName(catalog.props), specials = byName(catalog.specials), effects = byName(catalog.effects);
const pieces = byName(catalog.setPieces), lights = byName(catalog.lights);

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
  const wordFrame = (a, shotFrame = null) => {
    if (a.shot) return shotFrame === null ? null : shotFrame + (a.offset ?? 0);
    if (a.frame !== undefined) return a.frame + (a.offset ?? 0);
    if (a.end) return END + (a.offset ?? 0);
    const line = words.filter((w) => w.line === a.line && norm(w.w) === norm(a.word));
    const hit = line[a.nth ?? 0];
    return hit ? Math.max(0, Math.round(hit.a * fps)) + (a.offset ?? 0) : null;
  };
  const check = (map, name, path, kind) => {
    const e = map.get(name);
    if (!e) { err(path, `unknown ${kind} "${name}"`); return false; }
    if (e.status === 'planned') { err(path, `${kind} "${name}" is not implemented yet`); return false; }
    return true;
  };

  // ---- word anchors: every anchor must exist, with one clear message ----
  const walk = (v, path, inShot) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}/${i}`, inShot)); return; }
    if (!v || typeof v !== 'object') return;
    if (v.line !== undefined || v.end !== undefined || v.shot !== undefined || (v.frame !== undefined && Object.keys(v).every((k) => ['frame', 'offset'].includes(k)))) {
      if (v.line !== undefined) {
        if (typeof v.word !== 'string' || typeof v.line !== 'number') return;
        const hits = words.filter((w) => w.line === v.line && norm(w.w) === norm(v.word));
        if (!hits[v.nth ?? 0]) err(path, `no word ${v.line}:${v.word}${v.nth ? ` #${v.nth}` : ''} in words.json`);
      }
      if (v.shot !== undefined) {
        if (v.shot !== true) err(path, 'shot must be true');
        if (!inShot) err(path, 'shot-relative anchor is only allowed inside a shot');
      }
      if (v.end !== undefined && v.end !== true) err(path, 'end must be true');
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, `${path}/${k}`, inShot || (path === '' && k === 'shots'));
  };
  walk(sb, '', false);

  // ---- shots, catalog names, anchors in time order ----
  const shots = Array.isArray(sb.shots) ? sb.shots : [];
  const cast = sb.cast && typeof sb.cast === 'object' ? sb.cast : {};
  const moving = new Set();
  for (const s of shots) {
    for (const a of s.actors ?? []) if (a?.id) moving.add(a.id);
    for (const e of s.fx ?? []) if (e?.id) moving.add(e.id);
    for (const x of s.set ?? []) if (x?.id) moving.add(x.id);
  }
  const points = new Set([...places, ...Object.keys(sb.points ?? {}), ...moving]);
  let prevStart = -Infinity;
  shots.forEach((s, i) => {
    const sp = `/shots/${i}`;
    if (!s || typeof s !== 'object') return;
    const sf = s.start ? wordFrame(s.start) : null;
    if (s.start?.shot) err(`${sp}/start`, 'a shot start cannot be shot-relative');
    if (sf !== null) {
      if (!(sf > prevStart)) err(`${sp}/start`, `shot start ${sf} is not after the previous start ${prevStart}`);
      prevStart = sf;
    }
    if (s.light) check(lights, s.light, `${sp}/light`, 'light');
    for (const [j, x] of (s.sets ?? []).entries()) check(sets, x, `${sp}/sets/${j}`, 'set');
    if (s.camera) {
      let prev = -Infinity;
      s.camera.forEach((k, j) => {
        const f = k?.at ? wordFrame(k.at, sf) : null;
        if (f !== null) { if (f < prev) err(`${sp}/camera/${j}/at`, `camera key ${f} is before ${prev}`); prev = f; }
      });
    }
    (s.actors ?? []).forEach((a, j) => {
      const ap = `${sp}/actors/${j}`;
      if (!a || typeof a !== 'object') return;
      if (a.who !== undefined && !(a.who in cast)) err(`${ap}/who`, `unknown cast id "${a.who}" (declare it under cast)`);
      if (a.special != null) check(specials, a.special, `${ap}/special`, 'special');
      if (a.pose) check(poses, a.pose, `${ap}/pose`, 'pose');
      if (a.expr) check(exprs, a.expr, `${ap}/expr`, 'expression');
      if (a.prop != null) check(props, a.prop, `${ap}/prop`, 'prop');
      if (a.pos && typeof a.pos === 'object' && !Array.isArray(a.pos) && !points.has(a.pos.at)) err(`${ap}/pos/at`, `unknown point "${a.pos.at}"`);
      let prev = -Infinity;
      (a.beats ?? []).forEach((b, k) => {
        const bf = b?.at ? wordFrame(b.at, sf) : null;
        if (bf !== null) { if (bf < prev) err(`${ap}/beats/${k}/at`, `beat ${bf} is before ${prev}`); prev = bf; }
        if (b?.pose) check(poses, b.pose, `${ap}/beats/${k}/pose`, 'pose');
        if (b?.expr) check(exprs, b.expr, `${ap}/beats/${k}/expr`, 'expression');
      });
    });
    (s.fx ?? []).forEach((e, j) => {
      if (!e || typeof e !== 'object') return;
      if (e.kind) check(effects, e.kind, `${sp}/fx/${j}/kind`, 'effect');
      if (e.pos && typeof e.pos === 'object' && !Array.isArray(e.pos) && !points.has(e.pos.at)) err(`${sp}/fx/${j}/pos/at`, `unknown point "${e.pos.at}"`);
    });
    (s.set ?? []).forEach((x, j) => { if (x?.piece) check(pieces, x.piece, `${sp}/set/${j}/piece`, 'set piece'); });
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
