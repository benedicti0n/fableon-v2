// Shared timing curves used by the hand-written timeline and the storyboard interpreter. Moved verbatim from story.ts.
import type { Expr } from "../toon";

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
export const ease = (f: number, f0: number, n: number) => smooth((f - f0) / n);
/** talking mouth: cycles open shapes while speaking */
export const talk = (t: number, base: Expr = "neutral"): Expr => (["grin", base, "relief_open", base, "grin", "smile"] as Expr[])[Math.floor(t * 9) % 6];
export const pop = (t: number, t0: number, d = 0.18) => { const u = clamp01((t - t0) / d); return u < 1 ? Math.sin(u * Math.PI * 0.5) * (1 + 0.25 * Math.sin(u * Math.PI)) : 1; };
export const writeT = (t: number, k = 1.6) => (t * k) % 1;
