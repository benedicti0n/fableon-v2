// Build ShotDef[] from a storyboard + the project's words. Math comes from core/ (shared building blocks); every
// shot is evaluated from the storyboard data — the legacy hand-written timeline is gone.
import * as THREE from "three";
import type { Cam, ShotDef } from "../world";
import type { Stage, CamInfo } from "../cast";
import { who, fx, petals, card, hh, lidAt, SU } from "../cast";
import type { Sets } from "../sets";
import type { V3 } from "../places";
import { PLACES, PlaceName } from "../places";
import { C, KIDS, KAURAVA } from "../castlist";
import { CITY_TREES } from "../sets";
import type { Spec } from "../people";
import type { Expr } from "../toon";
import { makeAnchors, Wd } from "../core/anchors";
import { clamp01, glide, pop, smooth, talk, writeT } from "../core/timing";
import { samplePath, ballisticAt, walkPhase, bobOffset, addScreen } from "../core/motion";
import { dolly, run, kickAt as kickAtWith, kickCam as kickCamWith, Key, Kick, Shot as CamShot } from "../core/camera";
import { gnCard } from "../core/specials";
import { assembleShots, crossfades, layersAt as layersAtShots, dofAt as dofAtList, Def, Dof } from "../core/shotlist";
import { fxSparkle, fxKnot, fxHalo, fxHeart, fxArrow, fxLump, fxMango, fxBubble, fxSmoke, fxFire, naga, agni, fxPigeon, fxWheel, fxWind, fxBolt, fxHorse, deer, baby, jarShape, person, ganesha } from "../people";
import { fxStars, fxPuff, fxSplash, fxBurst } from "../toon";
import CATALOG from "../../../schema/catalog.json";
import type { Actor, Animated, Anchor, Attach, Beat, CamKey, Crowd, Effect, JarsAction, Motion, Point, Shot, Storyboard } from "./types";
import { drawingPen } from "../measure";

export type Runtime = {
  SHOTS: ShotDef[]; TOTAL: number; FLASH_AT: number; XFADE: Record<number, number>;
  layersAt: (f: number) => { id: number; alpha: number }[];
  dofAt: (f: number) => { cInf: number; focus?: (f: number) => V3 };
  kickCam: (f: number, c: Cam) => Cam; KICKS: Kick[]; JUMP_EVENTS: number[];
};

type Targets = Map<string, (f: number) => V3>;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);

export function buildStoryboard(sb: Storyboard, words: Wd[], targets: Targets = new Map()): Runtime {
  const fps = sb.fps ?? 30;
  const { A, END, TOTAL, T } = makeAnchors(words, fps, sb.tailFrames ?? 36);
  const defaults = (CATALOG as { defaults?: { sunBySet?: Record<string, { az: number; el: number }>; setPieces?: Record<string, { height?: number }> } }).defaults ?? {};
  const anchor = (a: Anchor, shotStart = 0): number => {
    let m = anchorMemo.get(a);
    if (m?.has(shotStart)) return m.get(shotStart)!;
    if (!m) { m = new Map(); anchorMemo.set(a, m); }
    const v = ("shot" in a) ? shotStart + (a.offset ?? 0) : ("frame" in a) ? a.frame + (a.offset ?? 0) : ("end" in a) ? END + (a.offset ?? 0) : A(a.line, a.word, a.nth ?? 0) + (a.offset ?? 0);
    m.set(shotStart, v);
    return v;
  };
  const named = sb.points ?? {};
  const motionTargets: Targets = new Map(targets);
  const actorById = new Map<string, { a: Actor; start: number }>();
  const anchorMemo = new WeakMap<object, Map<number, number>>();
  const motionMemo = new WeakMap<Motion, Map<number, Moving>>();
  const beatMemo = new WeakMap<Actor, Map<number, { f: number; b: Beat }[]>>();
  const animMemo = new WeakMap<object, Map<number, [number, number][]>>();
  const jarMemo = new WeakMap<JarsAction, Map<number, V3[]>>();
  const crowdMemo = new WeakMap<Crowd, Spec[]>();
  const jarSpecMemo = new WeakMap<JarsAction, Spec[]>();
  const point = (p: Point, f: number, cam?: CamInfo, depth = 0): V3 => {
    if (Array.isArray(p)) return [p[0], p[1], p[2]];
    if ("actor" in p) {
      if (!cam) throw new Error(`actor attachment point "${p.actor}" needs a camera`);
      if (depth > 16) throw new Error(`attachment cycle at "${p.actor}"`);
      return attachPoint(p.actor, p.attach, p.d, f, cam);
    }
    if (depth > 16) throw new Error(`point cycle at "${p.at}"`);
    const base = named[p.at] ? point(named[p.at], f, cam, depth + 1)
      : motionTargets.has(p.at) ? motionTargets.get(p.at)!(f)
      : PLACES[p.at as PlaceName];
    if (!base) throw new Error(`unknown point "${p.at}"`);
    const out = add(base, p.d);
    if (!p.screen) return out;
    if (!cam) throw new Error(`screen-relative point "${p.at}" needs a camera`);
    const right: V3 = [cam.right.x, 0, cam.right.z], up: V3 = [0, 1, 0];
    const fwd: V3 = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    return addScreen(out, right, up, fwd, p.screen);
  };
  const isStaticPoint = (p: Point, depth = 0): boolean => {
    if (Array.isArray(p)) return true;
    if (!p || typeof p !== "object") return false;
    if ("screen" in p || "actor" in p) return false;
    if (depth > 16) return false;
    if ("at" in p && named[p.at]) return isStaticPoint(named[p.at], depth + 1);
    if ("at" in p && motionTargets.has(p.at)) return false;
    return true;
  };
  type Moving = { at: (f: number) => V3; spin: (f: number) => number; phase: (f: number) => number | undefined };
  const buildMotion = (m: Motion, base: Point | undefined, shotStart: number): Moving => {
    if (m.type === "path") {
      const keyFrames = m.keys.map(([at]) => anchor(at, shotStart));
      const keyPoints = m.keys.map(([, p]) => p);
      const staticKeys = keyPoints.every((p) => isStaticPoint(p));
      let fixed: V3[] | null = null;
      const keysAt = (f: number) => {
        if (staticKeys) { if (!fixed) fixed = keyPoints.map((p) => point(p, f)); return keyFrames.map((kf, i) => ({ f: kf, v: fixed![i] })); }
        return keyFrames.map((kf, i) => ({ f: kf, v: point(keyPoints[i], f) }));
      };
      return {
      at: (f) => {
        const keys = keysAt(f);
        const p = samplePath(keys, f, m.ease);
        p[1] += bobOffset(T(f), m.bob);
        return p;
      },
      spin: () => 0,
      phase: (f) => (m.walk ? walkPhase(T(f), m.walk.rate, m.walk.offset ?? 0) : undefined),
      };
    }
    const f0 = anchor(m.at, shotStart);
    let p0: V3 | null = null;
    return {
      at: (f) => { if (!p0) p0 = base ? point(base, f0) : [0, 0, 0]; return ballisticAt(p0, m.v, m.a, T(f) - T(f0) - (m.delay ?? 0), m.floorY); },
      spin: (f) => (m.spin ? m.spin * Math.max(0, T(f) - T(f0)) : 0),
      phase: () => undefined,
    };
  };
  const motionFn = (m: Motion, base: Point | undefined, shotStart: number): Moving => {
    let byShot = motionMemo.get(m);
    if (!byShot) { byShot = new Map(); motionMemo.set(m, byShot); }
    let out = byShot.get(shotStart);
    if (!out) { out = buildMotion(m, base, shotStart); byShot.set(shotStart, out); }
    return out;
  };
  const animated = (a: Animated, f: number, shotStart: number): number => {
    if (typeof a === "number") return a;
    let byShot = animMemo.get(a);
    if (!byShot) { byShot = new Map(); animMemo.set(a, byShot); }
    let keys = byShot.get(shotStart);
    if (!keys) { keys = a.keys.map(([at, v]) => [anchor(at, shotStart), v] as [number, number]).sort((x, y) => x[0] - y[0]); byShot.set(shotStart, keys); }
    if (f <= keys[0][0]) return keys[0][1];
    if (f >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    let i = 0; while (i + 1 < keys.length && f >= keys[i + 1][0]) i++;
    const [f0, v0] = keys[i], [f1, v1] = keys[i + 1], u = f1 === f0 ? 1 : (f - f0) / (f1 - f0);
    const k = a.ease === "step" ? (u < 1 ? 0 : 1) : a.ease === "smooth" ? smooth(u) : a.ease === "glide" ? glide(u) : u;
    return v0 + (v1 - v0) * k;
  };
  const camera = (keys: CamKey[], shotStart: number): ((f: number) => Cam) => {
    if (!keys.length) throw new Error("storyboard shot has no camera keys");
    const built: Key[] = keys.map((k) => {
      const f = anchor(k.at, shotStart);
      const rest = { fov: k.fov, roll: k.roll ?? 0 };
      if (k.type === "tilt") {
        const look0 = point(k.look, f);
        return { f, dur: k.dur, cut: k.cut, s: (ff: number) => {
          const u = glide((ff - f) / (k.tiltDur ?? 26));
          const l = k.lookTo ? point(k.lookTo, ff) : look0;
          return { pos: point(k.pos, ff), look: [look0[0] + (l[0] - look0[0]) * u, look0[1] + (l[1] - look0[1]) * u, look0[2] + (l[2] - look0[2]) * u], ...rest };
        } };
      }
      if (k.type === "fixed") return { f, dur: k.dur, cut: k.cut, s: (ff: number) => ({ pos: point(k.pos, ff), look: point(k.look, ff), ...rest }) };
      const from = k.push ? anchor(k.push.from, shotStart) : f;
      const rate = k.push?.rate ?? 0.0025, punch = k.push?.punch ?? 0, pf = k.push?.punchAt ? anchor(k.push.punchAt, shotStart) : -1;
      return { f, dur: k.dur, cut: k.cut, s: (ff: number) => dolly(point(k.pos, ff), point(k.look, ff), from, rate, rest, punch, pf)(ff) };
    });
    return run(built);
  };

  const cast = sb.cast ?? {};
  const spec = (id: string): Spec => {
    const e = cast[id];
    if (!e) throw new Error(`actor "${id}" is not declared under cast`);
    if (typeof e.spec !== "string") return e.spec as unknown as Spec;
    const [group, ...rest] = e.spec.split(".");
    const key = rest.join(".");
    const s = group === "C" ? C[key] : group === "KIDS" ? (KIDS as Record<string, Spec>)[key] : undefined;
    if (!s) throw new Error(`cast "${id}" has unknown spec "${e.spec}"`);
    return s;
  };

  type ActorState = { st: Partial<Actor>; params: Record<string, unknown>; pos: V3; scale: number; expr: Expr; moving: Moving | null };
  const actorState = (a: Actor, f: number, shotStart: number, ignoreVisible = false): ActorState | null => {
    let st: Partial<Actor> = { ...a };
    let params = { ...(a.params ?? {}) };
    let beatsByShot = beatMemo.get(a);
    if (!beatsByShot) { beatsByShot = new Map(); beatMemo.set(a, beatsByShot); }
    let beats = beatsByShot.get(shotStart);
    if (!beats) { beats = (a.beats ?? []).map((b: Beat) => ({ f: anchor(b.at, shotStart), b })).sort((x, y) => x.f - y.f); beatsByShot.set(shotStart, beats); }
    for (const { f: bf, b } of beats) if (f >= bf) {
      const { at: _at, params: bp, ...rest } = b;
      st = { ...st, ...rest };
      if (bp) params = { ...params, ...bp };
    }
    const vis = st.visible;
    if (!ignoreVisible && vis && (f < anchor(vis.from, shotStart) || f >= anchor(vis.to, shotStart))) return null;
    const p = st.pos;
    const moving = a.ride ? null : a.motion ? a.id && motionTargets.has(a.id) ? null : motionFn(a.motion, p, shotStart) : null;
    if (!p && !a.motion && !a.ride) throw new Error(`actor "${a.who}" has no pos or motion`);
    let pos = a.ride ? (motionTargets.get(a.ride)?.call(null, f) ?? [0, 0, 0]) : a.motion ? (a.id && motionTargets.has(a.id) ? motionTargets.get(a.id)!(f) : moving!.at(f)) : point(p!, f);
    if (a.ride) { const d = a.rideOffset ?? [0, 0, 0]; pos = [pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]]; }
    const ap = st.appear;
    const scale = (st.scale ?? 1) * (ap ? pop(T(f), T(anchor(ap.at, shotStart)) + (ap.stagger ?? 0), ap.pop ?? 0.18) : 1);
    if (scale === 0) return null;
    const talkSpec = st.talk;
    const expr = talkSpec ? talk(T(f) * (talkSpec.rate ?? 1), talkSpec.base) : (st.expr ?? "neutral");
    return { st, params, pos, scale, expr, moving };
  };

  const actor = (out: Stage, cam: CamInfo, a: Actor, f: number, shotStart: number) => {
    const state = actorState(a, f, shotStart);
    if (!state) return;
    const { st, params, pos, scale, expr, moving } = state;
    const common = { t: T(f), scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale, yaw: st.yaw ?? undefined, id: a.id ?? a.who, seated: st.seated };
    if (a.special === "ganesha") {
      const pv = (key: string, d = 0) => {
        const v = params[key];
        return v && typeof v === "object" && "keys" in v ? animated(v as Animated, f, shotStart) : num(v, d);
      };
      const o = {
        write: typeof params.write === "number" ? params.write : writeT(T(f), pv("writeSpeed", 1.6)),
        expr, puzzled: pv("puzzled"), down: pv("down"), look: pv("look"), ear: pv("ear"),
        pen: params.pen !== false,
      };
      gnCard(out, cam, o, T(f), pos, scale, { id: a.id ?? a.who, measure: 'ganesha', person: true });
      return;
    }
    if (a.special === "deer") {
      const graze = num(params.graze, 0), phase = num(params.phase, 0);
      card(out, cam, `deer|${expr}|${graze}|${phase}`, (p, light) => deer(p, { phase, graze, expr: expr === "shock" ? "shock" : "neutral", light }), pos[0], pos[1], pos[2], { geo: "wide", scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale ?? 1.6, id: a.id ?? a.who, measure: 'deer', person: true, seated: !!st.seated });
      return;
    }
    if (a.special === "baby") {
      card(out, cam, `baby|${String(params.wrap ?? "")}|${String(params.skin ?? "")}`, (p, light) => baby(p, { light, wrap: typeof params.wrap === "string" ? params.wrap : undefined, skin: typeof params.skin === "string" ? params.skin : undefined }), pos[0], pos[1], pos[2], { geo: "baby", scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale ?? 0.6, id: a.id ?? a.who, measure: 'baby', person: true, seated: !!st.seated });
      return;
    }
    if (a.special === "naga") {
      const col = typeof params.col === "string" ? params.col : "#3f9a6a", king = params.king === true;
      card(out, cam, `naga|${col}|${Math.floor(T(f) * 6) % 12}|${king}|${expr}`, (p, light) => naga(p, { col, king, t: T(f), light, expr: expr === "grin" ? "grin" : "smile" }), pos[0], pos[1], pos[2], { scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale ?? 1.4, id: a.id ?? a.who, measure: 'naga', person: true, seated: !!st.seated });
      return;
    }
    if (a.special === "agni") {
      const pv = (key: string, d = 0) => { const v = params[key]; return v && typeof v === "object" && "keys" in v ? animated(v as Animated, f, shotStart) : num(v, d); };
      const tq = Math.floor(T(f) * 8) / 8, burp = pv("burp");
      card(out, cam, `agni|${Math.floor(T(f) * 8) % 6}|${expr}|${burp.toFixed(3)}|${lidAt(T(f), 90)}`, (p, light) => agni(p, { t: tq, light, expr: expr === "relief_open" ? "relief_open" : "pained", burp, blink: lidAt(T(f), 90) }), pos[0], pos[1], pos[2], { scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale ?? 1.2, id: a.id ?? a.who, measure: a.special ?? 'adult', person: true, seated: !!st.seated });
      return;
    }
    if (a.special === "pot") {
      card(out, cam, "pot", (p) => jarShape(p, 300, 700, 140, 2.4, false), pos[0], pos[1], pos[2], { scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale ?? 1.2, id: a.id ?? a.who, measure: a.special ?? 'adult', person: true, seated: !!st.seated });
      return;
    }
    if (a.special === "flat") {
      const fpose = (typeof params.pose === "string" ? params.pose : st.pose ?? "armsUp") as Actor["pose"];
      card(out, cam, `flat|${expr}|${fpose}|${JSON.stringify(spec(a.who))}`, (p, light) => { p.g.transform(0, 1, -1, 0, 1000, 215); person(p, spec(a.who), { pose: fpose, expr: expr as never, light, t: T(f) }); }, pos[0], pos[1], pos[2], { geo: "wide", scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale ?? 2.2 });
      return;
    }
    if (a.special) throw new Error(`special "${a.special}" is not implemented yet (shot frame ${f})`);
    const e = cast[a.who];
    const baseSpec = spec(a.who);
    const sp = a.animate ? { ...baseSpec } : baseSpec;
    for (const [k, v] of Object.entries(a.animate ?? {})) (sp as unknown as Record<string, unknown>)[k] = animated(v, f, shotStart);
    const phase = a.motion?.type === "path" && a.motion.walk ? (moving ? moving.phase(f) : motionFn(a.motion, st.pos, shotStart).phase(f)) : undefined;
    const opts = {
      pose: st.pose, phase, expr: expr as never, prop: st.prop, facing: st.facing, look: st.look, seated: st.seated, headTilt: st.headTilt, tilt: st.tilt, t: T(f),
    };
    who(out, cam, e.seed, sp, opts, pos[0], pos[1], pos[2], common);
  };

  const attachPoint = (id: string, attach: Attach, d: [number, number, number], f: number, cam: CamInfo): V3 => {
    const ref = actorById.get(id);
    if (!ref) throw new Error(`attachment references unknown actor "${id}" (give the actor an id)`);
    const a = ref.a, start = ref.start;
    const state = actorState(a, f, start, true);
    if (!state) throw new Error(`attachment actor "${id}" is not drawn at frame ${f}`);
    const { st, params, pos, scale, expr } = state;
    const pen = drawingPen();
    let geo: "body" | "wide" | "baby" = "body";
    let pt: [number, number], hands: { L: [number, number]; R: [number, number] } | null = null;
    const body = (r: { L: [number, number]; R: [number, number]; hc: number; chin: number; crown: number; HH: number }) => {
      const pick = (k: Attach): [number, number] => k === "head" || k === "eyes" ? [300, r.hc] : k === "crown" ? [300, r.crown] :
        k === "chest" ? [300, r.chin + 0.55 * r.HH] : k === "feet" ? [300, 975] : k === "handL" ? r.L : r.R;
      return pick(attach);
    };
    if (a.special === "flat") {
      geo = "wide";
      const r = person(pen, spec(a.who), { pose: (typeof params.pose === "string" ? params.pose : st.pose ?? "armsUp") as Actor["pose"], expr: expr as never, t: T(f) });
      const flat = ([x, y]: [number, number]): [number, number] => [1000 - y, 215 + x];
      pt = flat(attach === "head" || attach === "eyes" ? [300, r.hc] : attach === "crown" ? [300, r.crown] : attach === "chest" ? [300, r.chin + 0.55 * r.HH] : attach === "handL" ? r.L : r.R);
    } else if (a.special === "ganesha") {
      const r = ganesha(pen, { expr, write: 0.25, light: 0 });
      pt = attach === "handL" ? r.LH : attach === "handR" || attach === "prop" ? r.RH : attach === "crown" ? [300, 320] : attach === "chest" ? [300, 620] : attach === "feet" ? [300, 975] : [300, 468];
    } else if (a.special === "agni") {
      const r = agni(pen, { expr: expr as never, t: T(f), light: 0 });
      pt = body(r);
    } else if (a.special === "deer") {
      geo = "wide";
      const graze = num(params.graze, 0), hx = 760 + graze * 30, hy = 230 + graze * 220;
      pt = attach === "head" || attach === "eyes" ? [hx + 20, hy] : attach === "crown" ? [hx + 20, hy - 50] : attach === "chest" ? [520, 400] : attach === "feet" ? [500, 660] : [hx + 20, hy];
    } else if (a.special === "naga") {
      const sway = Math.sin(T(f) * 2) * 18;
      pt = attach === "head" || attach === "eyes" ? [300 + sway * 0.5, 380] : attach === "crown" ? [300 + sway * 0.5, 290] : attach === "chest" ? [300, 600] : attach === "feet" ? [300, 930] : [300, 500];
    } else if (a.special === "baby") {
      geo = "baby";
      pt = attach === "head" || attach === "eyes" ? [300, 300] : attach === "crown" ? [300, 170] : attach === "chest" ? [300, 470] : attach === "feet" ? [300, 650] : [300, 470];
    } else if (a.special === "pot") {
      pt = attach === "crown" ? [300, 560] : attach === "feet" ? [300, 840] : [300, 650];
    } else {
      const baseSpec = spec(a.who);
      const sp = a.animate ? { ...baseSpec } : baseSpec;
      for (const [k, v] of Object.entries(a.animate ?? {})) (sp as unknown as Record<string, unknown>)[k] = animated(v, f, start);
      const phase = a.motion?.type === "path" && a.motion.walk ? state.moving?.phase(f) : undefined;
      const r = person(pen, sp, { pose: st.pose, phase, expr: expr as never, prop: st.prop, facing: st.facing, look: st.look, seated: st.seated, headTilt: st.headTilt, tilt: st.tilt, t: T(f) });
      const prop = st.prop === "bow" || st.prop === "bowDrawn" || st.prop === "bigbow" ? r.L : r.R;
      pt = attach === "prop" ? prop : body(r);
      hands = { L: r.L, R: r.R };
      void hands;
    }
    const base = geo === "wide" ? 640 : geo === "baby" ? 690 : 975, cx = geo === "wide" ? 500 : 300;
    const mirror = st.mirror ? -1 : 1;
    const yaw = st.yaw ?? Math.atan2(cam.pos.x - pos[0], cam.pos.z - pos[2]);
    const right: V3 = st.yaw !== undefined && st.yaw !== null ? [Math.cos(yaw), 0, -Math.sin(yaw)] : [cam.right.x, 0, cam.right.z];
    const rn = Math.hypot(right[0], right[2]) || 1;
    const h = (pt[0] - cx) * SU * scale * mirror;
    return [pos[0] + (right[0] / rn) * h + d[0], pos[1] + (base - pt[1]) * SU * scale + d[1], pos[2] + (right[2] / rn) * h + d[2]];
  };

  const crowd = (out: Stage, cam: CamInfo, c: Crowd, f: number, shotStart: number) => {
    const origin = c.layout.grid ? point(c.layout.grid.origin, f) : [0, 0, 0];
    for (let i = 0; i < c.count; i++) {
      const pos = c.layout.grid
        ? [origin[0] + (c.layout.grid.xStart ?? 0) + (i % c.layout.grid.cols) * c.layout.grid.dx + (Math.floor(i / c.layout.grid.cols) % 2) * (c.layout.grid.rowShift ?? 0), origin[1], origin[2] + Math.floor(i / c.layout.grid.cols) * c.layout.grid.dz] as V3
        : point(c.layout.points![i % c.layout.points!.length], f);
      let specs = crowdMemo.get(c);
      if (!specs) {
        specs = Array.from({ length: c.count }, (_, j) => c.first && c.first.index === j ? spec(c.first.who) : c.generator === "kaurava" ? KAURAVA(j) : spec(c.cast![j % c.cast!.length]));
        crowdMemo.set(c, specs);
      }
      const sp = specs[i];
      const pick = <T,>(v: T | { salt: number; below: number; a: T; b: T }) => typeof v === "object" && v && "salt" in v ? (hh(i, v.salt) < v.below ? v.a : v.b) : v;
      const pose = c.pose ? pick(c.pose) : "stand", expr = c.expr ? pick(c.expr) : "neutral";
      const scale = c.scale && typeof c.scale === "object" ? c.scale.min + hh(i, c.scale.salt) * c.scale.span : (c.scale ?? 1);
      who(out, cam, c.seedBase + i, sp, { pose, expr, facing: c.facing, seated: c.seated, t: T(f) }, pos[0], pos[1], pos[2], { t: T(f), scale, noBlob: c.noBlob, id: `crowd#${i}`, measure: sp.build ?? 'adult' });
    }
  };

  const jarPositions = (x: JarsAction, f: number, shotStart = 0): V3[] => {
    let byShot = jarMemo.get(x);
    if (!byShot) { byShot = new Map(); jarMemo.set(x, byShot); }
    let pos = byShot.get(shotStart);
    if (!pos) {
      const o = point(x.grid.origin, f);
      pos = Array.from({ length: x.count }, (_, i) => [o[0] + (i % x.grid.cols) * x.grid.dx + (Math.floor(i / x.grid.cols) % 2) * (x.grid.rowShift ?? 0), o[1], o[2] + Math.floor(i / x.grid.cols) * x.grid.dz] as V3);
      byShot.set(shotStart, pos);
    }
    return pos;
  };
  const jarsPose = (x: JarsAction, f: number, sets: Sets, start: number) => {
    const pos = jarPositions(x, f, start), count = x.count;
    const from = x.appear ? anchor(x.appear.from, start) : -Infinity, to = x.appear ? anchor(x.appear.to, start) : Infinity;
    const n = x.appear ? Math.max(0, Math.min(1, (f - from) / Math.max(1, to - from))) * count : count;
    const pop = x.lids?.mode === "pop";
    const since = x.lids?.since ? anchor(x.lids.since, start) : start, end = x.lids?.windowEnd ? anchor(x.lids.windowEnd, start) : start + 1;
    const overrides = new Map((x.lids?.overrides ?? []).map((o) => [o.index, anchor(o.at, start)]));
    const M = new THREE.Matrix4(), RZ = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const p = pos[i], k = Math.min(1, n - i);
      M.makeScale(0.9 * k + 1e-4, 1.0 * k + 1e-4, 0.9 * k + 1e-4).setPosition(p[0], p[1], p[2]); sets.dyn.jars.setMatrixAt(i, M);
      let ly = p[1] + 0.86 * k, lx = p[0], lz = p[2], rot = 0;
      if (pop) { const a = overrides.get(i) ?? since + Math.round(hh(i, x.lids?.hashSalt ?? 7) * (end - since)); const u = Math.max(0, (f - a) / 30); if (u > 0) { const vel = x.lids?.velocity ?? [0.5, 2.6, 1.6]; ly += vel[1] * u - 4.9 * u * u; lx += vel[0] * u; lz += vel[2] * u; rot = u * (x.lids?.spin ?? 9); } if (ly < p[1] + (x.lids?.cullY ?? -0.2)) ly = -50; }
      M.makeScale(k + 1e-4, k + 1e-4, k + 1e-4).premultiply(RZ.makeRotationZ(rot)).setPosition(lx, ly, lz); sets.dyn.lids.setMatrixAt(i, M);
    }
    sets.dyn.jars.instanceMatrix.needsUpdate = true; sets.dyn.lids.instanceMatrix.needsUpdate = true;
    sets.dyn.jars.visible = sets.dyn.lids.visible = n > 0;
  };
  const jarsKids = (out: Stage, cam: CamInfo, x: JarsAction, f: number, start: number) => {
    const kd = x.kids; if (!kd) return;
    const pos = jarPositions(x, f, start);
    const since = kd.since ? anchor(kd.since, start) : start, end = kd.windowEnd ? anchor(kd.windowEnd, start) : start + 1;
    const overrides = new Map((kd.overrides ?? []).map((o) => [o.index, o]));
    for (let i = 0; i < x.count; i++) {
      const o = overrides.get(i), a = o ? anchor(o.at, start) : since + Math.round(hh(i, kd.hashSalt ?? 7) * (end - since));
      if (f < a) continue;
      const p = pos[i];
      if (cam.pos.distanceTo(new THREE.Vector3(p[0], p[1], p[2])) > (kd.cullDistance ?? 22)) continue;
      const k = pop(T(f), T(a), 0.22);
      let specs = jarSpecMemo.get(x);
      if (!specs) { specs = Array.from({ length: x.count }, (_, j) => { const ov = overrides.get(j); return ov?.who ? spec(ov.who) : KAURAVA(j); }); jarSpecMemo.set(x, specs); }
      const sp = specs[i];
      who(out, cam, (kd.seedBase ?? 100) + i, sp, { pose: kd.pose ?? "armsUp", expr: o?.expr ?? kd.expr ?? "grin", t: T(f) },
        p[0], p[1] - (kd.sink ?? 0.95) + (kd.rise ?? 1.45) * k, p[2] + 0.02, { t: T(f), noBlob: kd.noBlob ?? true, scale: kd.scale ?? 0.78, id: `jarKid#${i}`, measure: 'kid' });
    }
  };

  const effect = (out: Stage, e: Effect, f: number, shotStart: number, cam: CamInfo) => {
    const a = anchor(e.at, shotStart);
    const em = e as Effect & { motion?: Motion; id?: string; pos?: Point };
    const moving = em.motion ? (em.id && motionTargets.has(em.id) ? null : motionFn(em.motion, em.pos, shotStart)) : null;
    const pos = em.motion ? (em.id && motionTargets.has(em.id) ? motionTargets.get(em.id)!(f) : moving!.at(f)) : em.pos ? point(em.pos, f, cam) : ([0, 0, 0] as V3);
    if (e.kind === "sparkle") {
      if (f < a || (e.until && f >= anchor(e.until, shotStart))) return;
      const count = e.count ?? e.offsets?.length ?? 1, size = e.size ?? 0.35;
      const offs = e.offsets ?? [[0, 0, 0]];
      const tw = e.twinkle, stagger = e.pop?.stagger ?? 0;
      for (let i = 0; i < count; i++) {
        const k = (e.static ? 1 : pop(T(f), T(a) + i * stagger, 0.18)) * (tw ? 1 - tw.depth + tw.depth * Math.sin(T(f) * tw.freq + i) : 1);
        if (k === 0) continue;
        const d = offs[i] ?? [0, 0, 0];
        fx(out, "sparkle", 256, 256, (p) => fxSparkle(p), pos[0] + d[0], pos[1] + d[1], pos[2] + d[2], size * k, size * k, { kind: e.card });
      }
    } else if (e.kind === "puff") {
      const dur = e.dur ?? 12;
      if (f >= a && f < a + dur) { const k = (f - a) / dur, size = e.size ?? 2.6; fx(out, `puff|${Math.round(k * 12)}`, 300, 300, (p) => fxPuff(p, k), pos[0], pos[1], pos[2], size, size, { kind: "soft" }); }
    } else if (e.kind === "arrow") {
      const [aw, ah] = e.size ?? [0.9, 0.45];
      if (e.stuck) { if (f >= a) { const p = point(e.to, f, cam); fx(out, "arrow", 256, 128, (q) => fxArrow(q), p[0], p[1], p[2], aw, ah, { rot: e.rot }); } return; }
      const to = anchor(e.toAt, shotStart), u = to === a ? 1 : (f - a) / (to - a);
      if (u > 0 && u < 1) {
        const p0 = point(e.from, f, cam), p1 = point(e.to, f, cam), [w, h] = e.size ?? [0.9, 0.45];
        fx(out, "arrow", 256, 128, (p) => fxArrow(p), p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u, w, h, { rot: e.rot });
      }
    } else if (e.kind === "stars") {
      const period = e.period ?? 12, dur = e.dur, startF = e.from ? anchor(e.from, shotStart) : a;
      if (f >= startF && (dur === undefined || f < a + dur)) {
        const ph = ((f - a) / period) % 1, [w, h] = e.size ?? [1.5, 0.79];
        fx(out, `stars|${Math.round(ph * 20)}`, 420, 220, (p) => fxStars(p, ph), pos[0], pos[1], pos[2], w, h);
      }
    } else if (e.kind === "emblem") {
      const k = e.until && f >= anchor(e.until, shotStart) ? 0 : pop(T(f), T(a), e.pop ?? 0.18);
      if (k > 0) {
        const size = (e.size ?? 1.15) * k, draw = e.variant === "wheel" ? (p: Parameters<typeof fxWheel>[0]) => fxWheel(p) : e.variant === "wind" ? (p: Parameters<typeof fxWind>[0]) => fxWind(p, 0) : e.variant === "bolt" ? (p: Parameters<typeof fxBolt>[0]) => fxBolt(p) : (p: Parameters<typeof fxHorse>[0]) => fxHorse(p);
        fx(out, `emblem|${e.variant}`, 256, 256, draw, pos[0], pos[1] + (e.bob ?? 0) * Math.sin(T(f) * 2.5 + pos[0]), pos[2], size, size, { kind: "glow" });
      }
    } else if (e.kind === "heart") {
      const k = pop(T(f), T(a), e.pop ?? 0.18), size = (e.size ?? 0.8) * k;
      const bob = e.bob ? e.bob.amp * Math.sin(2 * Math.PI * e.bob.freq * T(f)) : 0;
      fx(out, "heart", 256, 256, (p) => fxHeart(p), pos[0], pos[1] + bob, pos[2], size, size);
    } else if (e.kind === "petals") {
      petals(out, T(f), pos[0], pos[2], pos[1], e.count ?? 1, e.spread ?? 1, T(a));
    } else if (e.kind === "pigeon") {
      if (f >= a) { const flap = Math.floor(T(f) * 10) % 4, w = e.size ?? 0.9; fx(out, `pigeon|${flap}`, 512, 320, (p) => fxPigeon(p, flap / 4), pos[0], pos[1], pos[2], w, w * 0.6222); }
    } else if (e.kind === "dust") {
      const dur = (e.dur ?? 36) / 30, k = (T(f) - T(a) - (e.delay ?? 0)) / dur;
      if (k > 0 && k < 1) { const [s0, s1] = e.size ?? [1, 6], size = s0 + k * (s1 - s0); fx(out, `smoke${(e.seed ?? 0) % 3}`, 256, 256, (p) => fxSmoke(p, e.seed ?? 0), pos[0], pos[1] + k * (e.rise ?? 3), pos[2], size, size, { kind: "soft" }); }
    } else if (e.kind === "sweat") {
      if (f >= a) for (let i = 0, n = e.count ?? 1; i < n; i++) {
        const ph = (((T(f) * (e.rate ?? 1) + i / n) % 1) + 1) % 1, size = e.size ?? 0.12;
        fx(out, "sweat", 128, 128, (p) => p.ell(64, 64, 18, 26, "#9fd4ff", 5), pos[0] + (e.spread ?? 0) * i, pos[1] - (e.drop ?? 0) * ph, pos[2], size, size);
      }
    } else if (e.kind === "halo") {
      if (f < a) return;
      if (e.visible && (f < anchor(e.visible.from, shotStart) || f >= anchor(e.visible.to, shotStart))) return;
      const k = e.pop === undefined ? 1 : pop(T(f), T(a), e.pop), size = (e.size ?? 2.8) * k, h = (e.height ?? e.size ?? 2.8) * k;
      fx(out, "halo", 256, 256, (p) => fxHalo(p, e.color ?? "#fff0a0", e.peak ?? 1), pos[0], pos[1], pos[2], size, h, { kind: e.card ?? "soft" });
    } else if (e.kind === "splash") {
      const dur = e.dur ?? 20;
      if (f >= a && f < a + dur) { const [w, h] = e.size ?? [3.2, 3.2]; fx(out, `splash|${f - a}`, 800, 800, (p) => fxSplash(p, (f - a) / dur), pos[0], pos[1], pos[2], w, h); }
    } else if (e.kind === "bubbles") {
      const [ax, az] = e.area ?? [1, 1], off = e.offset ?? [0, 0, 0], [s0, s1] = e.size ?? [0.18, 0.3];
      for (let i = 0, n = e.count ?? 1; i < n; i++) {
        const ph = (((T(f) * (e.rate ?? 0.6) + hh(i, e.saltPhase ?? 5)) % 1) + 1) % 1;
        const size = s0 + hh(i, e.saltSize ?? 3) * (s1 - s0), jitter = (e.jitter ?? 0) * Math.sin(T(f) * 3 + i);
        fx(out, "bubble", 128, 128, (p) => fxBubble(p), pos[0] + off[0] + hh(i, e.saltX ?? 1) * ax + jitter, pos[1] + off[1] + ph * (e.rise ?? 7), pos[2] + off[2] + hh(i, e.saltZ ?? 2) * az, size, size, { kind: "soft" });
      }
    } else if (e.kind === "burst") {
      const k = pop(T(f), T(a), e.pop ?? 0.18), size = (e.size ?? 3.2) * k;
      if (k > 0) fx(out, "burst", 500, 500, (p) => fxBurst(p, e.phase ?? 0.6, e.color ?? "#fff3b0"), pos[0], pos[1], pos[2], size, size, { kind: "glow" });
    } else if (e.kind === "fire") {
      if (e.visible && (f < anchor(e.visible.from, shotStart) || f >= anchor(e.visible.to, shotStart))) return;
      const spots = e.spots ?? (e.source === "cityTreetops"
        ? CITY_TREES.filter(([x, , z]) => z > (e.filter?.zAfter ?? -Infinity) && Math.hypot(x - pos[0], z - pos[2]) < (e.filter?.radius ?? Infinity)).map(([x, y, z]) => [x, y, z, 8.5] as [number, number, number, number])
        : []);
      const lift = e.yLift ?? 0, sl = e.sizeLift ?? 0.5;
      const absolute = e.source === "cityTreetops";
      spots.forEach(([dx, dy, dz, sz], i) => {
        const start = a + Math.round(hh(i, e.hashSalt ?? 8) * (e.spread ?? 24)); if (f < start) return;
        const k = pop(T(f), T(start), e.pop ?? 0.4), st = Math.floor(T(f) * 8 + i) % 6, w = sz * k;
        const x = absolute ? dx : pos[0] + dx, y = absolute ? dy : pos[1] + dy, z = absolute ? dz : pos[2] + dz;
        fx(out, `fire|${st}|${i % 3}`, 512, 512, (p) => fxFire(p, st / 8, i % 3), x, y + lift + w * sl, z, w, w, { kind: "fire" });
      });
    } else if (e.kind === "smoke") {
      const [ax, az] = e.area ?? [1, 1], off = e.offset ?? [0, 0, 0], [s0, s1] = e.size ?? [5, 6];
      for (let i = 0, n = e.count ?? 1; i < n; i++) {
        const ph = (((T(f) * (e.rate ?? 0.25) + hh(i, e.saltPhase ?? 5)) % 1) + 1) % 1, size = s0 + ph * (s1 - s0);
        fx(out, `smoke${i % 3}`, 256, 256, (p) => fxSmoke(p, i), pos[0] + off[0] + hh(i, e.saltX ?? 1) * ax, pos[1] + off[1] + ph * (e.rise ?? 12), pos[2] + off[2] + hh(i, e.saltZ ?? 2) * az, size, size, { kind: "soft" });
      }
    } else if (e.kind === "lump") {
      const k = pop(T(f), T(a), e.pop ?? 0.18), size = (e.size ?? 0.6) * k;
      fx(out, "lump", 256, 256, (p) => fxLump(p), pos[0], pos[1], pos[2], size, size);
    } else if (e.kind === "mango") {
      if (f >= a && (!e.until || f < anchor(e.until, shotStart))) {
        const size = e.size ?? 0.34, rot = (moving ? moving.spin(f) : 0) + (e.rotOffset ?? 0);
        fx(out, "mango", 128, 128, (p) => fxMango(p), pos[0], pos[1], pos[2], size, size, { rot });
      }
    } else if (e.kind === "knot") {
      const k = pop(T(f), T(a), e.pop ?? 0.18), size = (e.size ?? 0.55) * k;
      fx(out, "knot", 256, 256, (p) => fxKnot(p, 1), pos[0], pos[1] + (e.bob ?? 0.05) * Math.sin(T(f) * 3), pos[2], size, size);
    }
  };

  const defs: Def[] = [];
  const dofs: Dof[] = [];
  const shots = [...(sb.shots ?? [])].map((s) => ({ s, start: anchor(s.start) })).sort((x, y) => x.start - y.start);
  // register moving targets before cameras/stages resolve Points that refer to them
  for (const { s, start } of shots) {
    for (const a of s.actors ?? []) if (a.id) actorById.set(a.id, { a, start });
    for (const a of s.actors ?? []) if (a.id) motionTargets.set(a.id, a.ride ? (f: number) => { const b = motionTargets.get(a.ride!)?.(f) ?? [0, 0, 0]; const d = a.rideOffset ?? [0, 0, 0]; return [b[0] + d[0], b[1] + d[1], b[2] + d[2]]; } : a.motion ? (() => { const m = motionFn(a.motion!, a.pos, start); return (f: number) => m.at(f); })() : (f: number) => point(a.pos!, f));
    for (const e of s.fx ?? []) if (e.id) { const em = e as Effect & { motion?: Motion; id?: string; pos?: Point }; motionTargets.set(e.id, em.motion ? (() => { const m = motionFn(em.motion!, em.pos, start); return (f: number) => m.at(f); })() : (f: number) => point(em.pos!, f)); }
    for (const x of s.set ?? []) if (x.piece === "boat" && x.id) motionTargets.set(x.id, (() => { const m = motionFn(x.motion, undefined, start); return (f: number) => m.at(f); })());
  }
  shots.forEach(({ s, start }, i) => {
    const def: Def = {
      from: start, ...(s.end ? { end: anchor(s.end, start) } : {}), light: s.light, sets: s.sets, cam: camera(s.camera ?? [], start),
      stage: (t, f, out, cam) => {
        for (const a of s.actors ?? []) actor(out, cam, a, f, start);
        for (const c of s.crowds ?? []) crowd(out, cam, c, f, start);
        for (const x of s.set ?? []) if (x.piece === "jars") jarsKids(out, cam, x, f, start);
        for (let ei = 0; ei < (s.fx ?? []).length; ei++) { const e = s.fx![ei]; const before = out.fx.length; effect(out, e, f, start, cam); for (let k = before; k < out.fx.length; k++) { out.fx[k].id = e.id ?? `${e.kind}#${ei}`; out.fx[k].measure = e.kind; } }
      },
      pose: (t, f, sets: Sets) => {
        for (const x of s.set ?? []) {
          if (x.piece === "pages") sets.dyn.pages.scale.set(1, x.height === undefined ? (defaults.setPieces?.pages?.height ?? 0.3) : animated(x.height, f, start), 1);
          else if (x.piece === "boat") {
            const b = x.id && motionTargets.has(x.id) ? motionTargets.get(x.id)!(f) : motionFn(x.motion, undefined, start).at(f);
            sets.dyn.boat.visible = true; sets.dyn.boat.position.set(b[0], b[1] - 0.05, b[2]);
            sets.dyn.boat.rotation.set(0, x.yaw ?? 0, (x.roll ?? 0) + (x.rollBob ? x.rollBob.amp * Math.sin(2 * Math.PI * x.rollBob.freq * t) : 0));
          } else if (x.piece === "jars") jarsPose(x, f, sets, start);
          else if (x.piece === "ladduPlate") {
            sets.dyn.ladduPlate.visible = f >= anchor(x.at, start);
            const p = point(x.pos, f); sets.dyn.ladduPlate.position.set(p[0], p[1], p[2]);
            sets.dyn.ladduPlate.scale.set(...(x.scale ?? [1, 1, 1]));
          } else if (x.piece === "city") {
            const k = glide((f - anchor(x.from, start)) / Math.max(1, anchor(x.to, start) - anchor(x.from, start)));
            sets.dyn.city.scale.set(1, Math.max(0.001, k), 1); sets.dyn.city.visible = k > 0.002;
          } else if (x.piece === "wheel") {
            const stop = x.stopAt ? anchor(x.stopAt, start) : null;
            if (stop === null || f < stop) sets.dyn.wheel.rotation.z = t * (x.spin ?? 2.2);
            else sets.dyn.wheel.rotation.z = (stop / 30) * (x.spin ?? 2.2);
          } else if (x.piece === "bigBow") {
            const a = anchor(x.at, start), n = f - a;
            sets.dyn.bigBow.rotation.z = n >= 0 && n < (x.dur ?? 10) ? (x.amp ?? 0.15) * Math.sin(n * (x.rate ?? 2)) : 0;
          } else if (x.piece === "nectar") {
            const d0 = anchor(x.since, start), d1 = anchor(x.to, start), n = x.count ?? 8, o = point(x.origin, f);
            const [rx, rz] = x.radius ?? [1.3, 0.9], sc = x.scale ?? 0.7, M = new THREE.Matrix4();
            for (let i = 0; i < n; i++) {
              const gone = f > d0 + ((d1 - d0) * (i + 1)) / n, a = ((i / n) * (x.angleSpan ?? 1.2) + (x.angleStart ?? -0.6)) * Math.PI;
              M.makeScale(gone ? 1e-4 : sc, gone ? 1e-4 : sc, gone ? 1e-4 : sc);
              M.setPosition(o[0] + Math.sin(a) * rx, o[1] + (x.y ?? 0.25), o[2] + Math.cos(a) * rz + (x.zOffset ?? 0.7));
              sets.dyn.nectar.setMatrixAt(i, M);
            }
            sets.dyn.nectar.instanceMatrix.needsUpdate = true;
          }
        }
      },
      ...(s.sun ? { sunAz: s.sun.az, sunEl: s.sun.el } : (() => { const d = defaults.sunBySet && s.sets.map((x) => defaults.sunBySet![x]).find(Boolean); return d ? { sunAz: d.az, sunEl: d.el } : {}; })()),
    };
    defs.push(def);
    for (const d of s.dof ?? [{ at: s.start, cInf: 0 }]) {
      dofs.push({ f: anchor(d.at, start), cInf: d.cInf, dur: d.dur, focus: d.focus ? (ff: number) => point(d.focus!, ff) : undefined });
    }
  });

  const jumps: number[] = [];
  for (const { s, start } of shots) {
    for (const a of s.actors ?? []) {
      if (a.appear) jumps.push(anchor(a.appear.at, start));
      if (a.visible) { jumps.push(anchor(a.visible.from, start)); jumps.push(anchor(a.visible.to, start)); }
      for (const b of a.beats ?? []) if (b.jump !== false) jumps.push(anchor(b.at, start));
    }
    for (const x of s.set ?? []) if (x.piece === "bigBow") jumps.push(anchor(x.at, start) + (x.dur ?? 10));
  }
  const SHOTS = assembleShots(defs, TOTAL, defaults.setPieces?.pages?.height ?? 0.3);
  const XFADE = crossfades(SHOTS, sb.crossfade ?? 10);
  const KICKS: Kick[] = (sb.kicks ?? []).map((k) => [anchor(k.at), k.amp] as Kick).sort((a, b) => a[0] - b[0]);
  const sortedDofs = dofs.sort((a, b) => a.f - b.f);
  return {
    SHOTS, TOTAL, KICKS, XFADE, JUMP_EVENTS: [...new Set(jumps)].filter((f) => f >= 0).sort((a, b) => a - b),
    FLASH_AT: sb.flash ? anchor(sb.flash) : -1000,
    layersAt: (f: number) => layersAtShots(SHOTS, XFADE, f),
    dofAt: (f: number) => dofAtList(sortedDofs, f),
    kickCam: (f: number, c: Cam) => kickCamWith(f, c, KICKS),
  };
}
