// Character-coverage mask shared by the glow passes. The world renders actor/special cards (never effects) into a
// full-res target; the glow source and the final glow are both multiplied by (1 - mask), dilated by one pixel at 1080.
import { Uniform, Vector2, Texture } from "three";

// Names are prefixed per effect: postprocessing merges all effects in one EffectPass by uniform name.
export type MaskUniforms = Record<string, Uniform>;
export const maskPrefix = { bloom: "b", halation: "h" } as const;

export const makeMaskUniforms = (p: string): MaskUniforms => ({
  [`${p}CharMask`]: new Uniform<Texture | null>(null),
  [`${p}MaskTexel`]: new Uniform(new Vector2(1, 1)),
  [`${p}MaskRadius`]: new Uniform(1),
  [`${p}MaskOn`]: new Uniform(0),
});

export const maskSet = (u: MaskUniforms, p: string, tex: Texture, width: number, height: number, on: boolean) => {
  u[`${p}CharMask`].value = tex;
  (u[`${p}MaskTexel`].value as Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
  u[`${p}MaskRadius`].value = Math.max(1, height / 1080);
  u[`${p}MaskOn`].value = on ? 1 : 0;
};

// 3x3 max dilation: one pixel at 1080, scaled by the output height. The mask itself is NearestFilter and binary.
export const maskFn = (p: string) => /* glsl */ `
uniform sampler2D ${p}CharMask;
uniform vec2 ${p}MaskTexel;
uniform float ${p}MaskRadius;
uniform float ${p}MaskOn;
float ${p}MaskAt(vec2 uv) {
  if (${p}MaskOn < 0.5) return 0.0;
  vec2 r = ${p}MaskTexel * ${p}MaskRadius;
  float m = texture2D(${p}CharMask, uv).r;
  m = max(m, texture2D(${p}CharMask, uv + vec2(r.x, 0.0)).r);
  m = max(m, texture2D(${p}CharMask, uv - vec2(r.x, 0.0)).r);
  m = max(m, texture2D(${p}CharMask, uv + vec2(0.0, r.y)).r);
  m = max(m, texture2D(${p}CharMask, uv - vec2(0.0, r.y)).r);
  m = max(m, texture2D(${p}CharMask, uv + r).r);
  m = max(m, texture2D(${p}CharMask, uv - r).r);
  m = max(m, texture2D(${p}CharMask, uv + vec2(r.x, -r.y)).r);
  m = max(m, texture2D(${p}CharMask, uv + vec2(-r.x, r.y)).r);
  return step(0.5, m);
}
`;
