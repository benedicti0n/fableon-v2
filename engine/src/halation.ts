// Clean warm glow: a masked, multi-scale mipmap bloom (same Gaussian pyramid as the HDR bloom) with a soft-knee
// threshold. The character mask gates both the bright pass and the added glow; no spiral taps, no up/downsample offset,
// no ring or offset copy around stars and clouds. Legacy shots keep maskOn=0 and the stock bloom math.
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { Texture } from "three";
import { MaskedBloomEffect } from "./glow";

export class HalationEffect extends MaskedBloomEffect {
  private black = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; return t; })();
  private _on = false;
  constructor() {
    super({
      blendFunction: BlendFunction.ADD,
      intensity: 0,
      luminanceThreshold: 0.65,
      luminanceSmoothing: 0.2,
      mipmapBlur: true,
      levels: 5,
      radius: 0.55,
    });
    this.setTint("#ffd0a0");
    this.on = false;
  }
  get on() { return this._on; }
  set on(v: boolean) {
    this._on = v;
    this.uniforms.get("map")!.value = v ? this.texture : this.black;
  }
  setCharMask(tex: Texture, width: number, height: number, on: boolean) { super.setCharMask(tex, width, height, on); }
  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number) {
    if (!this._on) return;
    super.update(renderer, inputBuffer, deltaTime);
  }
  set tint(hex: string) { this.setTint(hex); }
  get threshold() { return this.luminanceMaterial.threshold; }
  set threshold(v: number) { this.luminanceMaterial.threshold = v; this.luminanceMaterial.smoothing = 0.2; }
  get radius() { return this.mipmapBlurPass.radius; }
  set radius(px: number) { this.mipmapBlurPass.radius = Math.max(0.15, Math.min(0.95, px / 40)); }
  get intensity() { return this.uniforms.get("intensity")!.value as number; }
  set intensity(v: number) { this.uniforms.get("intensity")!.value = v; }
}
