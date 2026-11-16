// Our cast as lit flat cards in the 3D world (bridge short's cast.ts machinery): each frame every character asks for a
// drawing (a key + a draw call); the pool keeps one canvas per distinct drawing. Characters are yaw-only billboards
// shaded by cardShade() (scene tint, bright floor, side gradient toward the sun, painted crescent in the drawing);
// standing ones get a multiply contact blob. Effects are unlit cards. Everything here lives on the NOINK layer.
import * as THREE from "three";
import { Pen, Expr, mix } from "./toon";
import { person, Spec, Opts, fxPetal } from "./people";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
import type { LightName } from "./lights";

export const FPS = 30;
// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 1;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
    // keep the free list small (old canvases are garbage)
    if (this.free.length > 60) this.free.splice(0, this.free.length - 60);
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const geoFor = (w: number, h: number, base: number) => { const g = new THREE.PlaneGeometry(w * SU, h * SU); g.translate(0, (base - h / 2) * SU, 0); return g; };
const GEOS: Record<string, THREE.BufferGeometry> = {
  body: geoFor(600, 1000, 975),          // standing figure, soles at y 975
  wide: geoFor(1000, 700, 640),          // animals (deer), lying figures: 1000 x 700, ground at 640
  baby: geoFor(600, 700, 690),
};
const CARD = new THREE.PlaneGeometry(1, 1);

export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(GEOS.body, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  geo(name: string) { this.mesh.geometry = GEOS[name] ?? GEOS.body; }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; fire: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.glow = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(2.2, 2.0, 1.6), fog: false });
    this.fire = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.3, 0.95, 0.75), fog: false });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(kind: "cut" | "soft" | "glow" | "fire") { this.mesh.material = kind === "soft" ? this.soft : kind === "glow" ? this.glow : kind === "fire" ? this.fire : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.glow.map = t; this.fire.map = t; this.mesh.renderOrder = 2; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: string; roll?: number; size: [number, number, number]; shadow?: boolean;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number;
  flat?: boolean; rot?: number; kind?: "cut" | "soft" | "glow" | "fire"; up?: boolean };
export type Stage = { places: Place[]; fx: FxPlace[] };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun: THREE.Vector3; light: LightName; pxH: number };

export const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 60) => Math.round(v * n) / n;
/** drawing resolution by distance (canvas w, h, scale from the design); sized for the 1440 x 2560 final */
export const tier = (d: number, w0 = 600, h0 = 1000): [number, number, number] => {
  const k = d < 2.6 ? 3.0 : d < 5 ? 2.0 : d < 10 ? 1.2 : d < 22 ? 0.6 : 0.3;
  return [Math.round(w0 * k), Math.round(h0 * k), k];
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
export const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = cam.sun.dot(cam.right) * (mirror ? -1 : 1), sy = -cam.sun.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

// ---------------- blinks ----------------
const LID = [0.5, 1, 1, 0.5];
/** eyelid 0 open .. 1 shut: blinks every 0.5-2.3 s (seeded per character), 4 frames each */
export const lidAt = (t: number, i: number) => {
  const f = Math.round(t * FPS);
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 600; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13));
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
const specKeys = new WeakMap<object, string>();
const specKey = (o: object) => { let k = specKeys.get(o); if (!k) { k = fkey(o); specKeys.set(o, k); } return k; };

// ---------------- contact shadows ----------------
const CONTACT: Record<LightName, [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], night: [0.18, 0.18, 0.3], deep: [0.25, 0.4, 0.45] };
const toSrgb = (v: number) => { const c = Math.max(0, Math.min(1, v)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const fxContact = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.32, 0.02], [0.5, 0.22], [0.66, 0.58], [0.82, 0.88], [1, 1]] as const) gr.addColorStop(r, mix(col, "#ffffff", k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};
export const blob = (out: Stage, cam: CamInfo, x: number, y: number, z: number, sc = 1, k = 1) => {
  const cc = hexOf(CONTACT[cam.light], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x, y: y + 0.022, z, w: 0.62 * sc, h: 0.46 * sc, flat: true, rot: 0 });
};

/** a character card at (x, y, z), facing the camera (front / 3-4 view); i = identity (blink seed) */
export const who = (out: Stage, cam: CamInfo, i: number, spec: Spec, o: Opts, x: number, y: number, z: number,
  extra: { scale?: number; mirror?: boolean; noBlob?: boolean; t?: number; yaw?: number; roll?: number } = {}) => {
  const sc = extra.scale ?? 1;
  const d = cam.pos.distanceTo(new THREE.Vector3(x, y + 1.2 * sc, z)) / sc;
  const [w, h, k] = tier(d);
  const mirror = !!extra.mirror, light = light2D(cam, mirror);
  const blink = o.blink ?? (extra.t !== undefined ? lidAt(extra.t, i) : 0);
  const oo: Opts = { ...o, light, blink, seed: o.seed ?? ((i * 5 + 3) % 7) + 1 };
  const key = `P|${i}|${specKey(spec)}|${fkey(oo)}`;
  out.places.push({ key, x, y, z, scale: sc, mirror, size: [w, h, k], draw: (p) => { person(p, spec, oo); }, yaw: extra.yaw, roll: extra.roll });
  if (!extra.noBlob) blob(out, cam, x, y, z, sc * (spec.build === "big" || spec.build === "stout" ? 1.15 : spec.build === "kid" ? 0.8 : 1));
};
/** any custom drawing on a body / wide / baby card */
export const card = (out: Stage, cam: CamInfo, key: string, draw: (p: Pen, light: number) => void, x: number, y: number, z: number,
  extra: { scale?: number; mirror?: boolean; geo?: "body" | "wide" | "baby"; noBlob?: boolean; yaw?: number; roll?: number; blobScale?: number } = {}) => {
  const sc = extra.scale ?? 1, geo = extra.geo ?? "body";
  const d = cam.pos.distanceTo(new THREE.Vector3(x, y + 1.0 * sc, z)) / sc;
  const [w0, h0] = geo === "wide" ? [1000, 700] : geo === "baby" ? [600, 700] : [600, 1000];
  const [w, h, k] = tier(d, w0, h0);
  const light = light2D(cam, !!extra.mirror);
  out.places.push({ key: `C|${key}|${q(light)}`, x, y, z, scale: sc, mirror: extra.mirror, geo, size: [w, h, k], draw: (p) => draw(p, light), yaw: extra.yaw, roll: extra.roll });
  if (!extra.noBlob) blob(out, cam, x, y, z, sc * (extra.blobScale ?? 1));
};
/** camera-facing effect card (w x h metres, centred) */
export const fx = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, x: number, y: number, z: number, w: number, h: number,
  extra: { rot?: number; kind?: "cut" | "soft" | "glow" | "fire"; flat?: boolean } = {}) => {
  out.fx.push({ key, cw, ch, draw, x, y, z, w, h, rot: extra.rot, kind: extra.kind, flat: extra.flat });
};
/** falling petals between y0 and the ground in a box around (x, z) */
export const petals = (out: Stage, t: number, x: number, z: number, y0: number, n: number, spread: number, t0: number) => {
  const cols = ["#f7a21b", "#ffd23a", "#e8475a", "#ff8fb0", "#fff2c8"];
  for (let i = 0; i < n; i++) {
    const tt = t - t0 - hh(i, 3) * 1.2;
    if (tt < 0) continue;
    const y = y0 - tt * (1.1 + hh(i, 4) * 0.6);
    if (y < 0.05) continue;
    const c = cols[i % 5];
    fx(out, `petal|${c}`, 128, 128, (p) => fxPetal(p, c), x + (hh(i, 1) - 0.5) * spread + 0.4 * Math.sin(tt * 2 + i), y, z + (hh(i, 2) - 0.5) * spread, 0.22, 0.22, { rot: tt * 3 + i });
  }
};
export type { Expr };
