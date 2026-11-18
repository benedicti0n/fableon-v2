// Halation / glow pass: threshold a warm highlight, blur it with a 13-tap spiral and screen-blend it over the image.
// It sits before the tone map, after the HDR bloom, and is disabled for legacy shots (no look block) so the Adi film is
// unchanged. The blur radius is in pixels and scales with the output height.
import { Effect, BlendFunction } from "postprocessing";
import { Uniform, Vector2, Vector3 } from "three";

const FRAG = /* glsl */ `
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uIntensity;
uniform float uRadius;
uniform vec3 uTint;
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
    float w = smoothstep(uThreshold, uThreshold + 0.12, l);
    glow += c * w;
    wsum += w;
  }
  glow = (glow / max(wsum, 1.0)) * uTint * uIntensity;
  outputColor = vec4(1.0 - (1.0 - inputColor.rgb) * (1.0 - glow), inputColor.a);
}
`;

export class HalationEffect extends Effect {
  constructor() {
    super("HalationEffect", FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uTexel", new Uniform(new Vector2(1 / 1440, 1 / 2560))],
        ["uThreshold", new Uniform(0.75)],
        ["uIntensity", new Uniform(0)],
        ["uRadius", new Uniform(18)],
        ["uTint", new Uniform(new Vector3(1.0, 0.82, 0.62))],
      ]),
    });
  }
  setSize(width: number, height: number) {
    (this.uniforms.get("uTexel")!.value as Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.radius = Math.max(6, Math.round((height / 1080) * 18));
  }
  get radius() { return this.uniforms.get("uRadius")!.value as number; }
  set radius(v: number) { this.uniforms.get("uRadius")!.value = v; }
  get intensity() { return this.uniforms.get("uIntensity")!.value as number; }
  set intensity(v: number) { this.uniforms.get("uIntensity")!.value = v; }
  get threshold() { return this.uniforms.get("uThreshold")!.value as number; }
  set threshold(v: number) { this.uniforms.get("uThreshold")!.value = v; }
  set tint(hex: string) {
    const c = hex.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16) / 255, g = parseInt(c.slice(2, 4), 16) / 255, b = parseInt(c.slice(4, 6), 16) / 255;
    (this.uniforms.get("uTint")!.value as Vector3).set(r, g, b);
  }
}
