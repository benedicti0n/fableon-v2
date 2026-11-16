// `fableon frames`: project every named camera subject into the frame at the key and every 6th frame, check the
// Shorts safe area, head visibility and line-of-sight occlusion. Works on any v1 storyboard.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectDir, requireFile } from './project.js';
import { ROOT, RENDER_CJS, run } from './env.js';
import { blocked } from './solver.js';
import { BANDS, HIDDEN_FRACTION, CONTEXT_AREA, CONTEXT_VISIBLE, BLOCKER_AREA, BLOCKER_OVERLAP, BLOCKER_MIN_AREA, SPEAKER_AREA, EYE_MIN, EYE_MAX, EDGE_X, EDGE_TOP, EDGE_INTRUDER_AREA, EDGE_INTRUDER_VISIBLE, MERGE_OVERLAP, LOOK_AWAY_TOL, MIN_KEY_FRAMES, ENTRY_GRACE, ACTION_AREA, FLAT_WIDE_AREA, JUMP_CUT_DEG, SETTLE_CUT, SAMPLE_EVERY, AMBIENT_EFFECTS, FIX, inferSize, isMovingKey } from './composition.js';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z']/g, '');
const D2R = Math.PI / 180;

export const makeContext = (dir) => {
  const sb = JSON.parse(readFileSync(requireFile(dir, 'storyboard.json'), 'utf8'));
  const words = JSON.parse(readFileSync(requireFile(dir, 'words.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const fps = sb.fps ?? 30;
  const END = Math.round((words[words.length - 1]?.b ?? 0) * fps);
  const anchor = (a, shotStart = 0) => {
    if (a.shot) return shotStart + (a.offset ?? 0);
    if (a.frame !== undefined) return a.frame + (a.offset ?? 0);
    if (a.end) return END + (a.offset ?? 0);
    const hit = words.filter((w) => w.line === a.line && norm(w.w) === norm(a.word))[a.nth ?? 0];
    return hit ? Math.round(hit.a * fps) + (a.offset ?? 0) : 0;
  };
  const ctx = { sb, words, catalog, fps, END, anchor, targets: new Map() };
  for (const shot of sb.shots ?? []) {
    const start = anchor(shot.start);
    for (const a of shot.actors ?? []) if (a.id) ctx.targets.set(a.id, (f) => a.motion ? motionAt(ctx, a.motion, f, a.pos ? pointAt(ctx, a.pos, f) : [0, 0, 0]) : pointAt(ctx, a.pos, f));
    for (const e of shot.fx ?? []) if (e.id) ctx.targets.set(e.id, (f) => e.motion ? motionAt(ctx, e.motion, f, e.pos ? pointAt(ctx, e.pos, f) : [0, 0, 0]) : pointAt(ctx, e.pos, f));
    for (const x of shot.set ?? []) if (x.piece === 'boat' && x.id) ctx.targets.set(x.id, (f) => motionAt(ctx, x.motion, f, [0, 0, 0]));
  }
  return ctx;
};

const resolveNamed = (ctx, p, f = 0, depth = 0) => {
  if (Array.isArray(p)) return p;
  if (!p || typeof p !== 'object') throw new Error(`bad point ${JSON.stringify(p)}`);
  if (p.at && typeof p.at === 'string') {
    const named = ctx.sb.points?.[p.at], place = ctx.catalog.places[p.at], target = ctx.targets.get(p.at);
    if (named && depth < 16) return (([x, y, z]) => [x + (p.d?.[0] ?? 0), y + (p.d?.[1] ?? 0), z + (p.d?.[2] ?? 0)])(resolveNamed(ctx, named, f, depth + 1));
    if (target) return (([x, y, z]) => [x + (p.d?.[0] ?? 0), y + (p.d?.[1] ?? 0), z + (p.d?.[2] ?? 0)])(target(f));
    if (place) return [place[0] + (p.d?.[0] ?? 0), place[1] + (p.d?.[1] ?? 0), place[2] + (p.d?.[2] ?? 0)];
  }
  throw new Error(`unknown point "${p.at}"`);
};
const pointAt = (ctx, p, f = 0) => resolveNamed(ctx, p, f);

const castSpec = (ctx, id) => {
  const e = ctx.sb.cast?.[id];
  if (!e) return null;
  if (typeof e.spec === 'object') return e.spec;
  const [g, ...rest] = String(e.spec).split('.');
  const list = g === 'C' ? ctx.catalog.cast.C : g === 'KIDS' ? ctx.catalog.cast.KIDS : null;
  return list?.find((x) => x.name === rest.join('.'))?.spec ?? null;
};

const markPos = (ctx, name, sets) => {
  const [a, b] = String(name).includes('.') ? String(name).split('.', 2) : [null, String(name)];
  for (const set of b === null ? sets : [a, ...sets.filter((x) => x !== a)]) {
    const info = ctx.catalog.sets.find((x) => x.name === set);
    const m = info?.marks?.find((x) => x.name === b); if (m) return m.pos;
  }
  if (ctx.catalog.places[name]) return ctx.catalog.places[name];
  throw new Error(`unknown mark "${name}"`);
};
const motionAt = (ctx, m, f, p0) => {
  if (m.type === 'ballistic') {
    const u = Math.max(0, (f - ctx.anchor(m.at)) / ctx.fps - (m.delay ?? 0));
    return [p0[0] + m.v[0] * u + m.a[0] * u * u, p0[1] + m.v[1] * u + m.a[1] * u * u, p0[2] + m.v[2] * u + m.a[2] * u * u];
  }
  const keys = m.keys.map(([a, p]) => [ctx.anchor(a), pointAt(ctx, p, f)]).sort((x, y) => x[0] - y[0]);
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  let i = 0; while (i + 1 < keys.length && f >= keys[i + 1][0]) i++;
  const [f0, a] = keys[i], [f1, b] = keys[i + 1], u = f1 === f0 ? 1 : (f - f0) / (f1 - f0);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};

const actorState = (ctx, shot, actor, f, start) => {
  let st = { ...actor };
  for (const b of actor.beats ?? []) if (f >= ctx.anchor(b.at, start)) st = { ...st, ...b };
  const vis = st.visible;
  if (vis && (f < ctx.anchor(vis.from, start) || f >= ctx.anchor(vis.to, start))) return null;
  const base = actor.motion ? (actor.pos ? pointAt(ctx, actor.pos, f) : [0, 0, 0]) : pointAt(ctx, actor.pos, f);
  const pos = actor.motion ? motionAt(ctx, actor.motion, f, base) : base;
  const ap = st.appear;
  const pop = ap ? Math.max(0, Math.min(1, (f - ctx.anchor(ap.at, start)) / ctx.fps / (ap.pop ?? 0.18))) : 1;
  const scale = (st.scale ?? 1) * pop;
  if (scale === 0) return null;
  const spec = castSpec(ctx, actor.who) ?? { build: 'adult' };
  const key = actor.special ?? spec.build ?? 'adult';
  const measure = ctx.catalog.measure[key] ?? ctx.catalog.measure.adult;
  return { pos, measure, scale, seated: !!st.seated, facing: st.facing ?? 0, look: st.look ?? 0, mirror: !!st.mirror, prop: st.prop ?? null, face: actor.face };
};

const effectState = (ctx, shot, fx, f, start) => {
  if (!fx.pos || (typeof fx.pos === 'object' && !Array.isArray(fx.pos) && (fx.pos.actor || (fx.pos.at === undefined && !fx.pos.mark)))) return null;
  if (fx.visible && (f < ctx.anchor(fx.visible.from, start) || f >= ctx.anchor(fx.visible.to, start))) return null;
  if (fx.at && f < ctx.anchor(fx.at, start)) return null;
  if (fx.until && f >= ctx.anchor(fx.until, start)) return null;
  const pos = fx.motion ? motionAt(ctx, fx.motion, f, fx.pos ? pointAt(ctx, fx.pos, f) : [0, 0, 0]) : pointAt(ctx, fx.pos, f);
  const measure = ctx.catalog.measure[fx.kind] ?? { standing: 0.9, seated: 0.9, eye: 0.6, eyeSeated: 0.6, head: 0.25, halfWidth: 0.35 };
  const sz = fx.size;
  const card = Array.isArray(sz) ? { w: sz[0], h: sz[1] } : typeof sz === 'number' ? { w: sz, h: sz } : { w: 2 * measure.halfWidth, h: measure.standing };
  return { kind: 'effect', id: fx.id ?? fx.kind, pos, measure, scale: 1, seated: false, card };
};
const stateFor = (ctx, shot, id, f, start) => {
  const actor = (shot.actors ?? []).find((a) => a.id === id || a.who === id);
  if (actor) { const s = actorState(ctx, shot, actor, f, start); return s ? { ...s, kind: 'actor', id } : null; }
  const fx = (shot.fx ?? []).find((e) => e.id === id);
  if (fx) return effectState(ctx, shot, fx, f, start);
  return { kind: 'mark', id, pos: markPos(ctx, id, shot.sets ?? []), measure: ctx.catalog.measure.adult, scale: 1, seated: false };
};
const eyeOf = (s) => [s.pos[0], s.pos[1] + (s.seated ? s.measure.eyeSeated : s.measure.eye) * s.scale, s.pos[2]];
const headOf = (s) => [s.pos[0], s.pos[1] + (s.seated ? s.measure.seated : s.measure.standing) * s.scale, s.pos[2]];

const basis = (pos, look, roll = 0) => {
  const f = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]];
  const fl = Math.hypot(...f) || 1; f[0] /= fl; f[1] /= fl; f[2] /= fl;
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r) || 1; r[0] /= rl; r[2] /= rl;
  let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    const u2 = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
    r = r2; u = u2;
  }
  return { f, r, u };
};

const project = (p, basis, pos, fov, aspect = 9 / 16) => {
  const v = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
  const z = v[0] * basis.f[0] + v[1] * basis.f[1] + v[2] * basis.f[2];
  if (z <= 0) return null;
  const x = v[0] * basis.r[0] + v[1] * basis.r[1] + v[2] * basis.r[2];
  const y = v[0] * basis.u[0] + v[1] * basis.u[1] + v[2] * basis.u[2];
  const tx = Math.tan((fov * D2R) / 2) * aspect, ty = Math.tan((fov * D2R) / 2);
  return { u: (x / z / tx + 1) / 2, v: (1 - y / z / ty) / 2 };
};

/** Project a subject/effect state into the frame and measure safe-area, head and area. */
export function projectState(ctx, key, s, f) {
  const pos = pointAt(ctx, key.pos, f), look = pointAt(ctx, key.look, f);
  const b = basis(pos, look, key.roll ?? 0);
  const right = b.r;
  let half, y0, y1;
  if (s.kind === 'effect' || s.kind === 'mark') {
    const card = s.card ?? { w: 2 * s.measure.halfWidth * s.scale, h: s.measure.standing * s.scale };
    half = card.w / 2; y0 = s.pos[1] - card.h / 2; y1 = s.pos[1] + card.h / 2;
  } else {
    half = s.measure.halfWidth * s.scale;
    const fullH = (s.seated ? s.measure.seated : s.measure.standing) * s.scale;
    const eyeY = s.pos[1] + (s.seated ? s.measure.eyeSeated : s.measure.eye) * s.scale;
    const mode = (key.fov ?? 40) <= 38 ? 'close' : (key.fov ?? 40) <= 40 ? 'medium' : 'full';
    const covered = mode === 'close' ? Math.min(fullH, 2.4 * s.measure.head * s.scale) : mode === 'medium' ? Math.min(fullH, 0.62 * s.measure.standing * s.scale) : fullH;
    y0 = mode === 'full' ? s.pos[1] : eyeY - 0.6 * covered;
    y1 = mode === 'full' ? s.pos[1] + fullH : eyeY + 0.4 * covered;
  }
  const corners = [];
  for (const dx of [-half, half]) for (const y of [y0, y1]) for (const dz of [-0.02, 0.02]) {
    const p = [s.pos[0] + right[0] * dx + b.f[0] * dz, y, s.pos[2] + right[2] * dx + b.f[2] * dz];
    const q = project(p, b, pos, key.fov);
    if (q) corners.push(q);
  }
  if (!corners.length) return { frame: f, outside: 1, headOutside: true, headFullyInside: false, height: 9, eye: 0.5, box: null, area: 1 };
  const minU = Math.min(...corners.map((c) => c.u)), maxU = Math.max(...corners.map((c) => c.u));
  const minV = Math.min(...corners.map((c) => c.v)), maxV = Math.max(...corners.map((c) => c.v));
  const safe = { l: 0.04, r: 0.96, t: 0.06, b: 0.85 };
  const iw = Math.max(0, Math.min(maxU, safe.r) - Math.max(minU, safe.l));
  const ih = Math.max(0, Math.min(maxV, safe.b) - Math.max(minV, safe.t));
  const boxArea = Math.max(1e-9, (maxU - minU) * (maxV - minV));
  const outside = Math.max(0, Math.min(1, 1 - (iw * ih) / boxArea));
  const frameArea = Math.max(0, Math.min(maxU, 1) - Math.max(minU, 0)) * Math.max(0, Math.min(maxV, 1) - Math.max(minV, 0));
  const headCenter = [s.pos[0], s.pos[1] + (s.seated ? s.measure.seated : s.measure.standing) * s.scale - s.measure.head * s.scale * 0.5, s.pos[2]];
  const hh = Math.max(0.05, s.measure.head * s.scale * 0.5), hw = Math.max(0.05, s.measure.head * s.scale * 0.35);
  const headCorners = [];
  for (const dx of [-hw, hw]) for (const dy of [-hh, hh]) {
    const p = [headCenter[0] + right[0] * dx, headCenter[1] + dy, headCenter[2] + right[2] * dx];
    const q = project(p, b, pos, key.fov); if (q) headCorners.push(q);
  }
  const head = project(headCenter, b, pos, key.fov);
  const eye = project(eyeOf(s), b, pos, key.fov);
  const headOutside = !head || head.u < 0 || head.u > 1 || head.v < 0 || head.v > 1;
  const headFullyInside = headCorners.length === 4 && headCorners.every((c) => c.u >= 0 && c.u <= 1 && c.v >= 0 && c.v <= 1);
  const dist = Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1], s.pos[2] - pos[2]);
  return {
    kind: s.kind, frame: f, box: { u0: minU, v0: minV, u1: maxU, v1: maxV }, outside, area: Math.max(0, Math.min(1, frameArea)),
    headOutside, headFullyInside, height: Math.max(0, maxV - minV), eye: eye?.v ?? 0.5, eyeU: eye?.u ?? 0, dist,
    head: head ? { u: head.u, v: head.v } : null,
    blocked: blocked(pos, headCenter, [] )?.name ?? null,
    cameraInside: false,
  };
}

export function projectSubject(ctx, shot, actor, key, f, start, keepout = [], override = null) {
  const s0 = override ?? actorState(ctx, shot, actor, f, start);
  if (!s0) return null;
  const s = { ...s0, kind: 'actor', ...(override ?? {}) };
  const r = projectState(ctx, key, s, f);
  const pos = pointAt(ctx, key.pos, f);
  const b = basis(pos, pointAt(ctx, key.look, f), key.roll ?? 0);
  const headCenter = [s.pos[0], s.pos[1] + (s.seated ? s.measure.seated : s.measure.standing) * s.scale - s.measure.head * s.scale * 0.5, s.pos[2]];
  const blockedBy = blocked(pos, headCenter, keepout);
  const cameraInside = !!(keepout.find((v) => v.kind === 'box'
    ? pos[0] >= v.min[0] && pos[0] <= v.max[0] && pos[1] >= v.min[1] && pos[1] <= v.max[1] && pos[2] >= v.min[2] && pos[2] <= v.max[2]
    : pos[1] >= v.y0 && pos[1] <= v.y1 && (pos[0] - v.x) ** 2 + (pos[2] - v.z) ** 2 <= v.r ** 2));
  return { ...r, blocked: blockedBy?.name ?? null, cameraInside, _state: s };
}

/** Frames sampled for a key: static keys settle/mid/end-2; moving keys start/mid/end-2. */
export function sampleKeyFrames(k, kf, end, xfade = 0) {
  const cutWait = k.cut ? SETTLE_CUT : 0;
  let settle;
  if (isMovingKey(k)) settle = Math.min(Math.max(kf, end - 1), kf + Math.max(cutWait, xfade));
  else {
    const finish = Math.max(cutWait, k.dur ?? 0, k.tiltDur ?? 0, xfade);
    settle = Math.min(Math.max(kf, end - 1), kf + finish);
  }
  const mid = Math.floor((settle + end - 1) / 2);
  const frames = [settle, mid, Math.max(settle, end - 2)];
  if (end - settle > 60) for (let f = settle + SAMPLE_EVERY; f < end - 2; f += SAMPLE_EVERY) frames.push(f);
  return [...new Set(frames)].sort((a, b) => a - b);
}

export function checkFrames(dirArg, opts = {}) {
  const dir = projectDir(dirArg);
  const ctx = makeContext(dir);
  const catalog = ctx.catalog;
  const rows = [], errors = [], warnings = [];
  const shots = ctx.sb.shots ?? [];
  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si];
    const start = ctx.anchor(shot.start);
    const endShot = shot.end ? ctx.anchor(shot.end, start) : si + 1 < shots.length ? ctx.anchor(shots[si + 1].start) : ctx.END + (ctx.sb.tailFrames ?? 36);
    const keys = (shot.camera ?? []).map((k) => ({ k, f: ctx.anchor(k.at, start) })).sort((a, b) => a.f - b.f);
    keys.forEach(({ k, f: kf }, ki) => {
      const end = ki + 1 < keys.length ? keys[ki + 1].f : endShot;
      const subjectIds = k.subjects ?? [];
      const later = new Set(k.later ?? []);
      if (!subjectIds.length && !k.scenery) errors.push({ shot: shot.id, key: kf, frame: kf, subject: '-', error: 'empty key (mark scenery:true)' });
      const invisible = new Map(), entered = new Set();
      for (let f = kf; f < Math.max(kf + 1, end); f += 6) {
        for (const id of subjectIds) {
          const st = stateFor(ctx, shot, id, f, start);
          if (!st) {
            const n = (invisible.get(id) ?? 0) + 1; invisible.set(id, n);
            if (!later.has(id) || entered.has(id)) {
              if (n > 6) errors.push({ shot: shot.id, key: kf, frame: f, subject: id, error: `subject ${id} not visible` });
            }
            continue;
          }
          invisible.set(id, 0); entered.add(id);
          if (st.kind === 'mark') { errors.push({ shot: shot.id, key: kf, frame: f, subject: id, error: 'subject is not an actor in this shot' }); continue; }
          const r = projectState(ctx, keyForProjection(k, f, start), st, f);
          const blockedBy = blocked(pointAt(ctx, k.pos, f), [st.pos[0], st.pos[1] + (st.seated ? st.measure.seated : st.measure.standing) * st.scale - st.measure.head * st.scale * 0.5, st.pos[2]], opts.keepout ?? catalog.keepout?.[shot.sets?.[0]] ?? []);
          const row = { shot: shot.id, key: kf, frame: f, subject: id, outside: +r.outside.toFixed(3), eye: +r.eye.toFixed(3), blocked: blockedBy?.name ?? null, headOutside: r.headOutside, height: +r.height.toFixed(2) };
          rows.push(row);
          if (r.kind === 'actor' && (!r.headFullyInside || r.height > 3)) errors.push({ ...row, error: `subject too close ${id}: ${!r.headFullyInside ? 'head not fully inside' : 'height > 3x frame'}` });
          else if (r.outside > 0.1) errors.push({ ...row, error: `subject ${(r.outside * 100).toFixed(0)}% outside safe area` });
          if (blockedBy) errors.push({ ...row, error: `line of sight blocked by ${blockedBy.name}` });
          const primary = subjectIds[0] === id;
          if (primary && (k.fov ?? 40) <= 40 && (r.eye < 0.3 || r.eye > 0.5)) warnings.push({ ...row, warning: `eye line ${(r.eye * 100).toFixed(0)}% outside 30-50%` });
          const camPos = pointAt(ctx, k.pos, f);

          // foreground blockers: visible non-subject actors and effect cards
          const primaryState = subjectIds.length ? stateFor(ctx, shot, subjectIds[0], f, start) : null;
          const primaryDist = primaryState ? Math.hypot(primaryState.pos[0] - camPos[0], primaryState.pos[1] - camPos[1], primaryState.pos[2] - camPos[2]) : Infinity;
          const skip = new Set([...subjectIds, k.over].filter(Boolean));
          for (const a of shot.actors ?? []) {
            const aid = a.id ?? a.who; if (skip.has(aid) || skip.has(a.who)) continue;
            const bs = actorState(ctx, shot, a, f, start); if (!bs) continue;
            const br = projectState(ctx, keyForProjection(k, f, start), { ...bs, kind: 'actor' }, f);
            if (!br.box) continue;
            const cam = Math.hypot(bs.pos[0] - camPos[0], bs.pos[1] - camPos[1], bs.pos[2] - camPos[2]);
            const corner = br.box && (((br.box.u0 + br.box.u1) / 2 < 0.3) || ((br.box.u0 + br.box.u1) / 2 > 0.7)) && ((br.box.v0 + br.box.v1) / 2 > 0.45);
            if (!corner && ((br.area > 0.3 && cam < primaryDist - 0.2) || (cam < 1.2 && br.area > 0))) errors.push({ shot: shot.id, key: kf, frame: f, subject: aid, error: `foreground blocker ${aid}` });
          }
          for (const e of shot.fx ?? []) {
            const eid = e.id ?? e.kind; if (skip.has(eid)) continue;
            const es = effectState(ctx, shot, e, f, start); if (!es) continue;
            const er = projectState(ctx, keyForProjection(k, f, start), es, f);
            if (!er.box) continue;
            const cam = Math.hypot(es.pos[0] - camPos[0], es.pos[1] - camPos[1], es.pos[2] - camPos[2]);
            if (((er.area > 0.3 && cam < primaryDist - 0.2 && !['halo', 'fire', 'smoke', 'burst', 'splash', 'petals', 'puff', 'stars'].includes(e.kind))) || (cam < 1.2 && er.area > 0)) errors.push({ shot: shot.id, key: kf, frame: f, subject: eid, error: `foreground blocker ${eid}` });
          }
        }
        const camPos0 = pointAt(ctx, k.pos, f);
        const ko = opts.keepout ?? catalog.keepout?.[shot.sets?.[0]] ?? [];
        const camInside = ko.find((v) => v.kind === 'box' ? camPos0[0] >= v.min[0] && camPos0[0] <= v.max[0] && camPos0[1] >= v.min[1] && camPos0[1] <= v.max[1] && camPos0[2] >= v.min[2] && camPos0[2] <= v.max[2] : camPos0[1] >= v.y0 && camPos0[1] <= v.y1 && (camPos0[0] - v.x) ** 2 + (camPos0[2] - v.z) ** 2 <= v.r ** 2);
        if (camInside && subjectIds.length) errors.push({ shot: shot.id, key: kf, frame: f, subject: subjectIds[0], error: 'camera inside a keep-out volume' });
      }
    });
  }
  const file = join(dir, 'frames.json');
  writeFileSync(file, JSON.stringify({ rows, errors, warnings }, null, 2) + '\n');
  return { ok: errors.length === 0, rows, errors, warnings, file };
}

function keyForProjection(k, f, start) { return { ...k, pos: k.pos, look: k.look }; }

const findMark = (ctx, id) => {
  const raw = String(id).startsWith('mark:') ? String(id).slice(5) : String(id);
  const [set, name] = raw.includes('.') ? [raw.split('.')[0], raw.split('.').slice(1).join('.')] : [null, raw];
  for (const s of ctx.catalog.sets) {
    if (set && s.name !== set) continue;
    const m = s.marks?.find((x) => x.name === name); if (m) return { set: s.name, ...m };
  }
  return null;
};
const normalizeWith = (id, ctx) => {
  const mark = findMark(ctx, id); if (mark?.ids?.length) return mark.ids;
  return mark ? `mark:${mark.set}.${mark.name}` : id;
};
const withGroups = (id, ctx) => {
  const mark = findMark(ctx, id); if (mark?.ids?.length) return { id, ids: mark.ids, box: mark.box };
  return { id, ids: [normalizeWith(id, ctx)], box: mark?.box };
};
const projectBoxFill = (ctx, k, box, f) => {
  if (!box) return 0;
  const pos = pointAt(ctx, k.pos, f), look = pointAt(ctx, k.look, f), b = basis(pos, look, k.roll ?? 0);
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) {
    const q = project([x, y, z], b, pos, k.fov ?? 40); if (!q) continue;
    x0 = Math.min(x0, q.u); x1 = Math.max(x1, q.u); y0 = Math.min(y0, q.v); y1 = Math.max(y1, q.v);
  }
  return Math.max(x1 - x0, y1 - y0);
};
const talkAt = (actor, f, start, ctx) => {
  let talk = actor.talk;
  for (const b of actor.beats ?? []) if (f >= ctx.anchor(b.at, start) && b.talk !== undefined) talk = b.talk;
  return !!talk;
};
const overlap = (a, b) => {
  if (!a || !b) return 0;
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return (w * h) / Math.max(1e-9, (a.x1 - a.x0) * (a.y1 - a.y0));
};
const screenU = (ctx, k, p, f) => {
  const pos = pointAt(ctx, k.pos, f), look = pointAt(ctx, k.look, f);
  const b = basis(pos, look, k.roll ?? 0);
  const v = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
  const z = v[0] * b.f[0] + v[1] * b.f[1] + v[2] * b.f[2];
  if (z <= 0) return 0.5;
  const x = v[0] * b.r[0] + v[1] * b.r[1] + v[2] * b.r[2];
  return 0.5 + x / z / (2 * Math.tan(((k.fov ?? 40) * D2R) / 2) * (9 / 16));
};
const activeFace = (actor, f, start, ctx) => {
  let face = actor.face;
  for (const b of actor.beats ?? []) if (b.face !== undefined && f >= ctx.anchor(b.at, start)) face = b.face;
  return face;
};
const activeProp = (actor, f, start, ctx) => {
  let prop = actor.prop;
  for (const b of actor.beats ?? []) if (b.prop !== undefined && f >= ctx.anchor(b.at, start)) prop = b.prop;
  return prop;
};
const targetPoint = (ctx, shot, id, f, start) => {
  const st = stateFor(ctx, shot, id, f, start);
  if (st) return [st.pos[0], st.pos[1] + (st.seated ? st.measure.eyeSeated : st.measure.eye) * st.scale, st.pos[2]];
  return null;
};
const overlapArea = (a, b) => {
  if (!a || !b) return 0;
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return w * h;
};

export async function checkFramesMeasured(dirArg, opts = {}) {
  const dir = projectDir(dirArg);
  const preErrors = [], preWarnings = [];
  const ctx = makeContext(dir);
  const shots = ctx.sb.shots ?? [];
  const jobs = [], keyMeta = [];
  const crossfade = ctx.sb.crossfade ?? 10;
  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si];
    const start = ctx.anchor(shot.start);
    const endShot = shot.end ? ctx.anchor(shot.end, start) : si + 1 < shots.length ? ctx.anchor(shots[si + 1].start) : ctx.END + (ctx.sb.tailFrames ?? 36);
    const keys = (shot.camera ?? []).map((k) => ({ k, f: ctx.anchor(k.at, start) })).sort((a, b) => a.f - b.f);
    keys.forEach(({ k, f: kf }, ki) => {
      const end = ki + 1 < keys.length ? keys[ki + 1].f : endShot;
      if (ki === 0 && kf > start) { const code = k.semantic ? preErrors : preWarnings; code.push({ shot: shot.id, key: ki, frame: kf, subject: k.subjects?.[0] ?? '-', code: 'first key late', message: `first key late: starts ${kf - start} frames after the shot`, fix: FIX.firstKey }); }
      if (end - kf < MIN_KEY_FRAMES) { const code = k.semantic ? preErrors : preWarnings; code.push({ shot: shot.id, key: ki, frame: kf, subject: k.subjects?.[0] ?? '-', code: 'key too short', message: `key too short: ${end - kf} frames (< ${MIN_KEY_FRAMES})`, fix: FIX.keyShort }); }
      if (k.cut && (k.move === 'glide' || k.move === 'crane' || k.glide !== undefined)) { const code = k.semantic ? preErrors : preWarnings; code.push({ shot: shot.id, key: ki, frame: kf, subject: k.subjects?.[0] ?? '-', code: 'glide with cut', message: 'glide/crane cannot be combined with cut', fix: FIX.glideCut }); }
      const xf = si && ki === 0 && shots[si - 1].light !== shot.light ? crossfade / 2 : 0;
      const frames = sampleKeyFrames(k, kf, end, xf);
      const withSpecs = (k.with ?? []).map((id) => withGroups(id, ctx));
      const withIds = [...new Set(withSpecs.flatMap((x) => x.ids))];
      const edgeIds = (shot.actors ?? []).map((a) => a.id ?? a.who).filter((id) => !(k.subjects ?? []).includes(id) && id !== k.over);
      for (const f of frames) {
        const idx = jobs.length;
        jobs.push({ frame: f, subjects: k.subjects ?? [], over: k.over ?? null, with: withIds, edge: edgeIds });
        keyMeta.push({ si, ki, shot, shotId: shot.id, k, start, kf, end, f, idx, with: withSpecs, withIds, edge: edgeIds });
      }
    });
  }
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-cov-'));
  try {
    const jobsFile = join(tmp, 'jobs.json'), outFile = join(tmp, 'cov.json');
    writeFileSync(jobsFile, JSON.stringify(jobs));
    await run(process.execPath, [RENDER_CJS, 'coverage', '--jobs', jobsFile, '--out', outFile, '--project', dir, '--size', '180x320', '--msaa', '0'], { cwd: ROOT });
    const cov = JSON.parse(readFileSync(outFile, 'utf8'));
    const errors = [...preErrors], warnings = [...preWarnings], rows = [], actionSeen = new Set();
    const byKey = new Map();
    for (const m of keyMeta) {
      const keyId = `${m.si}/${m.ki}`;
      if (!byKey.has(keyId)) byKey.set(keyId, { ...m, frames: [] });
      byKey.get(keyId).frames.push(m.f);
    }
    let totalMs = 0;
    for (let i = 0; i < keyMeta.length; i++) {
      const m = keyMeta[i], r = cov[i]; totalMs += r?.ms ?? 0;
      if (!r) continue;
      const k = m.k, size = k.size ?? inferSize(k.fov);
      const band = BANDS[size] ?? BANDS.medium;
      const subjects = k.subjects ?? [];
      const itemsById = new Map((r.items ?? []).map((x) => [x.id, x]));
      const idsById = new Map((r.ids ?? []).map((x) => [x.id, x]));
      const peopleById = new Map((r.people ?? []).map((x) => [x.id, x]));
      const primary = subjects[0];
      const ppl = primary ? peopleById.get(primary) : null;
      const pstat = primary ? idsById.get(primary) : null;
      const head = ppl ? Math.max(0, ppl.headBox.y1 - ppl.headBox.y0) : null;
      const body = pstat ? Math.max(0, pstat.bbox.y1 - pstat.bbox.y0) : null;
      const metric = band.metric === 'head' ? head : body;
      const add = (list, code, id, message, fix = '') => list.push({ shot: m.shotId, key: m.ki, frame: m.f, subject: id, code, message, fix });
      const sev = k.semantic ? 'error' : 'warning';
      const push = (code, id, message, fix) => add(sev === 'error' ? errors : warnings, code, id, message, fix);
      const markBox = primary ? findMark(ctx, primary)?.box : null;
      if (primary && size === 'insert' && markBox) {
        const fill = projectBoxFill(ctx, keyForProjection(k, m.f, m.start), markBox, m.f);
        if (fill < band.min) push('subject too small', primary, `subject too small ${primary}: insert fill ${(fill * 100).toFixed(0)}% below ${(band.min * 100).toFixed(0)}%`, FIX.tooSmall);
        else if (fill > band.max) push('subject too large', primary, `subject too large ${primary}: insert fill ${(fill * 100).toFixed(0)}% above ${(band.max * 100).toFixed(0)}%`, FIX.tooLarge);
      } else if (primary && metric !== null) {
        if (metric < band.min) push('subject too small', primary, `subject too small ${primary}: ${(metric * 100).toFixed(0)}% below ${size} floor ${(band.min * 100).toFixed(0)}%`, FIX.tooSmall);
        else if (metric > band.max) push('subject too large', primary, `subject too large ${primary}: ${(metric * 100).toFixed(0)}% above ${size} ceiling ${(band.max * 100).toFixed(0)}%`, FIX.tooLarge);
      }
      for (const id of subjects.slice(1)) {
        const p = peopleById.get(id), s = idsById.get(id), h = p ? Math.max(0, p.headBox.y1 - p.headBox.y0) : null, b = s ? Math.max(0, s.bbox.y1 - s.bbox.y0) : null;
        const v = band.metric === 'head' ? h : b;
        if (v !== null && v < band.floor) push('subject too small', id, `subject too small ${id}: ${(v * 100).toFixed(0)}% below ${size} floor ${(band.floor * 100).toFixed(0)}%`, FIX.tooSmall);
      }
      for (const id of [...subjects, ...(k.over ? [k.over] : [])]) {
        const p = peopleById.get(id); if (!p || !p.headBox) continue;
        const hb = p.headBox, close = size === 'close';
        const x0 = Math.min(hb.x0, hb.x1), x1 = Math.max(hb.x0, hb.x1), y0 = Math.min(hb.y0, hb.y1), y1 = Math.max(hb.y0, hb.y1);
        if (x0 < 0 || x1 > 1 || y0 < 0 || (y1 > 1 && !(close && p.chin?.y <= 1))) push('head cut', id, `head cut ${id}: head box crosses the frame edge`, FIX.headCut);
        if (x0 < EDGE_X || x1 > 1 - EDGE_X || y0 < EDGE_TOP) push('edge', id, `edge ${id}: head crosses the ${(y0 < EDGE_TOP ? 'top' : x0 < EDGE_X ? 'left' : 'right')} safe margin`, FIX.edge);
        if (id !== k.over && (r.subjects?.[id] ?? 0) < HIDDEN_FRACTION) push('subject hidden', id, `subject hidden ${id}: ${((r.subjects?.[id] ?? 0) * 100).toFixed(0)}% visible`, FIX.hidden);
      }
      for (const id of m.edge ?? []) {
        const stat = idsById.get(id); if (!stat) continue;
        const area = stat.pixels / (180 * 320);
        const cut = stat.bbox.x0 < 0.005 || stat.bbox.x1 > 0.995 || stat.bbox.y0 < 0.005;
        const vis = r.subjects?.[id] ?? 1;
        if (area >= EDGE_INTRUDER_AREA && cut && vis < EDGE_INTRUDER_VISIBLE) add(warnings, 'edge intruder', id, `edge intruder ${id}: cut by an edge, ${(vis * 100).toFixed(0)}% visible`, FIX.edgeIntruder);
      }
      const primaryStat = primary ? idsById.get(primary) : null;
      if (k.over && primary) {
        const oh = peopleById.get(k.over)?.headBox, ph = peopleById.get(primary)?.headBox;
        const ob = oh ? { x0: Math.min(oh.x0, oh.x1), y0: Math.min(oh.y0, oh.y1), x1: Math.max(oh.x0, oh.x1), y1: Math.max(oh.y0, oh.y1) } : idsById.get(k.over)?.bbox;
        const pbox = ph ? { x0: Math.min(ph.x0, ph.x1), y0: Math.min(ph.y0, ph.y1), x1: Math.max(ph.x0, ph.x1), y1: Math.max(ph.y0, ph.y1) } : primaryStat?.bbox;
        if (ob && pbox) {
          const inter = overlapArea(ob, pbox);
          const small = Math.min((ob.x1 - ob.x0) * (ob.y1 - ob.y0), (pbox.x1 - pbox.x0) * (pbox.y1 - pbox.y0));
          if (small > 0 && inter / small > MERGE_OVERLAP) push('merge', `${k.over}/${primary}`, `merge ${k.over}/${primary}: over actor overlaps the subject by ${(100 * inter / small).toFixed(0)}%`, FIX.merge);
        }
      }
      for (const id of [...subjects, ...(k.over ? [k.over] : [])]) {
        const a = (m.shot.actors ?? []).find((x) => (x.id ?? x.who) === id); if (!a) continue;
        const face = id === k.over && !activeFace(a, m.f, m.start, ctx) ? primary : activeFace(a, m.f, m.start, ctx);
        if (!face) continue;
        const target = targetPoint(ctx, m.shot, face, m.f, m.start); if (!target) continue;
        const p = peopleById.get(id); if (!p) continue;
        const own = [p.eye.x, p.eye.y, 0];
        const au = p.eye.x, tu = screenU(ctx, k, target, m.f);
        const want = tu > au + LOOK_AWAY_TOL ? 1 : tu < au - LOOK_AWAY_TOL ? -1 : 0;
        const prop = activeProp(a, m.f, m.start, ctx);
        let facing = a.facing ?? 0, mirror = !!a.mirror;
        for (const b of a.beats ?? []) if (m.f >= ctx.anchor(b.at, m.start)) { if (b.facing !== undefined) facing = b.facing; if (b.mirror !== undefined) mirror = b.mirror; }
        const aim = prop === 'bow' || prop === 'bowDrawn' || prop === 'bigbow' ? (mirror ? 1 : -1)
          : prop === 'spear' || prop === 'net' || prop === 'axe' || prop === 'torch' ? (mirror ? -1 : 1)
            : facing * (mirror ? -1 : 1);
        if (want && aim && want !== aim) push('looks away', id, `looks away ${id}: target is screen-${want > 0 ? 'right' : 'left'} but the actor aims ${aim > 0 ? 'right' : 'left'}`, FIX.looksAway);
      }

      const nearest = primaryStat?.distance ?? (primary ? itemsById.get(primary)?.distance : null);
      if (nearest !== undefined && nearest !== null) {
        for (const id of r.ids ?? []) {
          if (['sky', 'ground', 'water'].includes(id.id) || subjects.includes(id.id) || id.id === k.over || id.id.startsWith('blob') || id.id.startsWith('mark:')) continue;
          const it = itemsById.get(id.id), base = String(id.id).split('#')[0];
          if (!it || it.kind === 'sky' || it.kind === 'ground' || it.kind === 'water') continue;
          if (it.kind === 'effect' && AMBIENT_EFFECTS.has(base)) continue;
          const area = id.pixels / (180 * 320);
          if (id.distance < nearest - 0.05 && (area > BLOCKER_AREA || (area > BLOCKER_MIN_AREA && primary && overlap(id.bbox, primaryStat?.bbox) > BLOCKER_OVERLAP))) push('blocker', id.id, `blocker ${id.id}: fills ${(area * 100).toFixed(0)}% in front of ${primary}`, FIX.blocker);
        }
      }
      for (const group of m.with ?? []) {
        let pixels = 0, vis = 0, any = false;
        for (const id of group.ids) { const stat = idsById.get(id); if (stat) { any = true; pixels += stat.pixels; vis = Math.max(vis, r.subjects?.[id] ?? 0); } }
        if (!any || pixels / (180 * 320) < CONTEXT_AREA || vis < CONTEXT_VISIBLE) push('context missing', group.id, `context missing ${group.id}: ${(pixels / (180 * 320) * 100).toFixed(1)}% area, ${(vis * 100).toFixed(0)}% visible`, FIX.context);
      }
      if (primary && !k.over && (size === 'wide' || size === 'establishing')) {
        for (const bg of r.ids ?? []) {
          if (subjects.includes(bg.id) || bg.id === k.over || (m.withIds ?? []).includes(bg.id)) continue;
          const area = bg.pixels / (180 * 320);
          const isBg = ['sky', 'ground', 'water'].includes(bg.id) || /wall|arcade/i.test(bg.id);
          if (isBg && area > FLAT_WIDE_AREA) push('flat wide', bg.id, `flat wide: ${bg.id} fills ${(area * 100).toFixed(0)}% of the frame`, FIX.flat);
        }
      }
      const actionFrames = new Map();
      for (const a of m.shot.actors ?? []) {
        const id = a.id ?? a.who, frames = new Set();
        if ((k.subjects ?? []).includes(id)) continue;
        for (const b of a.beats ?? []) if (b.offscreen !== true && (b.pose !== undefined || b.expr !== undefined || b.prop !== undefined)) frames.add(ctx.anchor(b.at, m.start));
        if (a.visible?.from) frames.add(ctx.anchor(a.visible.from, m.start));
        if (a.visible?.to) frames.add(ctx.anchor(a.visible.to, m.start));
        if (a.appear?.at) frames.add(ctx.anchor(a.appear.at, m.start));
        for (const f of frames) if (f >= m.kf && f < m.end && f >= m.start) {
          const seen = `${m.shotId}/${m.ki}/${id}/${f}`; if (actionSeen.has(seen)) continue; actionSeen.add(seen);
          if (!idsById.has(id)) continue;
          const bb = idsById.get(id)?.bbox; const area = bb ? (bb.x1 - bb.x0) * (bb.y1 - bb.y0) : 0;
          if (area < ACTION_AREA) add(warnings, 'action off-screen', id, `action off-screen ${id}: beat at ${f} covers ${(area * 100).toFixed(0)}% of the frame`, FIX.action);
        }
      }
      if (primary && ppl && (size === 'close' || size === 'medium') && (ppl.eye.y < EYE_MIN || ppl.eye.y > EYE_MAX)) add(warnings, 'eye line', primary, `eye line ${(ppl.eye.y * 100).toFixed(0)}% outside 30-50%`, FIX.eye);
      for (const a of m.shot.actors ?? []) {
        if (talkAt(a, m.f, m.start, ctx)) {
          const id = a.id ?? a.who, stat = idsById.get(id);
          if ((stat?.pixels ?? 0) / (180 * 320) < SPEAKER_AREA && !k.reaction) add(warnings, 'speaker off-screen', id, `speaker off-screen ${id}: talking but <4% of frame`, FIX.speaker);
        }
      }
      rows.push({ shot: m.shotId, key: m.ki, frame: m.f, size, primary, primaryHeight: metric === null ? null : +(metric * 100).toFixed(1), visible: primary ? r.subjects?.[primary] ?? 0 : null, eye: ppl ? +(ppl.eye.y * 100).toFixed(1) : null, subjects: subjects.map((id) => ({ id, height: +( (band.metric === 'head' ? Math.max(0, (peopleById.get(id)?.headBox.y1 ?? 0) - (peopleById.get(id)?.headBox.y0 ?? 0)) : Math.max(0, (idsById.get(id)?.bbox.y1 ?? 0) - (idsById.get(id)?.bbox.y0 ?? 0))) * 100).toFixed(1), visible: r.subjects?.[id] ?? 0, headBox: peopleById.get(id)?.headBox ?? null, eye: peopleById.get(id)?.eye ?? null })), blockers: (r.ids ?? []).filter((x) => !subjects.includes(x.id) && !['sky', 'ground', 'water'].includes(x.id) && x.distance < (nearest ?? Infinity)).map((x) => x.id), context: (m.with ?? []).map((g) => ({ id: g.id, pixels: g.ids.reduce((n, id) => n + (idsById.get(id)?.pixels ?? 0), 0), visible: Math.max(...g.ids.map((id) => r.subjects?.[id] ?? 0)) })) });
    }
    // rebuild key rows grouped from per-frame rows
    const keyRows = [];
    for (const [kid, meta] of byKey) {
      const frameRows = rows.filter((r) => r.shot === meta.shotId && r.key === meta.ki);
      const first = frameRows[0];
      keyRows.push({ shot: meta.shotId, key: meta.ki, anchor: meta.k.at, size: first?.size, primary: first?.primary, frames: [...new Set(meta.frames)].sort((a, b) => a - b), subjects: first?.subjects ?? [], context: first?.context ?? [], errors: errors.filter((e) => e.shot === meta.shotId && e.key === meta.ki), warnings: warnings.filter((w) => w.shot === meta.shotId && w.key === meta.ki) });
    }
    const flat = [...byKey.values()].map((meta) => {
      const first = rows.find((r) => r.shot === meta.shotId && r.key === meta.ki);
      return { shot: meta.shotId, key: meta.ki, sets: meta.shot.sets ?? [], semantic: meta.k.semantic, primary: first?.primary, size: first?.size, side: meta.k.side ?? 'front', angle: meta.k.angle ?? 'eye', kf: meta.kf, end: meta.end, cut: !!meta.k.cut, start: meta.start };
    }).sort((a, b) => a.kf - b.kf);
    const sideDeg = { front: 0, left: -30, right: 30, frontLeft: -15, frontRight: 15 };
    const angleDeg = { eye: 0, low: -20, high: 20, overhead: 45 };
    for (let i = 1; i < flat.length; i++) {
      const prev = flat[i - 1], cur = flat[i];
      if (cur.shot === prev.shot ? !cur.cut : !(cur.sets ?? []).some((x) => (prev.sets ?? []).includes(x))) continue;
      if (!cur.primary || cur.primary !== prev.primary || cur.size !== prev.size) continue;
      const side = Math.abs((sideDeg[cur.side] ?? 0) - (sideDeg[prev.side] ?? 0));
      const angle = Math.abs((angleDeg[cur.angle] ?? 0) - (angleDeg[prev.angle] ?? 0));
      if (side < JUMP_CUT_DEG && angle < JUMP_CUT_DEG) {
        const code = cur.semantic ? errors : warnings;
        code.push({ shot: cur.shot, key: cur.key, frame: cur.kf, subject: cur.primary, code: 'jump cut', message: `jump cut: ${prev.shot} key ${prev.key} -> ${cur.shot} key ${cur.key} keeps ${cur.primary} at ${cur.size}`, fix: FIX.jumpCut });
      }
    }
    const payload = { measured: true, coverageMs: +(totalMs / Math.max(1, keyMeta.length)).toFixed(1), keys: keyRows, rows, errors, warnings };
    writeFileSync(join(dir, 'frames.json'), JSON.stringify(payload, null, 2) + '\n');
    return { ok: errors.length === 0, ...payload, file: join(dir, 'frames.json') };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export async function framesCommand(dirArg, fast = false) {
  const r = fast ? checkFrames(dirArg) : await checkFramesMeasured(dirArg);
  for (const row of r.keys ?? r.rows) console.log(`${row.shot.padEnd(5)} key ${String(row.key).padStart(2)} ${row.primary ?? '-'} ${row.size ?? ''} ${row.primaryHeight ?? ''}`);
  for (const e of r.errors) console.log(`ERROR ${e.shot} key ${e.key} frame ${e.frame} ${e.subject}: ${e.message}`);
  for (const w of r.warnings) console.log(`WARN  ${w.shot} key ${w.key} frame ${w.frame} ${w.subject}: ${w.message}`);
  console.log(`frames: ${r.keys?.length ?? r.rows.length} keys, ${r.errors.length} error(s), ${r.warnings.length} warning(s)${r.coverageMs ? `, ${r.coverageMs} ms/frame coverage` : ''} — ${r.file}`);
  if (!r.ok) throw new Error(`${r.errors.length} in-frame error(s)`);
  return r;
}
