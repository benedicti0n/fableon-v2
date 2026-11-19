// Character-coverage mask shared by the glow passes. The world renders actor/special cards (never effects) into a
// 2x supersampled target; the glow source and the final glow are both multiplied by (1 - mask).
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

// The mask is the cards' real anti-aliased alpha, 2x supersampled and downsampled to the frame resolution; no dilation.
export const maskFn = (p: string) => /* glsl */ `
uniform sampler2D ${p}CharMask;
uniform float ${p}MaskOn;
float ${p}MaskAt(vec2 uv) {
  if (${p}MaskOn < 0.5) return 0.0;
  return clamp(texture2D(${p}CharMask, uv).r, 0.0, 1.0);
}
`;
