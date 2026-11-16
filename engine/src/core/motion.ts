// Pure motion math shared by the storyboard interpreter and its unit tests. Values are in frames (time in) and metres.
import { clamp01, glide, smooth } from "./timing";

export type Ease = "linear" | "smooth" | "glide" | "step";
export type V3 = [number, number, number];

export const easeK = (ease: Ease | undefined, u: number): number => {
  const x = clamp01(u);
  if (ease === "smooth") return smooth(x);
  if (ease === "glide") return glide(x);
  if (ease === "step") return x < 1 ? 0 : 1;
  return x;
};

/** piecewise path over keyed world positions; clamped before the first and after the last key */
export const samplePath = (keys: { f: number; v: V3 }[], f: number, ease?: Ease): V3 => {
  if (!keys.length) throw new Error("path has no keys");
  if (f <= keys[0].f) return [...keys[0].v];
  if (f >= keys[keys.length - 1].f) return [...keys[keys.length - 1].v];
  let i = 0; while (i + 1 < keys.length && f >= keys[i + 1].f) i++;
  const a = keys[i], b = keys[i + 1];
  const k = b.f === a.f ? 1 : easeK(ease, (f - a.f) / (b.f - a.f));
  return [a.v[0] + (b.v[0] - a.v[0]) * k, a.v[1] + (b.v[1] - a.v[1]) * k, a.v[2] + (b.v[2] - a.v[2]) * k];
};

/** ballistic position: p0 + v*u + a*u^2, u in seconds; optional floor on y */
export const ballisticAt = (p0: V3, v: V3, a: V3, u: number, floorY?: number): V3 => {
  const t = Math.max(0, u);
  const p: V3 = [p0[0] + v[0] * t + a[0] * t * t, p0[1] + v[1] * t + a[1] * t * t, p0[2] + v[2] * t + a[2] * t * t];
  if (floorY !== undefined && p[1] < floorY) p[1] = floorY;
  return p;
};

/** walk cycle phase 0..1; rate = cycles per second */
export const walkPhase = (t: number, rate: number, offset = 0) => (((t * rate + offset) % 1) + 1) % 1;

/** vertical bob: amp*sin(2π*freq*t) */
export const bobOffset = (t: number, bob: { amp: number; freq: number } | undefined) =>
  bob ? bob.amp * Math.sin(2 * Math.PI * bob.freq * t) : 0;

/** add a screen-relative offset to a world point using the camera basis vectors */
export const addScreen = (base: V3, right: V3, up: V3, fwd: V3, screen: V3): V3 => [
  base[0] + right[0] * screen[0] + up[0] * screen[1] + fwd[0] * screen[2],
  base[1] + right[1] * screen[0] + up[1] * screen[1] + fwd[1] * screen[2],
  base[2] + right[2] * screen[0] + up[2] * screen[1] + fwd[2] * screen[2],
];
