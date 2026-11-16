// `fableon frames`: project every named camera subject into the frame at the key and every 6th frame, check the
// Shorts safe area, head visibility and line-of-sight occlusion. Works on any v1 storyboard.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, requireFile } from './project.js';
import { ROOT } from './env.js';
import { blocked } from './solver.js';

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
  return { pos, measure, scale, seated: !!st.seated };
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
  const outDir = join(dir, 'qa'); mkdirSync(outDir, { recursive: true });
  const file = join(outDir, 'frames.json');
  writeFileSync(file, JSON.stringify({ rows, errors, warnings }, null, 2) + '\n');
  return { ok: errors.length === 0, rows, errors, warnings, file };
}

function keyForProjection(k, f, start) { return { ...k, pos: k.pos, look: k.look }; }

export function framesCommand(dirArg) {
  const r = checkFrames(dirArg);
  for (const row of r.rows) console.log(`${row.shot.padEnd(5)} key ${String(row.key).padStart(4)} frame ${String(row.frame).padStart(5)} ${row.subject.padEnd(16)} outside ${String(row.outside * 100).padStart(5)}%  eye ${String(row.eye * 100).padStart(3)}%${row.blocked ? `  BLOCKED ${row.blocked}` : ''}`);
  for (const e of r.errors) console.log(`ERROR ${e.shot} key ${e.key} frame ${e.frame} ${e.subject}: ${e.error}`);
  for (const w of r.warnings) console.log(`WARN  ${w.shot} key ${w.key} frame ${w.frame} ${w.subject}: ${w.warning}`);
  console.log(`frames: ${r.rows.length} checks, ${r.errors.length} error(s), ${r.warnings.length} warning(s) — ${r.file}`);
  if (!r.ok) throw new Error(`${r.errors.length} in-frame error(s)`);
  return r;
}
