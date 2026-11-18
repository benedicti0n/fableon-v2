// Colour grade for the bridge short (post agent): references/grade/GradeEffect.ts (reports/grade.md) verbatim,
// plus GRADES / GRADE_STRENGTH / gradeFor() so the lead can re-fit the presets after the lighting merge.
// The presets were fitted to the OLD unlit stills: after the WORLD lighting lands they will over-correct; re-fit
// (grade.md 5.C) or lower GRADE_STRENGTH. Each Inner (crossfade layer) grades with its own shot's light, so the DOM
// crossfade at XFADE frames (shots 10->11, 13->14) cross-fades the presets as well.
// GradeEffect: the fitted reference-style colour grade as a postprocessing 6.37 Effect.
// Put it LAST in the EffectComposer, after ToneMappingEffect. It works on display-referred values: the input (linear,
// already tone-mapped to 0..1) is encoded to sRGB, graded exactly like scripts/grade.py (validated on our stills), and
// decoded back to linear for the composer's output encoding.
//   1. RGB tone curve: monotone cubic Hermite through 7 knots at x = 0, .1, .25, .5, .75, .9, 1
//   2. saturation around luma Y' (Rec.709 weights on the encoded values), separately for shadows / mids / highlights
//   3. 3-way tint (split tone): zero-luma RGB offsets in shadows, mids, highlights
//   4. vignette: x (1 - k * smoothstep(r0, 1, r)), r = elliptical radius, corners = 1
// `amount` blends the whole grade (0 = bypass) so it can be dialled back once lighting/albedo work brightens the render.
import { Effect, BlendFunction } from "postprocessing";
import { Uniform, Vector3, Vector2 } from "three";
import type { Texture } from "three";
import { MaskUniforms, makeMaskUniforms, maskFn, maskSet } from "./charMask";

const frag = /* glsl */ `
uniform float gradeKy[7];
uniform float gradeKm[7];
uniform vec3 gradeSat;      // x = shadows, y = mids, z = highlights
uniform vec3 gradeTintS;    // zero-luma RGB offsets (sRGB-encoded units)
uniform vec3 gradeTintM;
uniform vec3 gradeTintH;
uniform vec2 gradeVig;      // x = strength k, y = start radius r0
uniform float gradeAmount;
uniform float gradeProtect;  // look shots: leave luma < 0.06 untouched, fade the shadow tint in 0.06-0.18
uniform float legacyKy[7];
uniform float legacyKm[7];
uniform vec3 legacySat;
uniform vec3 legacyTintS;
uniform vec3 legacyTintM;
uniform vec3 legacyTintH;
uniform vec2 legacyVig;
uniform float legacyAmount;
uniform float gradeMaskOn;
${maskFn("g")}

vec3 gradeEncode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 gradeDecode(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float gradeHermite(float v, float x0, float x1, float y0, float y1, float m0, float m1) {
  float h = x1 - x0, t = (v - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * y0 + (t3 - 2.0 * t2 + t) * h * m0 + (-2.0 * t3 + 3.0 * t2) * y1 + (t3 - t2) * h * m1;
}
float gradeCurve(float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.1)  return gradeHermite(v, 0.0, 0.1, gradeKy[0], gradeKy[1], gradeKm[0], gradeKm[1]);
  if (v < 0.25) return gradeHermite(v, 0.1, 0.25, gradeKy[1], gradeKy[2], gradeKm[1], gradeKm[2]);
  if (v < 0.5)  return gradeHermite(v, 0.25, 0.5, gradeKy[2], gradeKy[3], gradeKm[2], gradeKm[3]);
  if (v < 0.75) return gradeHermite(v, 0.5, 0.75, gradeKy[3], gradeKy[4], gradeKm[3], gradeKm[4]);
  if (v < 0.9)  return gradeHermite(v, 0.75, 0.9, gradeKy[4], gradeKy[5], gradeKm[4], gradeKm[5]);
  return gradeHermite(v, 0.9, 1.0, gradeKy[5], gradeKy[6], gradeKm[5], gradeKm[6]);
}
float legacyCurve(float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.1)  return gradeHermite(v, 0.0, 0.1, legacyKy[0], legacyKy[1], legacyKm[0], legacyKm[1]);
  if (v < 0.25) return gradeHermite(v, 0.1, 0.25, legacyKy[1], legacyKy[2], legacyKm[1], legacyKm[2]);
  if (v < 0.5)  return gradeHermite(v, 0.25, 0.5, legacyKy[2], legacyKy[3], legacyKm[2], legacyKm[3]);
  if (v < 0.75) return gradeHermite(v, 0.5, 0.75, legacyKy[3], legacyKy[4], legacyKm[3], legacyKm[4]);
  if (v < 0.9)  return gradeHermite(v, 0.75, 0.9, legacyKy[4], legacyKy[5], legacyKm[4], legacyKm[5]);
  return gradeHermite(v, 0.9, 1.0, legacyKy[5], legacyKy[6], legacyKm[5], legacyKm[6]);
}

const vec3 W = vec3(0.2126, 0.7152, 0.0722);
vec3 gradeFinish(vec3 src, vec3 c, vec3 sat, vec3 tintS, vec3 tintM, vec3 tintH, vec2 vig, vec2 uv, float protectOn, float amount) {
  float y = dot(c, W);
  float wS = 1.0 - smoothstep(0.0, 0.55, y);
  float wH = smoothstep(0.45, 1.0, y);
  float wM = 1.0 - wS - wH;
  float s = sat.y + (sat.x - sat.y) * wS + (sat.z - sat.y) * wH;
  c = vec3(y) + s * (c - vec3(y));
  float srcY = dot(src, W);
  float protect = smoothstep(0.06, 0.18, srcY);
  float shadowW = mix(wS, protect * (1.0 - smoothstep(0.45, 0.70, srcY)), protectOn);
  c += shadowW * tintS + wM * tintM + wH * tintH;
  vec2 p = uv * 2.0 - 1.0;
  float r = length(p) * 0.70710678;
  c *= 1.0 - vig.x * smoothstep(vig.y, 1.0, r);
  c = clamp(c, 0.0, 1.0);
  return mix(src, c, amount * mix(1.0, protect, protectOn));
}
vec3 gradeMood(vec3 src, vec2 uv) {
  vec3 c = vec3(gradeCurve(src.r), gradeCurve(src.g), gradeCurve(src.b));
  return gradeFinish(src, c, gradeSat, gradeTintS, gradeTintM, gradeTintH, gradeVig, uv, 1.0, gradeAmount);
}
vec3 gradeLegacy(vec3 src, vec2 uv) {
  vec3 c = vec3(legacyCurve(src.r), legacyCurve(src.g), legacyCurve(src.b));
  return gradeFinish(src, c, legacySat, legacyTintS, legacyTintM, legacyTintH, legacyVig, uv, 0.0, legacyAmount);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 src = gradeEncode(inputColor.rgb);
  if (gradeMaskOn < 0.5) {
    // Legacy path: the exact single-grade shader (bit-identical for storyboards without a look block).
    vec3 c = vec3(gradeCurve(src.r), gradeCurve(src.g), gradeCurve(src.b));
    float y = dot(c, W);
    float wS = 1.0 - smoothstep(0.0, 0.55, y);
    float wH = smoothstep(0.45, 1.0, y);
    float wM = 1.0 - wS - wH;
    float s = gradeSat.y + (gradeSat.x - gradeSat.y) * wS + (gradeSat.z - gradeSat.y) * wH;
    c = vec3(y) + s * (c - vec3(y));
    float srcY = dot(src, W);
    float protect = smoothstep(0.06, 0.18, srcY);
    float shadowW = mix(wS, protect * (1.0 - smoothstep(0.45, 0.70, srcY)), gradeProtect);
    c += shadowW * gradeTintS + wM * gradeTintM + wH * gradeTintH;
    vec2 p = uv * 2.0 - 1.0;
    float r = length(p) * 0.70710678;
    c *= 1.0 - gradeVig.x * smoothstep(gradeVig.y, 1.0, r);
    c = clamp(c, 0.0, 1.0);
    outputColor = vec4(gradeDecode(mix(src, c, gradeAmount * mix(1.0, protect, gradeProtect))), inputColor.a);
  } else {
    float m = gMaskAt(uv);
    vec3 world = gradeMood(src, uv);
    vec3 character = gradeLegacy(src, uv);
    outputColor = vec4(gradeDecode(mix(world, character, m)), inputColor.a);
  }
}
`;

// BT.709 zero-luma chroma basis (sRGB-encoded units): unit Cb and unit Cr as RGB offsets with Y' unchanged
const E_CB: [number, number, number] = [0.0, -0.18733, 1.8556];
const E_CR: [number, number, number] = [1.5748, -0.46813, 0.0];
export const tintRGB = (cb: number, cr: number) =>
  new Vector3(cb * E_CB[0] + cr * E_CR[0], cb * E_CB[1] + cr * E_CR[1], cb * E_CB[2] + cr * E_CR[2]);

/** Fritsch-Carlson monotone tangents for the 7 fixed knots (same as scripts/grade.py `tangents`) */
export const KX = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
export function monoTangents(ky: number[]): number[] {
  const n = KX.length, h: number[] = [], d: number[] = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h.push(KX[k + 1] - KX[k]); d.push((ky[k + 1] - ky[k]) / h[k]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) { m[k] = 0; continue; }
    const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  }
  return m;
}

export type GradeParams = {
  ky: number[];                                  // 7 curve values at KX
  sat: [number, number, number];                 // shadows, mids, highlights
  tintS: [number, number]; tintM: [number, number]; tintH: [number, number];   // (Cb, Cr) per zone
  vig: [number, number];                         // strength, start radius
};

// __GRADES__ (fitted by scripts/fit2.py, written by scripts/emit_ts.py)
export const GRADE_DAY: GradeParams = {
  ky: [0.0345, 0.1828, 0.3812, 0.6605, 0.8814, 0.9631, 1],   // tangents: [1.4831, 1.4038, 1.2198, 0.9867, 0.6608, 0.4346, 0.3693]
  sat: [0.9831, 1.2727, 1.4573],
  tintS: [-0.0291, 0.0411], tintM: [0.0376, -0.0104], tintH: [0.0144, -0.0047],
  vig: [0.1, 0.45],
};
//   shadows tint: hue 20 deg, RGB offset (+16.5, -3.5, -13.8)/255
//   mids tint: hue 230 deg, RGB offset (-4.2, -0.6, +17.8)/255
//   highlights tint: hue 228 deg, RGB offset (-1.9, -0.1, +6.8)/255
export const GRADE_GOLDEN: GradeParams = {
  ky: [0.0311, 0.1877, 0.4017, 0.6754, 0.875, 0.9582, 1],   // tangents: [1.5667, 1.498, 1.2526, 0.9235, 0.6445, 0.4724, 0.4183]
  sat: [0.8316, 0.8799, 1.7061],
  tintS: [0.0528, 0.0004], tintM: [0.0583, -0.0003], tintH: [0, 0],
  vig: [0.16, 0.4],
};
//   shadows tint: hue 246 deg, RGB offset (+0.2, -2.6, +25.0)/255
//   mids tint: hue 245 deg, RGB offset (-0.1, -2.7, +27.6)/255
//   highlights tint: hue 0 deg, RGB offset (+0.0, -0.0, +0.0)/255

export class GradeEffect extends Effect {
  mask: MaskUniforms;
  constructor(p: GradeParams, amount = 1) {
    const mask = makeMaskUniforms("g");
    super("GradeEffect", frag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["gradeKy", new Uniform(p.ky.slice())],
        ["gradeKm", new Uniform(monoTangents(p.ky))],
        ["gradeSat", new Uniform(new Vector3(...p.sat))],
        ["gradeTintS", new Uniform(tintRGB(...p.tintS))],
        ["gradeTintM", new Uniform(tintRGB(...p.tintM))],
        ["gradeTintH", new Uniform(tintRGB(...p.tintH))],
        ["gradeVig", new Uniform(new Vector2(...p.vig))],
        ["gradeAmount", new Uniform(amount)],
        ["gradeProtect", new Uniform(0)],
        ["legacyKy", new Uniform(p.ky.slice())],
        ["legacyKm", new Uniform(monoTangents(p.ky))],
        ["legacySat", new Uniform(new Vector3(...p.sat))],
        ["legacyTintS", new Uniform(tintRGB(...p.tintS))],
        ["legacyTintM", new Uniform(tintRGB(...p.tintM))],
        ["legacyTintH", new Uniform(tintRGB(...p.tintH))],
        ["legacyVig", new Uniform(new Vector2(...p.vig))],
        ["legacyAmount", new Uniform(1)],
        ["gradeMaskOn", new Uniform(0)],
        ...Object.entries(mask),
      ]),
    });
    this.mask = mask;
  }
  /** the character-card grade (the shot's legacy light preset), applied inside the charMask only */
  setLegacy(p: GradeParams, amount = 1) {
    const u = this.uniforms;
    u.get("legacyKy")!.value = p.ky.slice();
    u.get("legacyKm")!.value = monoTangents(p.ky);
    (u.get("legacySat")!.value as Vector3).set(...p.sat);
    u.get("legacyTintS")!.value = tintRGB(...p.tintS);
    u.get("legacyTintM")!.value = tintRGB(...p.tintM);
    u.get("legacyTintH")!.value = tintRGB(...p.tintH);
    // cards stay flat: no screen-space vignette on the character grade
    (u.get("legacyVig")!.value as Vector2).set(0, 0);
    u.get("legacyAmount")!.value = amount;
  }
  setCharMask(tex: Texture, width: number, height: number, on: boolean) {
    maskSet(this.mask, "g", tex, width, height, on);
    this.uniforms.get("gradeMaskOn")!.value = on ? 1 : 0;
  }
  /** switch preset per shot (day <-> golden) or blend two presets during a crossfade/time-of-day change */
  set(p: GradeParams, q?: GradeParams, t = 0) {
    const L = (a: number, b: number) => a + (b - a) * t;
    const r: GradeParams = q ? {
      ky: p.ky.map((v, i) => L(v, q.ky[i])),
      sat: [L(p.sat[0], q.sat[0]), L(p.sat[1], q.sat[1]), L(p.sat[2], q.sat[2])],
      tintS: [L(p.tintS[0], q.tintS[0]), L(p.tintS[1], q.tintS[1])], tintM: [L(p.tintM[0], q.tintM[0]), L(p.tintM[1], q.tintM[1])],
      tintH: [L(p.tintH[0], q.tintH[0]), L(p.tintH[1], q.tintH[1])], vig: [L(p.vig[0], q.vig[0]), L(p.vig[1], q.vig[1])],
    } : p;
    const u = this.uniforms;
    u.get("gradeKy")!.value = r.ky.slice();
    u.get("gradeKm")!.value = monoTangents(r.ky);
    (u.get("gradeSat")!.value as Vector3).set(...r.sat);
    u.get("gradeTintS")!.value = tintRGB(...r.tintS);
    u.get("gradeTintM")!.value = tintRGB(...r.tintM);
    u.get("gradeTintH")!.value = tintRGB(...r.tintH);
    (u.get("gradeVig")!.value as Vector2).set(...r.vig);
  }
  get amount() { return this.uniforms.get("gradeAmount")!.value as number; }
  set amount(v: number) { this.uniforms.get("gradeAmount")!.value = v; }
  get protect() { return this.uniforms.get("gradeProtect")!.value as number; }
  set protect(v: number) { this.uniforms.get("gradeProtect")!.value = v; }
}

/** Presets per light (plain objects: edit / re-fit freely). */
// Round-2 re-fit on the relit world (WORLD agent, 2026-10-31). The fitted presets above brighten (they were fitted to
// the old dark stills) and washed the new lighting out; these are gentle S-curves at full strength instead.
//   day: mid knot .60 for median Y' ~.57, darks pressed (.1 -> .085), a hint of violet in shadows.
//   golden: stronger S (darks .1 -> .09, mids .5 -> .54), blue-violet shadow tint, orange highlight tint, heavier vignette.
export const GRADE_DAY2: GradeParams = {
  ky: [0, 0.1, 0.28, 0.6, 0.835, 0.945, 1],
  sat: [1.0, 1.05, 1.0],
  tintS: [0.01, 0.002], tintM: [0, 0], tintH: [0.006, 0],
  vig: [0.12, 0.45],
};
export const GRADE_GOLDEN2: GradeParams = {
  ky: [0, 0.09, 0.245, 0.54, 0.8, 0.93, 1],
  sat: [1.0, 1.12, 1.15],
  tintS: [0.02, 0.002], tintM: [0, 0], tintH: [-0.012, 0.006],
  vig: [0.2, 0.4],
};
export const GRADE_NIGHT: GradeParams = {
  ky: [0, 0.085, 0.25, 0.55, 0.82, 0.94, 1],
  sat: [1.05, 1.15, 1.1],
  tintS: [0.035, 0.0], tintM: [0.0, 0.0], tintH: [-0.015, 0.01],
  vig: [0.26, 0.38],
};
export const GRADE_DEEP: GradeParams = {
  ky: [0, 0.095, 0.27, 0.57, 0.83, 0.94, 1],
  sat: [1.0, 1.08, 1.0],
  tintS: [0.02, -0.01], tintM: [0, 0], tintH: [0, 0],
  vig: [0.22, 0.4],
};
type LightName = "day" | "golden" | "night" | "deep";
// Mood presets (Phase 3F): gentle S-curves, shadow lift toward violet and warm highlights. Values are calibrated on the
// Adi golden/night frames and the STYLE_BIBLE; see docs/reports/phase-3f.md.
export const GRADE_GOLDEN_GLOW: GradeParams = {
  ky: [0, 0.07, 0.22, 0.55, 0.86, 0.97, 1], sat: [1.02, 1.16, 1.22],
  tintS: [0.10, 0.004], tintM: [0.008, 0], tintH: [-0.03, 0.016], vig: [0.50, 0.22],
};
export const GRADE_WARM_SIDE: GradeParams = {
  ky: [0, 0.04, 0.14, 0.48, 0.86, 0.97, 1], sat: [1.0, 1.08, 1.1],
  tintS: [0.10, 0.004], tintM: [0.008, 0], tintH: [0.008, 0], vig: [0.48, 0.22],
};
export const GRADE_DUSK: GradeParams = {
  ky: [0, 0.05, 0.16, 0.5, 0.88, 0.99, 1], sat: [1.05, 1.15, 1.22],
  tintS: [0.10, 0], tintM: [0.015, 0], tintH: [-0.02, 0.012], vig: [0.55, 0.20],
};
export const GRADE_NIGHT_MOON: GradeParams = {
  ky: [0, 0.14, 0.4, 0.72, 0.96, 1, 1], sat: [1.05, 1.18, 1.15],
  tintS: [0.08, 0.002], tintM: [-0.005, 0.004], tintH: [-0.012, 0.008], vig: [0.50, 0.18],
};
export const GRADE_NOON: GradeParams = {
  ky: [0, 0.1, 0.3, 0.62, 0.84, 0.94, 1], sat: [1.0, 1.04, 1.02],
  tintS: [0.012, 0], tintM: [0.004, 0], tintH: [0.008, 0], vig: [0.1, 0.46],
};
export const GRADES: Record<string, GradeParams> = {
  day: GRADE_DAY2, golden: GRADE_GOLDEN2, night: GRADE_NIGHT, deep: GRADE_DEEP,
  goldenGlow: GRADE_GOLDEN_GLOW, warmSide: GRADE_WARM_SIDE, dusk: GRADE_DUSK, nightMoon: GRADE_NIGHT_MOON, noon: GRADE_NOON,
};
export const GRADE_STRENGTH: Record<string, number> = { day: 1, golden: 1, night: 1, deep: 1, goldenGlow: 1, warmSide: 1, dusk: 1, nightMoon: 1, noon: 1 };
/** Apply a light/mood preset to the effect (only touches uniforms when the preset changes). */
export function gradeFor(fx: GradeEffect, name: string) {
  const tag = fx as unknown as { _light?: string };
  if (tag._light !== name) { fx.set(GRADES[name] ?? GRADES.day); tag._light = name; }
  fx.amount = GRADE_STRENGTH[name] ?? 1;
}
