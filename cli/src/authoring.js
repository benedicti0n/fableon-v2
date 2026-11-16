// Authoring board -> v1 storyboard compiler. The board is intentionally small and semantic; the output is the
// deterministic v1 JSON the renderer consumes. Camera keys are still explicit v1 keys via `raw` in Phase 2C/F3;
// the framing solver lands in F4.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { join } from 'node:path';
import { projectDir, requireFile } from './project.js';
import { ROOT } from './env.js';
import { SIZE, solveCamera } from './solver.js';
import { normalizeWord } from '../../shared/words.mjs';

const FPS = 30;
const normAngle = (deg) => (deg * Math.PI) / 180;

export function parseAnchor(value, fps = FPS) {
  if (value && typeof value === 'object') return value;
  const s = String(value ?? '').trim();
  if (!s) throw new Error('empty anchor');
  if (/^f\d+$/.test(s)) return { frame: Number(s.slice(1)) };
  if (/^shot(?:[+-]\d+(?:\.\d+)?[fs])?$/.test(s)) {
    const m = /^shot(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
    return { shot: true, offset: Math.round(m && m[1] ? (m[1] === '-' ? -1 : 1) * Number(m[2]) * (m[3] === 's' ? fps : 1) : 0) };
  }
  if (/^end(?:[+-]\d+(?:\.\d+)?[fs])?$/.test(s)) {
    const m = /^end(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
    return { end: true, offset: Math.round(m && m[1] ? (m[1] === '-' ? -1 : 1) * Number(m[2]) * (m[3] === 's' ? fps : 1) : 0) };
  }
  const wi = /^(\d+):(\d+)(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
  if (wi) {
    const sign = wi[3] === '-' ? -1 : 1;
    const offset = wi[4] === undefined ? -2 : sign * Number(wi[4]) * (wi[5] === 's' ? fps : 1);
    return { line: Number(wi[1]), wordIndex: Number(wi[2]), offset: Math.round(offset) };
  }
  const m = /^(\d+)\.([^#+\-]+)(?:#(\d+))?(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(s);
  if (!m) throw new Error(`bad anchor "${s}" (use 13.word, 13.word#1+0.4s, 12:4, shot+1.2s, end+4f or f90)`);
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

const markInfo = (name, sets, catalog) => {
  const [a, b] = String(name).includes('.') ? String(name).split('.', 2) : [null, String(name)];
  const candidates = b === null ? sets : [a, ...sets.filter((s) => s !== a)];
  for (const set of candidates) {
    const info = setInfo(catalog, set);
    const mark = info?.marks?.find((m) => m.name === b);
    if (mark) return mark;
  }
  return null;
};
const markPos = (name, sets, catalog) => {
  const mark = markInfo(name, sets, catalog);
  if (mark) return mark.pos;
  if (catalog.places[name]) return catalog.places[name];
  throw new Error(`unknown mark "${name}" (sets: ${sets.join(', ') || 'none'})`);
};

const markViewOf = (name, sets, catalog) => {
  const [a, b] = String(name).includes('.') ? String(name).split('.', 2) : [null, String(name)];
  for (const set of b === null ? sets : [a, ...sets.filter((x) => x !== a)]) {
    const info = catalog.sets.find((x) => x.name === set);
    const m = info?.marks?.find((x) => x.name === b);
    if (m) return m.view ?? m.facing;
  }
  return undefined;
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

const compileParams = (params, fps) => Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, v && typeof v === 'object' && Array.isArray(v.keys) ? compileAnimated(v, fps) : v]));

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
  if (a.face) out.face = a.face;
  if (a.params) out.params = compileParams(a.params, ctx.fps);
  out.pos = a.pos ? resolvePoint(a.pos, sets, ctx.catalog) : a.at ? resolvePlaced(a.at, sets, ctx.catalog) : undefined;
  if (typeof a.at === 'string') { const v = markViewOf(a.at, sets, ctx.catalog); if (v !== undefined) out.view = v; }
  else if (a.at && typeof a.at === 'object' && a.at.mark) { const v = markViewOf(a.at.mark, sets, ctx.catalog); if (v !== undefined) out.view = v; }
  if (a.ride) { out.ride = a.ride; out.rideOffset = a.nudge ?? [0, 0, 0]; delete out.pos; }
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
  for (const [at, changes] of a.do ?? []) {
    const ch = { ...changes };
    if (ch.params) ch.params = compileParams(ch.params, ctx.fps);
    if (ch.facing !== undefined) Object.assign(ch, compileFacing(ch.facing));
    beats.push({ at: parseAnchor(at, ctx.fps), ...ch });
  }
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
  delete out.fromPoint;
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

const pointAt = (p, f, ctx, depth = 0) => {
  if (Array.isArray(p)) return p;
  if (!p || typeof p !== 'object') throw new Error(`bad point ${JSON.stringify(p)}`);
  if (depth > 16) throw new Error(`point cycle at "${p.at}"`);
  const named = p.at ? ctx.board.points?.[p.at] : null;
  if (named) { const b = pointAt(named, f, ctx, depth + 1), d = p.d ?? [0, 0, 0]; return [b[0] + d[0], b[1] + d[1], b[2] + d[2]]; }
  const base = p.at && ctx.catalog.places[p.at] ? ctx.catalog.places[p.at] : [0, 0, 0];
  const d = p.d ?? [0, 0, 0];
  return [base[0] + d[0], base[1] + d[1], base[2] + d[2]];
};

const motionAt = (m, f, p0, ctx) => {
  if (!m) return null;
  if (m.type === 'ballistic') {
    const t = (f - ctx.anchorFrame(m.at)) / ctx.fps - (m.delay ?? 0), u = Math.max(0, t);
    return [p0[0] + m.v[0] * u + m.a[0] * u * u, p0[1] + m.v[1] * u + m.a[1] * u * u, p0[2] + m.v[2] * u + m.a[2] * u * u];
  }
  const keys = m.keys.map(([a, p]) => [ctx.anchorFrame(a), pointAt(p, f, ctx)]).sort((x, y) => x[0] - y[0]);
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  let i = 0; while (i + 1 < keys.length && f >= keys[i + 1][0]) i++;
  const [f0, a] = keys[i], [f1, b] = keys[i + 1], u = f1 === f0 ? 1 : (f - f0) / (f1 - f0);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};

const castSpec = (id, ctx) => {
  const e = ctx.cast[id];
  if (!e) return null;
  if (typeof e.spec === 'object') return e.spec;
  const [g, ...rest] = String(e.spec).split('.');
  const list = g === 'C' ? ctx.catalog.cast.C : g === 'KIDS' ? ctx.catalog.cast.KIDS : null;
  return list?.find((x) => x.name === rest.join('.'))?.spec ?? null;
};

const actorWindow = (a, f, start, ctx) => {
  let st = { ...a };
  for (const b of a.beats ?? []) if (f >= ctx.anchorFrame(b.at, start)) st = { ...st, ...b };
  const vis = st.visible, ap = st.appear;
  const from = vis ? ctx.anchorFrame(vis.from, start) : ap ? ctx.anchorFrame(ap.at, start) : -Infinity;
  const to = vis ? ctx.anchorFrame(vis.to, start) : Infinity;
  return { st, vis, ap, from, to };
};
const visibleAt = (a, f, start, ctx, effect = false) => {
  if (effect) {
    if (a.visible && (f < ctx.anchorFrame(a.visible.from, start) || f >= ctx.anchorFrame(a.visible.to, start))) return false;
    if (a.at && f < ctx.anchorFrame(a.at, start)) return false;
    if (a.until && f >= ctx.anchorFrame(a.until, start)) return false;
    return true;
  }
  const w = actorWindow(a, f, start, ctx);
  return f >= w.from && f < w.to;
};
const visibilityMessage = (id, anchor, actor, start, ctx, effect = false) => {
  if (effect) {
    const enter = actor.at ? ctx.anchorFrame(actor.at, start) : null;
    const exit = actor.until ? ctx.anchorFrame(actor.until, start) : null;
    return `subject ${id} is not visible at ${anchor} (${enter !== null ? `enters at ${enter}` : 'no enter'}, ${exit !== null ? `exited at ${exit}` : 'no exit'})`;
  }
  const w = actorWindow(actor, ctx.anchorFrame(actor.at ?? { shot: true, offset: 0 }, start), start, ctx);
  return `subject ${id} is not visible at ${anchor} (${w.from > -Infinity ? `enters at ${w.from}` : 'no enter'}, ${w.to < Infinity ? `exited at ${w.to}` : 'no exit'})`;
};

const actorStateAt = (a, f, shot, ctx) => {
  const start = ctx.anchorFrame(shot.start);
  const w = actorWindow(a, f, start, ctx);
  const st = w.st;
  let base = a.pos ? pointAt(a.pos, f, ctx) : [0, 0, 0];
  if (a.ride) {
    const sp = (shot.set ?? []).find((x) => x.id === a.ride);
    if (!sp?.motion) throw new Error(`actor ride target "${a.ride}" has no moving set piece`);
    base = (() => { const b = motionAt(sp.motion, f, sp.pos ? pointAt(sp.pos, f, ctx) : [0, 0, 0], ctx); const d = a.rideOffset ?? [0, 0, 0]; return [b[0] + d[0], b[1] + d[1], b[2] + d[2]]; })();
  }
  const pos = a.motion && !a.ride ? motionAt(a.motion, f, base, ctx) : base;
  const spec = castSpec(a.who, ctx) ?? { build: 'adult' };
  const key = a.special ? a.special : (spec.build ?? 'adult');
  const measure = ctx.catalog.measure[key] ?? ctx.catalog.measure.adult;
  return { kind: 'actor', id: a.who, moveId: a.id, pos, measure, scale: st.scale ?? 1, seated: !!st.seated, who: a.who, view: a.view, entering: w.from, exiting: w.to };
};

const effectStateAt = (fx, f, ctx, shot) => {
  const start = ctx.anchorFrame(shot.start);
  const pos = fx.motion ? motionAt(fx.motion, f, fx.pos ? pointAt(fx.pos, f, ctx) : [0, 0, 0], ctx) : pointAt(fx.pos, f, ctx);
  const measure = ctx.catalog.measure[fx.kind] ?? { standing: 0.9, seated: 0.9, eye: 0.6, eyeSeated: 0.6, head: 0.25, halfWidth: 0.35 };
  return { kind: 'effect', id: fx.id ?? fx.kind, moveId: fx.id, pos, measure, scale: 1, seated: false, entering: fx.at ? ctx.anchorFrame(fx.at, start) : -Infinity, exiting: fx.until ? ctx.anchorFrame(fx.until, start) : Infinity };
};

const subjectSamples = (id, compiled, shot, keyStart, keyEnd, later, ctx, anchorLabel) => {
  const a = (compiled.actors ?? []).find((x) => x.id === id || x.who === id);
  if (a) {
    if (!visibleAt(a, keyStart, ctx.anchorFrame(shot.start), ctx)) {
      let first = null;
      for (let f = keyStart; f < Math.min(keyEnd, keyStart + 15); f++) if (visibleAt(a, f, ctx.anchorFrame(shot.start), ctx)) { first = f; break; }
      if (first === null) {
        if (!later.includes(id)) throw new Error(visibilityMessage(id, anchorLabel, a, ctx.anchorFrame(shot.start), ctx));
        for (let f = keyStart; f < keyEnd; f++) if (visibleAt(a, f, ctx.anchorFrame(shot.start), ctx)) { first = f; break; }
        if (first === null) throw new Error(`subject ${id} is not visible at ${anchorLabel} (no visible frame before ${keyEnd})`);
      }
      keyStart = first;
    }
    const moving = !!a.motion || !!a.ride;
    const frames = moving ? Array.from({ length: Math.max(1, Math.ceil((keyEnd - keyStart) / 6)) }, (_, i) => Math.min(keyEnd - 1, keyStart + i * 6)) : [keyStart];
    const samples = frames.map((f) => actorStateAt(a, f, compiled, ctx)).filter(Boolean);
    return { ...samples[0], samples: samples.map((s) => s.pos) };
  }
  const fx = (compiled.fx ?? []).find((x) => x.id === id);
  if (fx) {
    if (!visibleAt(fx, keyStart, ctx.anchorFrame(shot.start), ctx, true)) {
      let first = null;
      for (let f = keyStart; f < Math.min(keyEnd, keyStart + 15); f++) if (visibleAt(fx, f, ctx.anchorFrame(shot.start), ctx, true)) { first = f; break; }
      if (first === null) {
        if (!later.includes(id)) throw new Error(visibilityMessage(id, anchorLabel, fx, ctx.anchorFrame(shot.start), ctx, true));
        for (let f = keyStart; f < keyEnd; f++) if (visibleAt(fx, f, ctx.anchorFrame(shot.start), ctx, true)) { first = f; break; }
        if (first === null) throw new Error(`subject ${id} is not visible at ${anchorLabel} (no visible frame before ${keyEnd})`);
      }
      keyStart = first;
    }
    const moving = !!fx.motion;
    const frames = moving ? Array.from({ length: Math.max(1, Math.ceil((keyEnd - keyStart) / 6)) }, (_, i) => Math.min(keyEnd - 1, keyStart + i * 6)) : [keyStart];
    const samples = frames.map((f) => effectStateAt(fx, f, ctx, compiled));
    return { ...samples[0], samples: samples.map((s) => s.pos) };
  }
  const setp = (compiled.set ?? []).find((x) => x.id === id);
  if (setp && setp.motion) {
    const start = ctx.anchorFrame(compiled.start);
    const p = motionAt(setp.motion, keyStart, setp.pos ? pointAt(setp.pos, keyStart, ctx) : [0, 0, 0], ctx);
    const samples = Array.from({ length: Math.max(1, Math.ceil((keyEnd - keyStart) / 6)) }, (_, i) => motionAt(setp.motion, Math.min(keyEnd - 1, keyStart + i * 6), setp.pos ? pointAt(setp.pos, keyStart + i * 6, ctx) : [0, 0, 0], ctx));
    return { kind: 'setPiece', id, moveId: id, pos: p, samples, measure: { standing: 0.8, seated: 0.8, eye: 0.4, eyeSeated: 0.4, head: 0.3, halfWidth: 0.8 }, scale: 1, seated: false };
  }
  const info = markInfo(id, shot.sets ?? [], ctx.catalog);
  const p = info?.pos ?? markPos(id, shot.sets ?? [], ctx.catalog);
  return { kind: 'mark', id, moveId: null, pos: p, samples: [p], measure: ctx.catalog.measure.adult, scale: 1, seated: false, view: markViewOf(id, shot.sets ?? [], ctx.catalog), ...(info?.box ? { box: info.box, ids: info.ids } : {}) };
};

const lookPointFor = (id, out, keyStart, keyEnd, ctx, shot) => {
  const actor = (out.actors ?? []).find((a) => a.id === id || a.who === id);
  const fx = (out.fx ?? []).find((e) => e.id === id);
  if (actor || fx) {
    const st = subjectSamples(id, out, out, Math.max(keyStart, keyEnd - 1), keyEnd, [], ctx, 'to');
    return [st.pos[0], st.pos[1] + (st.seated ? st.measure.eyeSeated : st.measure.eye) * st.scale, st.pos[2]];
  }
  const p = markPos(id, shot.sets ?? [], ctx.catalog);
  return p;
};

const faceTargetAt = (a, f, ctx) => {
  let face = a.face;
  for (const b of a.beats ?? []) if (b.face !== undefined && f >= ctx.anchorFrame(b.at)) face = b.face;
  return face;
};
const propAt = (a, f, ctx) => {
  let prop = a.prop;
  for (const b of a.beats ?? []) if (b.prop !== undefined && f >= ctx.anchorFrame(b.at)) prop = b.prop;
  return prop;
};
const projectScreenU = (cam, p, f, ctx) => {
  const c = pointAt(cam.pos, f, ctx), l = pointAt(cam.look, f, ctx);
  const fx = l[0] - c[0], fz = l[2] - c[2], fl = Math.hypot(fx, fz) || 1;
  const fwd = [fx / fl, 0, fz / fl], right = [-fwd[2], 0, fwd[0]];
  const vx = p[0] - c[0], vz = p[2] - c[2], z = vx * fwd[0] + vz * fwd[2];
  if (z <= 0) return 0.5;
  const x = vx * right[0] + vz * right[2], tan = Math.tan(((cam.fov ?? 40) * Math.PI) / 360);
  return 0.5 + x / z / (2 * tan * 9 / 16);
};
const addFacingBeat = (a, f, target, cam, ctx) => {
  const own = actorStateAt(a, f, { start: { frame: 0 } }, ctx);
  if (!own) return;
  const tu = projectScreenU(cam, target, f, ctx), au = projectScreenU(cam, own.pos, f, ctx);
  const dir = tu > au + 0.01 ? 1 : tu < au - 0.01 ? -1 : 0;
  const prop = propAt(a, f, ctx);
  let facing = dir, mirror = false;
  if (prop === 'bow' || prop === 'bowDrawn' || prop === 'bigbow') { facing = dir ? -1 : 0; mirror = dir > 0; }
  else if (prop === 'spear' || prop === 'net' || prop === 'axe' || prop === 'torch') { facing = dir ? 1 : 0; mirror = dir < 0; }
  const beat = { at: { frame: f }, facing, mirror, look: dir };
  const same = (a.beats ?? []).find((b) => !b.at.shot && b.at.frame === f);
  if (same) Object.assign(same, beat); else (a.beats ??= []).push(beat);
  a.beats.sort((x, y) => ctx.anchorFrame(x.at) - ctx.anchorFrame(y.at));
};
const applyFaces = (out, cameras, ctx) => {
  if (!out.actors?.length || !cameras.length) return;
  const start = ctx.anchorFrame(out.start);
  const targetPoint = (id, f) => {
    const a = out.actors.find((x) => x.id === id || x.who === id);
    if (a) { const st = actorStateAt(a, f, out, ctx); return st ? st.pos : null; }
    const fx = (out.fx ?? []).find((x) => x.id === id);
    if (fx) return effectStateAt(fx, f, ctx, out).pos;
    try { return markPos(id, out.sets ?? [], ctx.catalog); } catch { return null; }
  };
  for (const a of out.actors) {
    const ownId = a.id ?? a.who;
    const faceChanges = [];
    for (const cam of cameras) {
      const f = ctx.anchorFrame(cam.at, start);
      let face = faceTargetAt(a, f, ctx);
      if (!face && cam.over === ownId && cam.subjects?.length) face = cam.subjects[0];
      if (face) faceChanges.push({ f, face, cam });
    }
    for (const b of a.beats ?? []) if (b.face !== undefined) {
      const f = ctx.anchorFrame(b.at, start), cam = [...cameras].reverse().find((c) => ctx.anchorFrame(c.at, start) <= f);
      if (cam) faceChanges.push({ f, face: b.face, cam });
    }
    for (const { f, face, cam } of faceChanges) {
      const p = targetPoint(face, f);
      if (p) addFacingBeat(a, f, p, cam, ctx);
    }
  }
};

const compileShot = (shot, board, words, catalog, fps, ctx, shotEnd) => {
  const sets = shot.sets ?? [];
  const start = parseAnchor(shot.start, fps);
  const startFrame = ctx.anchorFrame(start);
  const out = { id: shot.id, start, light: shot.light ?? 'day', sets };
  if (shot.end !== undefined) out.end = parseAnchor(shot.end, fps);
  if (shot.sun) out.sun = shot.sun;
  const list = [];
  for (const entry of shot.actors ?? []) {
    if (entry && typeof entry === 'object' && entry.row) list.push(...expandRow(entry.row, sets, catalog, board.groups ?? {}).map((x) => compileActor(x, { ...shot, sets }, ctx)));
    else if (typeof entry === 'string' && board.groups?.[entry]) throw new Error(`shot ${shot.id}: group "${entry}" must be used in a row`);
    else list.push(compileActor(entry, { ...shot, sets }, ctx));
  }
  for (const r of shot.rows ?? []) list.push(...expandRow(r, sets, catalog, board.groups ?? {}).map((x) => compileActor(x, { ...shot, sets }, ctx)));
  if (list.length) out.actors = list;
  if (shot.crowds) out.crowds = shot.crowds.map((c) => compileCrowd(c, { ...shot, sets }, ctx));
  if (shot.fx) out.fx = shot.fx.map((e) => compileEffect(e, { ...shot, sets }, ctx));
  if (shot.set) out.set = shot.set.map((x) => convertSetAction(x, { ...shot, sets }, ctx));
  const cameras = [], dofs = [];
  const keyFrames = (shot.camera ?? []).map((k) => ctx.anchorFrame(parseAnchor(k.at ?? k.raw?.at, fps), startFrame));
  for (let ki = 0; ki < (shot.camera ?? []).length; ki++) {
    const k = shot.camera[ki];
    const semantic = k.size !== undefined || k.on !== undefined || k.scenery === true;
    if (semantic) {
      const on = k.on === undefined ? (out.actors ?? []).map((a) => a.id ?? a.who) : Array.isArray(k.on) ? k.on : [k.on];
      const f = ctx.anchorFrame(parseAnchor(k.at, fps), startFrame);
      const keyEnd = ki + 1 < keyFrames.length ? keyFrames[ki + 1] : shotEnd;
      let subjects = on.map((id) => subjectSamples(id, out, out, f, keyEnd, k.later ?? [], ctx, k.at));
      if (!subjects.length && k.scenery && !k.size) k.size = 'establishing';
      if (k.move === 'follow') subjects = subjects.map((s) => ({ ...s, samples: [s.pos] }));
      const info = setInfo(catalog, sets[0]) ?? { front: 0, bounds: { min: [-10, 0, -10], max: [10, 10, 10] } };
      const keepout = catalog.keepout?.[sets[0]] ?? [];
      const over = k.over ? subjectSamples(k.over, out, out, f, keyEnd, [], ctx, k.at) : null;
      const toLook = k.to ? lookPointFor(k.to, out, f, keyEnd, ctx, out) : null;
      const context = (k.with ?? []).map((id) => subjectSamples(id, out, out, f, keyEnd, [], ctx, k.at));
      if (k.cut && (k.move === 'glide' || k.move === 'crane' || k.glide !== undefined)) throw new Error(`shot ${shot.id} key ${ki}: glide/crane cannot be combined with cut`);
      let solved;
      try { solved = solveCamera({ key: { ...k, at: ctx.anchorFrame(parseAnchor(k.at, fps), startFrame) }, subjects, over, toLook, context, setInfo: info, keepout }); } catch (e) { throw new Error(`shot ${shot.id} key ${ki}: ${e.message}`); }
      const key = { ...solved.key, at: parseAnchor(k.at, fps), pos: solved.key.pos, look: solved.key.look, subjects: solved.key.subjects.filter((id) => (out.actors ?? []).some((a) => a.who === id) || (out.fx ?? []).some((e) => e.id === id) || (k.size === 'insert' && !!markInfo(id, sets, catalog))) };
      if (k.later) key.later = [...k.later];
      if (k.scenery) key.scenery = true;
      if (k.with) key.with = [...k.with];
      if (k.over) key.over = k.over;
      key.semantic = true; key.move = k.move ?? 'push'; if (k.side) key.side = k.side; if (k.angle) key.angle = k.angle; if (k.size) key.size = k.size; if (k.with) key.with = [...k.with]; if (k.reaction) key.reaction = true;
      if (key.push) key.push = { ...key.push, from: parseAnchor(k.at, fps), ...(key.push.punchAt ? { punchAt: parseAnchor(key.push.punchAt, fps) } : {}) };
      const primary = subjects[0];
      if ((k.move ?? 'push') === 'follow' && primary) {
        if (!primary.moveId) throw new Error(`shot ${shot.id}: follow camera needs a moving id on "${primary.id}"`);
        const a0 = (baseAngleFor(k, info) * Math.PI) / 180;
        const isFx = !(out.actors ?? []).some((a) => a.id === primary.moveId || a.who === primary.moveId);
        const eye = isFx ? 0 : (primary.seated ? primary.measure.eyeSeated : primary.measure.eye) * primary.scale;
        key.pos = { at: primary.moveId, d: [Math.sin(a0) * solved.debug.distance, eye + (isFx ? 0.2 : 0.2), Math.cos(a0) * solved.debug.distance] };
        key.look = { at: primary.moveId, d: [0, isFx ? 0 : eye * 0.9, 0] };
      }
      cameras.push(key);
      if (k.to && k.move === 'reveal') {
        const endAnchor = { frame: f + Math.round((k.glide ?? 0.8) * fps) };
        const target = subjectSamples(k.to, out, out, Math.max(f, endAnchor.frame - 1), endAnchor.frame + 1, [], ctx, 'to');
        const targetSolved = solveCamera({ key: { ...k, at: endAnchor.frame, on: [k.to], size: k.toSize ?? k.size, cut: false }, subjects: [target], setInfo: info, keepout });
        cameras.push({ ...targetSolved.key, at: endAnchor, pos: targetSolved.key.pos, look: targetSolved.key.look, subjects: targetSolved.key.subjects.filter((id) => (out.actors ?? []).some((a) => a.who === id) || (out.fx ?? []).some((e) => e.id === id)), dur: Math.round((k.glide ?? 0.8) * fps) });
      }
      if (!shot.dof && solved.debug.dof > 0) dofs.push({ at: parseAnchor(k.at, fps), cInf: solved.debug.dof, dur: 0, ...(primary ? { focus: [primary.pos[0], primary.pos[1] + (primary.seated ? primary.measure.eyeSeated : primary.measure.eye) * primary.scale, primary.pos[2]] } : {}) });
    } else {
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
  }
  const rawShot = shot.raw ?? {};
  if (shot.raw) ctx.raw++;
  if (!cameras.length && rawShot.camera) cameras.push(...rawShot.camera.map((k) => ({ ...k, ...(typeof k.at === 'string' ? { at: parseAnchor(k.at, fps) } : {}) })));
  if (cameras.length) out.camera = cameras.sort((a, b) => ctx.anchorFrame(a.at, start) - ctx.anchorFrame(b.at, start));
  applyFaces(out, cameras, ctx);
  if (shot.dof) out.dof = shot.dof.map((d) => compileDof(d, { ...ctx, sets }));
  else if (dofs.length) out.dof = dofs;
  if (rawShot.camera) delete rawShot.camera;
  Object.assign(out, rawShot);
  return out;
};

const baseAngleFor = (k, info) => (info.front ?? 0) + ({ front: 0, left: -30, right: 30, frontLeft: -15, frontRight: 15 }[k.side ?? 'front'] ?? 0);

export function compileBoard(board, words, catalog) {
  const fps = board.fps ?? FPS;
  const end = Math.round((words[words.length - 1]?.b ?? 0) * fps);
  const ctx = {
    board, words, catalog, fps, cast: {}, raw: 0,
    anchorFrame: (a, shotStart = 0) => {
      if (a.shot) return shotStart + (a.offset ?? 0);
      if (a.frame !== undefined) return a.frame;
      if (a.end) return end + (a.offset ?? 0);
      if (a.wordIndex !== undefined) {
        const hit = words.filter((w) => w.line === a.line)[a.wordIndex];
        if (!hit) throw new Error(`no word index ${a.line}:${a.wordIndex}`);
        return Math.round(hit.a * fps) + (a.offset ?? 0);
      }
      const hit = words.filter((w) => w.line === a.line && normalizeWord(w.w) === normalizeWord(a.word))[a.nth ?? 0];
      if (!hit) throw new Error(`no word ${a.line}:${a.word}`);
      return Math.round(hit.a * fps) + (a.offset ?? 0);
    },
  };
  const ctx0 = Object.entries(board.cast ?? {}).filter(([, d]) => !d.group);
  const out = {
    version: 1, fps, tailFrames: board.tailFrames ?? 36, crossfade: board.crossfade ?? 10,
    ...(board.flash !== undefined ? { flash: parseAnchor(board.flash, fps) } : {}),
    ...(board.points ? { points: Object.fromEntries(Object.entries(board.points).map(([k, v]) => [k, resolvePoint(v, [], catalog)])) } : {}),
  };
  for (const [id, def] of ctx0) ctx.cast[id] = { spec: def.spec, seed: def.seed ?? stableSeed(id) };
  const starts = (board.shots ?? []).map((s) => ctx.anchorFrame(parseAnchor(s.start, fps)));
  if (board.partial) for (const s of board.shots ?? []) if (s.end === undefined) throw new Error(`shot ${s.id} needs an explicit end anchor in a partial board`);
  out.shots = (board.shots ?? []).map((s, i) => compileShot(s, board, words, catalog, fps, ctx, s.end !== undefined ? ctx.anchorFrame(parseAnchor(s.end, fps), starts[i]) : i + 1 < starts.length ? starts[i + 1] : end + (board.tailFrames ?? 36)));
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
