// The original 13-tap halation, kept for legacy storyboards bit-for-bit. It sits at intensity 0 in the legacy pass
// (output = input), exactly as in the pre-Phase-3F chain. Look shots use the clean multi-scale HalationEffect.
import { Effect, BlendFunction } from "postprocessing";
import { Uniform, Vector2, Vector3 } from "three";
import type { Texture } from "three";
import { MaskUniforms, makeMaskUniforms, maskPrefix, maskSet, maskFn } from "./charMask";

const FRAG = /* glsl */ `
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uIntensity;
uniform float uRadius;
uniform vec3 uTint;
${maskFn(maskPrefix.halation)}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 glow = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 13; i++) {
    float fi = float(i);
    float a = fi * 2.39996323;
    float r = sqrt((fi + 0.5) / 13.0) * uRadius;
    vec2 o = vec2(cos(a), sin(a)) * r * uTexel;
    vec3 c = texture2D(inputBuffer, uv + o).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float w = smoothstep(uThreshold, uThreshold + 0.12, l) * (1.0 - ${maskPrefix.halation}MaskAt(uv + o));
    glow += c * w;
    wsum += w;
  }
  glow = (glow / max(wsum, 1.0)) * uTint * uIntensity;
  float baseL = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  glow *= smoothstep(0.03, 0.18, baseL);
  glow *= 1.0 - ${maskPrefix.halation}MaskAt(uv);
  outputColor = vec4(1.0 - (1.0 - inputColor.rgb) * (1.0 - glow), inputColor.a);
}
`;

export class LegacyHalationEffect extends Effect {
  mask: MaskUniforms;
  constructor() {
    const mask = makeMaskUniforms(maskPrefix.halation);
    super("LegacyHalationEffect", FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uTexel", new Uniform(new Vector2(1 / 1440, 1 / 2560))],
        ["uThreshold", new Uniform(0.75)],
        ["uIntensity", new Uniform(0)],
        ["uRadius", new Uniform(18)],
        ["uTint", new Uniform(new Vector3(1.0, 0.82, 0.62))],
        ...Object.entries(mask),
      ]),
    });
    this.mask = mask;
  }
  setCharMask(tex: Texture, width: number, height: number, on: boolean) { maskSet(this.mask, maskPrefix.halation, tex, width, height, on); }
  setSize(width: number, height: number) {
    (this.uniforms.get("uTexel")!.value as Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.radius = Math.max(6, Math.round((height / 1080) * 18));
  }
  get radius() { return this.uniforms.get("uRadius")!.value as number; }
  set radius(v: number) { this.uniforms.get("uRadius")!.value = v; }
  get intensity() { return this.uniforms.get("uIntensity")!.value as number; }
  set intensity(v: number) { this.uniforms.get("uIntensity")!.value = v; }
}
