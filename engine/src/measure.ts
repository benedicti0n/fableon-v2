// Subject measurements from the real drawing code. A recording canvas context (no pixels) captures the bounds of
// person()/special drawings; the returned head geometry gives eye and head heights. All numbers are metres at scale 1.
import { Pen } from "./toon";
import { person, ganesha, agni, deer, naga, baby, jarShape, type Build, type Spec } from "./people";
import { SU } from "./cast";

export type Measure = {
  description: string;
  standing: number;
  seated: number;
  eye: number;
  eyeSeated: number;
  head: number;
  halfWidth: number;
};

const grad = { addColorStop() {} };
class RecCtx {
  fillStyle = ""; strokeStyle = ""; lineWidth = 1; lineCap = "butt"; lineJoin = "miter";
  private m = [1, 0, 0, 1, 0, 0];
  private stack: number[][] = [];
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  private map(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  private mark(x: number, y: number) { const [u, v] = this.map(x, y); this.minX = Math.min(this.minX, u); this.maxX = Math.max(this.maxX, u); this.minY = Math.min(this.minY, v); this.maxY = Math.max(this.maxY, v); }
  beginPath() {}
  closePath() {}
  moveTo(x: number, y: number) { this.mark(x, y); }
  lineTo(x: number, y: number) { this.mark(x, y); }
  arc(x: number, y: number, r: number) { this.mark(x - r, y - r); this.mark(x + r, y + r); }
  fill() {}
  stroke() {}
  clip() {}
  save() { this.stack.push([...this.m]); }
  restore() { const m = this.stack.pop(); if (m) this.m = m; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [a0, b0, c0, d0, e0, f0] = this.m;
    this.m = [a0 * a + c0 * b, b0 * a + d0 * b, a0 * c + c0 * d, b0 * c + d0 * d, a0 * e + c0 * f + e0, b0 * e + d0 * f + f0];
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.m = [a, b, c, d, e, f]; }
  createLinearGradient() { return grad; }
  createRadialGradient() { return grad; }
  fillRect() {}
  clearRect() {}
  putImageData() {}
  drawImage() {}
}

const measureDraw = (draw: (p: Pen) => { hc?: number; chin?: number; crown?: number } | void) => {
  const g = new RecCtx();
  const r = draw(new Pen(g as unknown as CanvasRenderingContext2D));
  const top = g.minY, bottom = g.maxY;
  const ret = (r ?? {}) as { hc?: number; chin?: number; crown?: number };
  return { top, bottom, minX: g.minX, maxX: g.maxX, hc: ret.hc, chin: ret.chin, crown: ret.crown };
};
const M = (d: string, x0: number, x1: number, y0: number, y1: number, hc: number, chin: number, crown: number): Measure => ({
  description: d,
  standing: (975 - Math.min(y0, crown)) * SU,
  seated: (975 - Math.min(y0, crown)) * SU,
  eye: (975 - hc) * SU,
  eyeSeated: (975 - hc) * SU,
  head: (chin - crown) * SU,
  halfWidth: Math.max(300 - x0, x1 - 300) * SU,
});

const REP: Record<Build, Spec> = {
  adult: { skin: "#e7b07e", build: "adult", top: "#c8342e", lower: "#f6efdc", border: "#e8b53a", head: "crownSmall", necklace: "#e8b53a" },
  slim: { skin: "#c98c5c", build: "slim", top: "#f2c230", sari: "#2f8a8a", border: "#e8b53a", head: "long", hairCol: "#1e1418" },
  stout: { skin: "#e7b07e", build: "stout", top: null, lower: "#f2e6c4", border: "#e8b53a", head: "crown", moustache: "#2a1a1e", necklace: "#e8b53a" },
  big: { skin: "#a8693f", build: "big", top: null, lower: "#f6efdc", border: "#e8b53a", drape: "#c8342e", head: "hair", hairCol: "#2a1a1e" },
  elder: { skin: "#7f4b2e", build: "elder", top: null, lower: "#e8a33a", drape: "#d9772b", head: "bun", hairCol: "#eeeae4", beard: "#eeeae4", beardLong: true },
  kid: { skin: "#e7b07e", build: "kid", top: null, lower: "#f6efdc", drape: "#7a3f9a", head: "hair", hairCol: "#2a1a1e" },
  baby: { skin: "#f4c9a0", build: "baby", top: null, lower: "#f6efdc", head: null },
};

export function measureSubjects(): Record<string, Measure> {
  const out: Record<string, Measure> = {};
  for (const [name, spec] of Object.entries(REP) as [Build, Spec][]) {
    const standing = measureDraw((p) => person(p, spec, { pose: "stand", expr: "smile", light: 0 }));
    const seated = measureDraw((p) => person(p, spec, { pose: "sit", seated: true, expr: "smile", light: 0 }));
    out[name] = M(`${name} build standing`, standing.minX, standing.maxX, standing.top, standing.bottom, standing.hc!, standing.chin!, standing.crown!);
    out[name].seated = (975 - seated.top) * SU;
    out[name].eyeSeated = (975 - seated.hc!) * SU;
  }
  const g = measureDraw((p) => { ganesha(p, { write: 0.25, light: 0 }); });
  out.ganesha = { description: "Ganesha seated at the writing desk", standing: (975 - g.top) * SU, seated: (975 - g.top) * SU, eye: (975 - 468) * SU, eyeSeated: (975 - 468) * SU, head: 256 * SU, halfWidth: Math.max(300 - g.minX, g.maxX - 300) * SU };
  const a = measureDraw((p) => agni(p, { light: 0, t: 0 }));
  out.agni = M("Agni standing (body height, not flame hair)", a.minX, a.maxX, a.top, a.bottom, a.hc!, a.chin!, a.crown!);
  const d = measureDraw((p) => { deer(p, { light: 0 }); });
  out.deer = { description: "Stag in side view", standing: (d.bottom - d.top) * SU, seated: (d.bottom - d.top) * SU, eye: (d.bottom - 230) * SU, eyeSeated: (d.bottom - 230) * SU, head: 100 * SU, halfWidth: Math.max(500 - d.minX, d.maxX - 500) * SU };
  const n = measureDraw((p) => { naga(p, { light: 0 }); });
  out.naga = { description: "Coiled naga with hood", standing: (975 - n.top) * SU, seated: (975 - n.top) * SU, eye: (975 - 380) * SU, eyeSeated: (975 - 380) * SU, head: 300 * SU, halfWidth: Math.max(300 - n.minX, n.maxX - 300) * SU };
  const b = measureDraw((p) => { baby(p, { light: 0 }); });
  out.baby = { description: "Swaddled baby bundle", standing: (700 - b.top) * SU, seated: (700 - b.top) * SU, eye: (700 - 300) * SU, eyeSeated: (700 - 300) * SU, head: 190 * SU, halfWidth: Math.max(300 - b.minX, b.maxX - 300) * SU };
  const pot = measureDraw((p) => { jarShape(p, 300, 700, 140, 2.4, false); });
  out.pot = { description: "Cooking pot", standing: (700 - pot.top) * SU, seated: (700 - pot.top) * SU, eye: (700 - pot.top) * SU, eyeSeated: (700 - pot.top) * SU, head: 0.2, halfWidth: 180 * SU };
  const flat = measureDraw((p) => { p.g.transform(0, 1, -1, 0, 1000, 215); person(p, REP.stout, { pose: "armsUp", expr: "dazed", light: 0 }); });
  out.flat = { description: "A person lying flat on a wide card", standing: (flat.bottom - flat.top) * SU, seated: (flat.bottom - flat.top) * SU, eye: (flat.bottom - flat.top) * SU * 0.55, eyeSeated: (flat.bottom - flat.top) * SU * 0.55, head: 260 * SU, halfWidth: Math.max(500 - flat.minX, flat.maxX - 500) * SU };
  return out;
}
