// Build ShotDef[] from a storyboard + the project's words. Math comes from core/ (shared with story.ts); the legacy
// hybrid reuses the hand-written ShotDef and DOF entries for shots marked "legacy": true.
import type { Cam, ShotDef } from "../world";
import type { Stage, CamInfo } from "../cast";
import { who, fx } from "../cast";
import type { Sets } from "../sets";
import type { V3 } from "../places";
import { PLACES, PlaceName } from "../places";
import { C, KIDS } from "../castlist";
import type { Spec } from "../people";
import { makeAnchors, Wd } from "../core/anchors";
import { clamp01, glide, pop, smooth, talk, writeT } from "../core/timing";
import { samplePath, ballisticAt, walkPhase, bobOffset, addScreen } from "../core/motion";
import { dolly, run, kickAt as kickAtWith, kickCam as kickCamWith, Key, Kick, Shot as CamShot } from "../core/camera";
import { gnCard } from "../core/specials";
import { assembleShots, crossfades, layersAt as layersAtShots, dofAt as dofAtList, Def, Dof } from "../core/shotlist";
import { fxSparkle, fxKnot, fxHalo } from "../people";
import { SHOTS as LEGACY_SHOTS, LEGACY_DOFS } from "../story";
import CATALOG from "../../../schema/catalog.json";
import type { Actor, Animated, Anchor, Beat, CamKey, Effect, Motion, Point, Shot, Storyboard } from "./types";

export type Runtime = {
  SHOTS: ShotDef[]; TOTAL: number; FLASH_AT: number; XFADE: Record<number, number>;
  layersAt: (f: number) => { id: number; alpha: number }[];
  dofAt: (f: number) => { cInf: number; focus?: (f: number) => V3 };
  kickCam: (f: number, c: Cam) => Cam; KICKS: Kick[];
};

type Targets = Map<string, (f: number) => V3>;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);

export function buildStoryboard(sb: Storyboard, words: Wd[], targets: Targets = new Map()): Runtime {
  const fps = sb.fps ?? 30;
  const { A, END, TOTAL, T } = makeAnchors(words, fps, sb.tailFrames ?? 36);
  const defaults = (CATALOG as { defaults?: { sunBySet?: Record<string, { az: number; el: number }>; setPieces?: Record<string, { height?: number }> } }).defaults ?? {};
  const anchor = (a: Anchor, shotStart = 0): number => {
    if ("shot" in a) return shotStart + (a.offset ?? 0);
    if ("frame" in a) return a.frame + (a.offset ?? 0);
    if ("end" in a) return END + (a.offset ?? 0);
    return A(a.line, a.word, a.nth ?? 0) + (a.offset ?? 0);
  };
  const named = sb.points ?? {};
  const motionTargets: Targets = new Map(targets);
  const point = (p: Point, f: number, cam?: CamInfo, depth = 0): V3 => {
    if (Array.isArray(p)) return [p[0], p[1], p[2]];
    if (depth > 16) throw new Error(`point cycle at "${p.at}"`);
    const base = named[p.at] ? point(named[p.at], f, cam, depth + 1)
      : motionTargets.has(p.at) ? motionTargets.get(p.at)!(f)
      : PLACES[p.at as PlaceName];
    if (!base) throw new Error(`unknown point "${p.at}"`);
    const out = add(base, p.d);
    if (!p.screen) return out;
    if (!cam) throw new Error(`screen-relative point "${p.at}" needs a camera`);
    const right: V3 = [cam.right.x, cam.right.y, cam.right.z], up: V3 = [0, 1, 0];
    const fwd: V3 = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    return addScreen(out, right, up, fwd, p.screen);
  };
  type Moving = { at: (f: number) => V3; spin: (f: number) => number; phase: (f: number) => number | undefined };
  const motionFn = (m: Motion, base: Point | undefined, shotStart: number): Moving => {
    if (m.type === "path") return {
      at: (f) => {
        const keys = m.keys.map(([at, p]) => ({ f: anchor(at, shotStart), v: point(p, f) }));
        const p = samplePath(keys, f, m.ease);
        p[1] += bobOffset(T(f), m.bob);
        return p;
      },
      spin: () => 0,
      phase: (f) => (m.walk ? walkPhase(T(f), m.walk.rate, m.walk.offset ?? 0) : undefined),
    };
    const f0 = anchor(m.at, shotStart);
    let p0: V3 | null = null;
    return {
      at: (f) => { if (!p0) p0 = base ? point(base, f0) : [0, 0, 0]; return ballisticAt(p0, m.v, m.a, Math.max(0, T(f) - T(f0)), m.floorY); },
      spin: (f) => (m.spin ? m.spin * Math.max(0, T(f) - T(f0)) : 0),
      phase: () => undefined,
    };
  };
  const animated = (a: Animated, f: number, shotStart: number): number => {
    if (typeof a === "number") return a;
    const keys = a.keys.map(([at, v]) => [anchor(at, shotStart), v] as [number, number]).sort((x, y) => x[0] - y[0]);
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

  const actor = (out: Stage, cam: CamInfo, a: Actor, f: number, shotStart: number) => {
    let st: Partial<Actor> = { ...a };
    let params = { ...(a.params ?? {}) };
    const beats = (a.beats ?? []).map((b: Beat) => ({ f: anchor(b.at, shotStart), b })).sort((x, y) => x.f - y.f);
    for (const { f: bf, b } of beats) if (f >= bf) {
      const { at: _at, params: bp, ...rest } = b;
      st = { ...st, ...rest };
      if (bp) params = { ...params, ...bp };
    }
    const vis = st.visible;
    if (vis && (f < anchor(vis.from, shotStart) || f >= anchor(vis.to, shotStart))) return;
    const p = st.pos;
    const moving = a.motion ? a.id && motionTargets.has(a.id) ? null : motionFn(a.motion, p, shotStart) : null;
    if (!p && !a.motion) throw new Error(`actor "${a.who}" has no pos or motion`);
    const pos = a.motion ? (a.id && motionTargets.has(a.id) ? motionTargets.get(a.id)!(f) : moving!.at(f)) : point(p!, f, cam);
    const ap = st.appear;
    const scale = (st.scale ?? 1) * (ap ? pop(T(f), T(anchor(ap.at, shotStart)) + (ap.stagger ?? 0), ap.pop ?? 0.18) : 1);
    if (scale === 0) return;
    const talkSpec = st.talk;
    const expr = talkSpec ? talk(T(f) * (talkSpec.rate ?? 1), talkSpec.base) : (st.expr ?? "neutral");
    const common = { t: T(f), scale, mirror: st.mirror, noBlob: st.noBlob, blobScale: st.blobScale, yaw: st.yaw ?? undefined };
    if (a.special === "ganesha") {
      const o = {
        write: typeof params.write === "number" ? params.write : writeT(T(f), num(params.writeSpeed, 1.6)),
        expr, puzzled: num(params.puzzled), down: num(params.down), look: num(params.look), ear: num(params.ear),
        pen: params.pen !== false,
      };
      gnCard(out, cam, o, T(f), pos, scale);
      return;
    }
    if (a.special) throw new Error(`special "${a.special}" is not implemented in Phase 2A (shot frame ${f})`);
    const e = cast[a.who];
    const sp = { ...spec(a.who) };
    for (const [k, v] of Object.entries(a.animate ?? {})) (sp as unknown as Record<string, unknown>)[k] = animated(v, f, shotStart);
    const phase = a.motion?.type === "path" && a.motion.walk ? (moving ? moving.phase(f) : motionFn(a.motion, p, shotStart).phase(f)) : undefined;
    const opts = {
      pose: st.pose, phase, expr, prop: st.prop, facing: st.facing, look: st.look, seated: st.seated, headTilt: st.headTilt, tilt: st.tilt, t: T(f),
    };
    who(out, cam, e.seed, sp, opts, pos[0], pos[1], pos[2], common);
  };

  const effect = (out: Stage, e: Effect, f: number, shotStart: number, cam: CamInfo) => {
    const a = anchor(e.at, shotStart);
    const moving = e.motion ? (e.id && motionTargets.has(e.id) ? null : motionFn(e.motion, e.pos, shotStart)) : null;
    const pos = e.motion ? (e.id && motionTargets.has(e.id) ? motionTargets.get(e.id)!(f) : moving!.at(f)) : point(e.pos, f, cam);
    if (e.kind === "sparkle") {
      const count = e.count ?? e.offsets?.length ?? 1, size = e.size ?? 0.35;
      const offs = e.offsets ?? [[0, 0, 0]];
      const tw = e.twinkle, stagger = e.pop?.stagger ?? 0;
      for (let i = 0; i < count; i++) {
        const k = pop(T(f), T(a) + i * stagger, 0.18) * (tw ? 1 - tw.depth + tw.depth * Math.sin(T(f) * tw.freq + i) : 1);
        if (k === 0) continue;
        const d = offs[i] ?? [0, 0, 0];
        fx(out, "sparkle", 256, 256, (p) => fxSparkle(p), pos[0] + d[0], pos[1] + d[1], pos[2] + d[2], size * k, size * k);
      }
    } else if (e.kind === "sweat") {
      if (f >= a) for (let i = 0, n = e.count ?? 1; i < n; i++) {
        const ph = (((T(f) * (e.rate ?? 1) + i / n) % 1) + 1) % 1, size = e.size ?? 0.12;
        fx(out, "sweat", 128, 128, (p) => p.ell(64, 64, 18, 26, "#9fd4ff", 5), pos[0] + (e.spread ?? 0) * i, pos[1] - (e.drop ?? 0) * ph, pos[2], size, size);
      }
    } else if (e.kind === "halo") {
      const k = pop(T(f), T(a), e.pop ?? 0.4), size = (e.size ?? 2.8) * k;
      fx(out, "halo", 256, 256, (p) => fxHalo(p, e.color ?? "#fff0a0"), pos[0], pos[1], pos[2], size, size, { kind: e.card ?? "soft" });
    } else {
      const k = pop(T(f), T(a), e.pop ?? 0.18), size = (e.size ?? 0.55) * k;
      fx(out, "knot", 256, 256, (p) => fxKnot(p, 1), pos[0], pos[1] + (e.bob ?? 0.05) * Math.sin(T(f) * 3), pos[2], size, size);
    }
  };

  const defs: Def[] = [];
  const dofs: Dof[] = [];
  const shots = [...(sb.shots ?? [])].map((s) => ({ s, start: anchor(s.start) })).sort((x, y) => x.start - y.start);
  // register moving targets before cameras/stages resolve Points that refer to them
  for (const { s, start } of shots) {
    for (const a of s.actors ?? []) if (a.id) motionTargets.set(a.id, a.motion ? (() => { const m = motionFn(a.motion!, a.pos, start); return (f: number) => m.at(f); })() : (f: number) => point(a.pos!, f));
    for (const e of s.fx ?? []) if (e.id) motionTargets.set(e.id, e.motion ? (() => { const m = motionFn(e.motion!, e.pos, start); return (f: number) => m.at(f); })() : (f: number) => point(e.pos, f));
  }
  shots.forEach(({ s, start }, i) => {
    const b = i + 1 < shots.length ? shots[i + 1].start : TOTAL;
    if (s.legacy) {
      const legacy = LEGACY_SHOTS.find((x) => x.a === start);
      if (!legacy) throw new Error(`legacy shot "${s.id}" starts at frame ${start}, no story.ts shot has that start`);
      defs.push({ from: start, light: legacy.light, sets: legacy.sets, cam: legacy.cam, stage: legacy.stage, pose: legacy.pose, sunAz: legacy.sunAz, sunEl: legacy.sunEl });
      dofs.push(...LEGACY_DOFS.filter((d) => d.f >= start && d.f < b));
      return;
    }
    const def: Def = {
      from: start, light: s.light, sets: s.sets, cam: camera(s.camera ?? [], start),
      stage: (t, f, out, cam) => {
        for (const a of s.actors ?? []) actor(out, cam, a, f, start);
        for (const e of s.fx ?? []) effect(out, e, f, start, cam);
      },
      pose: (t, f, sets: Sets) => {
        for (const x of s.set ?? []) if (x.piece === "pages") sets.dyn.pages.scale.set(1, x.height === undefined ? (defaults.setPieces?.pages?.height ?? 0.3) : animated(x.height, f, start), 1);
      },
      ...(s.sun ? { sunAz: s.sun.az, sunEl: s.sun.el } : (() => { const d = defaults.sunBySet && s.sets.map((x) => defaults.sunBySet![x]).find(Boolean); return d ? { sunAz: d.az, sunEl: d.el } : {}; })()),
    };
    defs.push(def);
    for (const d of s.dof ?? [{ at: s.start, cInf: 0 }]) {
      dofs.push({ f: anchor(d.at, start), cInf: d.cInf, dur: d.dur, focus: d.focus ? (ff: number) => point(d.focus!, ff) : undefined });
    }
  });

  const SHOTS = assembleShots(defs, TOTAL, defaults.setPieces?.pages?.height ?? 0.3);
  const XFADE = crossfades(SHOTS, sb.crossfade ?? 10);
  const KICKS: Kick[] = (sb.kicks ?? []).map((k) => [anchor(k.at), k.amp] as Kick).sort((a, b) => a[0] - b[0]);
  const sortedDofs = dofs.sort((a, b) => a.f - b.f);
  return {
    SHOTS, TOTAL, KICKS, XFADE,
    FLASH_AT: sb.flash ? anchor(sb.flash) : -1000,
    layersAt: (f: number) => layersAtShots(SHOTS, XFADE, f),
    dofAt: (f: number) => dofAtList(sortedDofs, f),
    kickCam: (f: number, c: Cam) => kickCamWith(f, c, KICKS),
  };
}
