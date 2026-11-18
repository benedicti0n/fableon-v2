// Masked HDR bloom: the bright pass and the added bloom are both multiplied by (1 - charMask), so characters neither
// emit nor receive the world glow. With maskOn=0 the shader is the stock BloomEffect (legacy storyboards unchanged).
import { BloomEffect } from "postprocessing";
import type { Texture } from "three";
import { MaskUniforms, makeMaskUniforms, maskPrefix, maskSet, maskFn } from "./charMask";

export class MaskedBloomEffect extends BloomEffect {
  mask: MaskUniforms;
  constructor(opts: ConstructorParameters<typeof BloomEffect>[0] = {}) {
    super(opts);
    this.mask = makeMaskUniforms(maskPrefix.bloom);
    for (const [k, v] of Object.entries(this.mask)) this.uniforms.set(k, v);
    const lum = this.luminanceMaterial;
    for (const [k, v] of Object.entries(this.mask)) lum.uniforms[k] = v;
    const needle = "gl_FragColor=vec4(texel.rgb*clamp(l,0.0,1.0),l);";
    if (!lum.fragmentShader.includes(needle)) throw new Error("masked bloom: luminance shader changed");
    const P = maskPrefix.bloom;
    lum.fragmentShader = maskFn(P) + lum.fragmentShader.replace(
      needle,
      `float cm=${P}MaskAt(vUv); gl_FragColor=vec4(texel.rgb*clamp(l,0.0,1.0)*(1.0-cm),l*(1.0-cm));`,
    );
    (this as unknown as { fragmentShader: string }).fragmentShader = `uniform sampler2D map; uniform float intensity;${maskFn(P)}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 texel = texture2D(map, uv);
  float cm = ${P}MaskAt(uv);
  outputColor = vec4(texel.rgb * intensity * (1.0 - cm), texel.a * (1.0 - cm));
}`;
  }
  setCharMask(tex: Texture, width: number, height: number, on: boolean) { maskSet(this.mask, maskPrefix.bloom, tex, width, height, on); }
}
