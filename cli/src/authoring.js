// Authoring board -> v1 storyboard compiler. The board is intentionally small and semantic; the output is the
// deterministic v1 JSON the renderer consumes. Camera keys are still explicit v1 keys via `raw` in Phase 2C/F3;
// the framing solver lands in F4.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { join } from 'node:path';
import { projectDir, requireFile } from './project.js';
import { ROOT } from './env.js';

const FPS = 30;
const normAngle = (deg) => (deg * Math.PI) / 180;

export function parseAnchor(value, fps = FPS) {
  if (value && typeof value === 'object') return value;
  const s = String(value ?? '').trim();
  if (!s) throw new Error('empty anchor');
  if (/^f\d+$/.test(s)) return { frame: Number(s.slice(1)) };
  if (/^shot(?:[+-]\d+(?:\.\d+)?[fs])?$/.test(s)) {
    const m = /^shot(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
    return { shot: true, offset: m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) * (m[3] === 's' ? fps : 1) : 0 };
  }
  if (/^end(?:[+-]\d+(?:\.\d+)?[fs])?$/.test(s)) {
    const m = /^end(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
    return { end: true, offset: m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) * (m[3] === 's' ? fps : 1) : 0 };
  }
  const m = /^(\d+)\.([^#+\-]+)(?:#(\d+))?(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
  if (!m) throw new Error(`bad anchor "${s}" (use 13.word, 13.word#1+0.4s, shot+1.2s, end+4f or f90)`);
  const sign = m[4] === '-' ? -1 : 1;
  const offset = m[5] === undefined ? -2 : sign * Number(m[5]) * (m[6] === 's' ? fps : 1);
  return { line: Number(m[1]), word: m[2], ...(m[3] ? { nth: Number(m[3]) } : {}), offset: Math.round(offset) };
}

const stableSeed = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1000;
};

const flatten = (ids, groups, out = []) => {
  for (const id of ids) {
    if (Array.isArray(id)) flatten(id, groups, out);
    else if (groups[id]) flatten(groups[id], groups, out);
    else out.push(id);
  }
  return out;
};

const setInfo = (catalog, set) => catalog.sets.find((s) => s.name === set);

const markPos = (name, sets, catalog) => {
  const [a, b] = String(name).includes('.') ? String(name).split('.', 2) : [null, String(name)];
  const candidates = b === null ? sets : [a, ...sets.filter((s) => s !== a)];
  for (const set of candidates) {
    const info = setInfo(catalog, set);
    const mark = info?.marks?.find((m) => m.name === b);
    if (mark) return mark.pos;
  }
  if (catalog.places[name]) return catalog.places[name];
  throw new Error(`unknown mark "${name}" (sets: ${sets.join(', ') || 'none'})`);
};

export function resolvePoint(v, sets, catalog) {
  if (Array.isArray(v)) return [v[0], v[1], v[2]];
  if (typeof v === 'string') return markPos(v, sets, catalog);
  if (!v || typeof v !== 'object') throw new Error(`bad point ${JSON.stringify(v)}`);
  if (v.on) return { actor: v.on, attach: v.attach ?? 'head', d: v.d ?? v.nudge ?? [0, 0, 0] };
  if (v.mark) {
    const p = markPos(v.mark, sets, catalog), n = v.nudge ?? v.d ?? [0, 0, 0];
    return [p[0] + n[0], p[1] + n[1], p[2] + n[2]];
  }
  if (v.at) return { at: v.at, d: v.d ?? [0, 0, 0], ...(v.screen ? { screen: v.screen } : {}) };
  if (v.actor) return { actor: v.actor, attach: v.attach ?? 'head', d: v.d ?? [0, 0, 0] };
  throw new Error(`bad point ${JSON.stringify(v)}`);
};

const resolvePlaced = (v, sets, catalog) => {
  if (v == null) return undefined;
  if (typeof v === 'string') return markPos(v, sets, catalog);
  if (Array.isArray(v)) return v;
  if (v.mark) return resolvePoint(v, sets, catalog);
  if (v.at || v.actor) return resolvePoint(v, sets, catalog);
  return v;
};

export function expandRow(row, sets, catalog, groups) {
  const ids = flatten(row.row ?? row.ids ?? [], groups);
  const n = ids.length;
  if (!n) return [];
  const mark = markPos(row.at, sets, catalog);
  const info = setInfo(catalog, sets[0]);
  const front = normAngle(row.front ?? info?.front ?? 0);
  const right = [Math.cos(front), 0, -Math.sin(front)];
  const fwd = [-Math.sin(front), 0, -Math.cos(front)];
  const spacing = row.spacing ?? 0.8, curve = row.curve ?? 0.15;
  const nudge = row.nudge ?? [0, 0, 0];
  return ids.map((cast, i) => {
    const d = (i - (n - 1) / 2) * spacing;
    const bend = spacing ? curve * Math.abs(d) / spacing : 0;
    return {
      cast,
      pos: [mark[0] + right[0] * d + fwd[0] * bend + nudge[0], mark[1] + nudge[1], mark[2] + right[2] * d + fwd[2] * bend + nudge[2]],
      ...(row.facing !== undefined ? { facing: row.facing } : {}),
      ...(row.pose ? { pose: row.pose } : {}),
      ...(row.expr ? { expr: row.expr } : {}),
      ...(row.mirror !== undefined ? { mirror: row.mirror } : {}),
      ...(row.seated !== undefined ? { seated: row.seated } : {}),
    };
  });
}

const specFor = (castId, def, catalog) => {
  const [group, ...rest] = String(def.spec ?? '').split('.');
  const key = rest.join('.');
  const listed = group === 'C' ? catalog.cast.C : group === 'KIDS' ? catalog.cast.KIDS : null;
  const hit = listed?.find((e) => e.name === key);
  if (!hit?.spec) throw new Error(`cast "${castId}": unknown spec "${def.spec}"`);
  return hit.spec;
};
const priest = (s) => ({ ...s, build: 'adult', top: null, lower: '#f6efdc', drape: '#f2deb0', head: 'topknot', hairCol: '#2a1a1e', crownCol: undefined, necklace: null, moustache: null, beard: null, beardLong: false });

const compileFacing = (v) => {
  if (v === undefined) return {};
  if (v === 'camera' || v === 'front') return { facing: 0 };
  if (v === 'left') return { facing: -1 };
  if (v === 'right') return { facing: 1 };
  if (typeof v === 'number') return { yaw: normAngle(v) };
  throw new Error(`bad facing ${JSON.stringify(v)}`);
};

const compileAnimated = (v, fps) => {
  if (typeof v === 'number') return v;
  if (!v || !Array.isArray(v.keys)) throw new Error(`bad animated value ${JSON.stringify(v)}`);
  return { keys: v.keys.map(([a, n]) => [parseAnchor(a, fps), n]), ...(v.ease ? { ease: v.ease } : {}) };
};

const compileMotion = (m, sets, catalog, fps) => {
  if (!m) return undefined;
  if (m.type === 'path') {
    return {
      type: 'path', keys: (m.keys ?? []).map(([a, p]) => [parseAnchor(a, fps), resolvePoint(p, sets, catalog)]),
      ...(m.ease ? { ease: m.ease } : {}), ...(m.walk ? { walk: { rate: m.walk.rate ?? 1.8, offset: m.walk.offset ?? 0 } } : {}), ...(m.bob ? { bob: m.bob } : {}),
    };
  }
  if (m.type === 'ballistic') {
    return {
      type: 'ballistic', at: parseAnchor(m.at, fps), v: m.v, a: m.a,
      ...(m.floorY !== undefined ? { floorY: m.floorY } : {}), ...(m.spin !== undefined ? { spin: m.spin } : {}), ...(m.delay !== undefined ? { delay: m.delay } : {}),
    };
  }
  throw new Error(`bad motion type "${m.type}"`);
};

const compileActor = (entry, shot, ctx) => {
  const a = typeof entry === 'string' ? { cast: entry } : { ...entry };
  const sets = shot.sets ?? [];
  const out = {};
  const castId = a.cast;
  if (!castId) throw new Error(`actor in shot ${shot.id} needs "cast"`);
  let useId = castId;
  if (a.spec) {
    useId = a.id ?? `${castId}_inline`;
    ctx.cast[useId] = { spec: a.spec, seed: a.seed ?? stableSeed(useId) };
  } else {
    const def = ctx.board.cast?.[castId];
    if (!def) throw new Error(`shot ${shot.id}: cast "${castId}" is not declared`);
    if (def.group) throw new Error(`shot ${shot.id}: group "${castId}" cannot be a single actor (use a row)`);
    if (!ctx.cast[useId]) ctx.cast[useId] = { spec: def.spec, seed: def.seed ?? stableSeed(castId) };
    if (a.variant) {
      let base = ctx.cast[useId].spec;
      if (typeof base === 'string') base = specFor(castId, { spec: base }, ctx.catalog);
      const spec = a.variant === 'priest' ? priest(base) : null;
      if (!spec) throw new Error(`shot ${shot.id}: unknown variant "${a.variant}"`);
      useId = `${castId}@${a.variant}`;
      ctx.cast[useId] = { spec, seed: a.seed ?? ctx.cast[castId].seed };
    }
  }
  out.who = useId;
  if (a.id) out.id = a.id;
  if (a.special) out.special = a.special;
  if (a.params) out.params = a.params;
  out.pos = a.pos ? resolvePoint(a.pos, sets, ctx.catalog) : a.at ? resolvePlaced(a.at, sets, ctx.catalog) : undefined;
  if (a.nudge && out.pos) {
    if (Array.isArray(out.pos)) out.pos = [out.pos[0] + a.nudge[0], out.pos[1] + a.nudge[1], out.pos[2] + a.nudge[2]];
    else out.pos = { ...out.pos, d: [(out.pos.d?.[0] ?? 0) + a.nudge[0], (out.pos.d?.[1] ?? 0) + a.nudge[1], (out.pos.d?.[2] ?? 0) + a.nudge[2]] };
  }
  const motion = compileMotion(a.motion, sets, ctx.catalog, ctx.fps);
  if (motion) out.motion = motion;
  if (a.animate) out.animate = Object.fromEntries(Object.entries(a.animate).map(([k, v]) => [k, compileAnimated(v, ctx.fps)]));
  for (const k of ['scale', 'mirror', 'noBlob', 'blobScale', 'pose', 'expr', 'prop', 'look', 'seated', 'headTilt', 'tilt']) if (a[k] !== undefined) out[k] = a[k];
  if (a.talk !== undefined) out.talk = a.talk;
  Object.assign(out, compileFacing(a.facing));
  if (a.yaw !== undefined) out.yaw = typeof a.yaw === 'number' ? normAngle(a.yaw) : a.yaw;
  if (a.appear !== undefined) out.appear = typeof a.appear === 'string' ? { at: parseAnchor(a.appear, ctx.fps), pop: 0.18 } : { at: parseAnchor(a.appear.at, ctx.fps), pop: a.appear.pop ?? 0.18, stagger: a.appear.stagger ?? 0 };
  if (a.enter !== undefined || a.exit !== undefined) out.visible = { from: parseAnchor(a.enter ?? { shot: true, offset: 0 }, ctx.fps), to: parseAnchor(a.exit ?? { end: true }, ctx.fps) };
  const beats = [];
  if (a.says) {
    const [from, to] = a.says;
    beats.push({ at: parseAnchor(from, ctx.fps), talk: { base: a.expr ?? 'neutral', rate: 1 } });
    beats.push({ at: parseAnchor(to, ctx.fps), talk: null, expr: a.expr ?? 'neutral' });
  }
  for (const [at, changes] of a.do ?? []) beats.push({ at: parseAnchor(at, ctx.fps), ...changes });
  if (beats.length) out.beats = beats.sort((x, y) => ctx.anchorFrame(x.at) - ctx.anchorFrame(y.at));
  if (a.raw) { ctx.raw++; Object.assign(out, a.raw); }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
};

const compileEffect = (e, shot, ctx) => {
  const sets = shot.sets ?? [];
  const out = { ...e };
  delete out.raw;
  out.at = parseAnchor(e.at, ctx.fps);
  if (e.pos !== undefined) out.pos = resolvePoint(e.pos, sets, ctx.catalog);
  if (e.motion) out.motion = compileMotion(e.motion, sets, ctx.catalog, ctx.fps);
  for (const k of ['until', 'from', 'toAt']) if (e[k] !== undefined) out[k] = parseAnchor(e[k], ctx.fps);
  if (e.visible) out.visible = { from: parseAnchor(e.visible.from, ctx.fps), to: parseAnchor(e.visible.to, ctx.fps) };
  if (e.fromPoint !== undefined) out.from = resolvePoint(e.fromPoint, sets, ctx.catalog);
  if (e.to !== undefined) out.to = resolvePoint(e.to, sets, ctx.catalog);
  for (const k of ['dur', 'period']) if (typeof e[k] === 'number') out[k] = Math.round(e[k] * ctx.fps);
  if (e.raw) { ctx.raw++; Object.assign(out, e.raw); }
  return out;
};

const compileDof = (d, ctx) => ({
  at: parseAnchor(d.at, ctx.fps), cInf: d.cInf,
  ...(d.dur !== undefined ? { dur: Math.round(d.dur * ctx.fps) } : {}),
  ...(d.focus !== undefined ? { focus: d.focus === null ? null : resolvePoint(d.focus, ctx.sets, ctx.catalog) } : {}),
});

const convertSetAction = (x, shot, ctx) => {
  const sets = shot.sets ?? [], out = { ...x };
  const anchor = (v) => (v === undefined ? undefined : parseAnchor(v, ctx.fps));
  if (out.grid?.origin) out.grid = { ...out.grid, origin: resolvePoint(out.grid.origin, sets, ctx.catalog) };
  if (out.motion) out.motion = compileMotion(out.motion, sets, ctx.catalog, ctx.fps);
  for (const k of ['at', 'since', 'to', 'from', 'stopAt']) if (out[k] !== undefined) out[k] = anchor(out[k]);
  if (out.appear) out.appear = { from: anchor(out.appear.from), to: anchor(out.appear.to) };
  if (out.lids) { out.lids = { ...out.lids }; for (const k of ['since', 'windowEnd']) if (out.lids[k] !== undefined) out.lids[k] = anchor(out.lids[k]); if (out.lids.overrides) out.lids.overrides = out.lids.overrides.map((o) => ({ ...o, at: anchor(o.at) })); }
  if (out.kids) { out.kids = { ...out.kids }; for (const k of ['since', 'windowEnd']) if (out.kids[k] !== undefined) out.kids[k] = anchor(out.kids[k]); if (out.kids.overrides) out.kids.overrides = out.kids.overrides.map((o) => ({ ...o, at: anchor(o.at) })); }
  if (out.pos !== undefined) out.pos = resolvePoint(out.pos, sets, ctx.catalog);
  if (out.origin !== undefined) out.origin = resolvePoint(out.origin, sets, ctx.catalog);
  if (out.height !== undefined) out.height = compileAnimated(out.height, ctx.fps);
  if (out.dur !== undefined) out.dur = Math.round(out.dur * ctx.fps);
  if (out.yaw !== undefined) out.yaw = normAngle(out.yaw);
  if (out.roll !== undefined) out.roll = normAngle(out.roll);
  delete out.raw;
  return out;
};

const compileCrowd = (c, shot, ctx) => {
  const sets = shot.sets ?? [], out = { ...c };
  if (out.layout?.grid?.origin) out.layout = { ...out.layout, grid: { ...out.layout.grid, origin: resolvePoint(out.layout.grid.origin, sets, ctx.catalog) } };
  if (out.layout?.points) out.layout = { ...out.layout, points: out.layout.points.map((p) => resolvePoint(p, sets, ctx.catalog)) };
  return out;
};

const compileShot = (shot, board, words, catalog, fps, ctx) => {
  const sets = shot.sets ?? [];
  const start = parseAnchor(shot.start, fps);
  const out = { id: shot.id, start, light: shot.light ?? 'day', sets };
  if (shot.sun) out.sun = shot.sun;
  const cameras = [];
  for (const k of shot.camera ?? []) {
    if (k.size !== undefined) throw new Error(`shot ${shot.id}: semantic camera size "${k.size}" needs the F4 solver`);
    if (k.raw) ctx.raw++;
    const raw = k.raw ?? k;
    const key = { ...raw, at: parseAnchor(raw.at, fps) };
    if (raw.pos !== undefined) key.pos = resolvePoint(raw.pos, sets, catalog);
    if (raw.look !== undefined) key.look = resolvePoint(raw.look, sets, catalog);
    if (raw.lookTo !== undefined) key.lookTo = resolvePoint(raw.lookTo, sets, catalog);
    if (raw.push) key.push = { ...raw.push, from: parseAnchor(raw.push.from, fps), ...(raw.push.punchAt ? { punchAt: parseAnchor(raw.push.punchAt, fps) } : {}) };
    if (raw.subjects) key.subjects = raw.subjects;
    cameras.push(key);
  }
  const rawShot = shot.raw ?? {};
  if (shot.raw) ctx.raw++;
  if (!cameras.length && rawShot.camera) cameras.push(...rawShot.camera.map((k) => ({ ...k, ...(typeof k.at === 'string' ? { at: parseAnchor(k.at, fps) } : {}) })));
  if (cameras.length) out.camera = cameras.sort((a, b) => ctx.anchorFrame(a.at) - ctx.anchorFrame(b.at));
  if (shot.dof) out.dof = shot.dof.map((d) => compileDof(d, { ...ctx, sets }));
  if (shot.actors) {
    const list = [];
    for (const entry of shot.actors) {
      if (entry && typeof entry === 'object' && entry.row) list.push(...expandRow(entry, sets, catalog, board.groups ?? {}).map((x) => compileActor(x, { ...shot, sets }, ctx)));
      else if (typeof entry === 'string' && board.groups?.[entry]) throw new Error(`shot ${shot.id}: group "${entry}" must be used in a row`);
      else list.push(compileActor(entry, { ...shot, sets }, ctx));
    }
    out.actors = list;
  }
  if (shot.rows) {
    out.actors = [...(out.actors ?? []), ...shot.rows.flatMap((r) => expandRow(r, sets, catalog, board.groups ?? {}).map((x) => compileActor(x, { ...shot, sets }, ctx)))];
  }
  if (shot.crowds) out.crowds = shot.crowds.map((c) => compileCrowd(c, { ...shot, sets }, ctx));
  if (shot.fx) out.fx = shot.fx.map((e) => compileEffect(e, { ...shot, sets }, ctx));
  if (shot.set) out.set = shot.set.map((x) => convertSetAction(x, { ...shot, sets }, ctx));
  if (rawShot.camera) delete rawShot.camera;
  Object.assign(out, rawShot);
  return out;
};

export function compileBoard(board, words, catalog) {
  const fps = board.fps ?? FPS;
  const end = Math.round((words[words.length - 1]?.b ?? 0) * fps);
  const ctx = {
    board, words, catalog, fps, cast: {}, raw: 0,
    anchorFrame: (a) => {
      if (a.shot) return 0;
      if (a.frame !== undefined) return a.frame;
      if (a.end) return end + (a.offset ?? 0);
      const hit = words.filter((w) => w.line === a.line && w.w.toLowerCase().replace(/[^a-z']/g, '') === a.word.toLowerCase().replace(/[^a-z']/g, ''))[a.nth ?? 0];
      if (!hit) throw new Error(`no word ${a.line}:${a.word}`);
      return Math.round(hit.a * fps) + (a.offset ?? 0);
    },
  };
  const out = {
    version: 1, fps, tailFrames: board.tailFrames ?? 36, crossfade: board.crossfade ?? 10,
    ...(board.flash !== undefined ? { flash: parseAnchor(board.flash, fps) } : {}),
    ...(board.points ? { points: Object.fromEntries(Object.entries(board.points).map(([k, v]) => [k, resolvePoint(v, [], catalog)])) } : {}),
  };
  out.shots = (board.shots ?? []).map((s) => compileShot(s, board, words, catalog, fps, ctx));
  out.cast = ctx.cast;
  out.kicks = (board.kicks ?? []).map((k) => ({ at: parseAnchor(k.at, fps), amp: k.amp }));
  return { storyboard: out, stats: { raw: ctx.raw, cast: Object.keys(ctx.cast).length } };
}

export function compileProject(dirArg) {
  const dir = projectDir(dirArg);
  const board = JSON.parse(readFileSync(requireFile(dir, 'board.json', 'write board.json first'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(ROOT, 'schema', 'authoring.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validate(board)) throw new Error(`board.json failed the authoring schema:\n${validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('\n')}`);
  const words = JSON.parse(readFileSync(requireFile(dir, 'words.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const { storyboard, stats } = compileBoard(board, words, catalog);
  return { dir, storyboard, stats };
}
