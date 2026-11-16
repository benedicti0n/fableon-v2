// The places of the Adi Parva short, built once from boxes, cylinders, domes and painted canvas textures:
// river + banks, Hastinapura palace (sandstone arcade, chhatris, domes, ghat steps, mango trees), the fisher village
// (mud huts, thatch, boats, palms), the forest hermitage (banyan, open hut, writing desk, palm-leaf stacks), Pandu's
// clearing, the lacquer house, the contest arena (pavilion, bow stand, target pole), the clearing of the new city and
// the snake kingdom under the river. Every material is two-tone (kit.ts lam -> shade.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Batch, boxGeo, lam, V } from "./kit";
import { ctex, rep, stoneHD, grassHD, rng, jit } from "./paint";
import { twoTone } from "./shade";
import { G, PAL, VIL, HERM, DEER, LAC, ARENA, CITY, NAGA, RIVER_Z } from "./places";
import { beginSet, keepBox, keepCyl, resetKeepout } from "./keepout";

// ---------------- painted textures ----------------
const thatchTex = () => ctex("thatch", 512, 512, (g, r) => {
  g.fillStyle = "#c9a35a"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = r() * 512, y = r() * 512, l = 20 + r() * 40;
    g.strokeStyle = jit(r, i % 3 ? "#b98f48" : "#dcb86c", 0.12); g.lineWidth = 2 + r() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + l); g.stroke();
  }
  for (let y = 0; y < 512; y += 64) { g.fillStyle = "rgba(90,60,30,0.35)"; g.fillRect(0, y + 58, 512, 6); }
});
const mudTex = () => ctex("mud", 512, 512, (g, r) => {
  g.fillStyle = "#d9a86a"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) { g.fillStyle = jit(r, "#cf9a5c", 0.1); g.globalAlpha = 0.35; g.beginPath(); g.ellipse(r() * 512, r() * 512, 10 + r() * 30, 6 + r() * 14, r() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = "#f3e2c0"; g.fillRect(0, 440, 512, 14); g.fillStyle = "#b5552e"; g.fillRect(0, 454, 512, 10);
});
const sandTex = () => ctex("sand", 512, 512, (g, r) => {
  g.fillStyle = "#e6c88e"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 600; i++) { g.fillStyle = jit(r, "#d8b878", 0.12); g.globalAlpha = 0.5; g.fillRect(r() * 512, r() * 512, 3, 3); }
  g.globalAlpha = 1;
});
const sandstone = (key: string, cols: string[], mortar: string) => stoneHD(key, cols, mortar);
const fabricTex = (a: string, b: string) => ctex("fabric" + a + b, 256, 256, (g) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, 256); }
  g.fillStyle = "#e8b53a"; g.fillRect(0, 236, 256, 20);
});
const targetTex = () => ctex("target", 256, 256, (g) => {
  for (const [r, c] of [[124, "#f6efdc"], [100, "#d8343c"], [72, "#f6efdc"], [46, "#d8343c"], [20, "#f2c230"]] as const) { g.fillStyle = c; g.beginPath(); g.arc(128, 128, r, 0, 7); g.fill(); }
  g.strokeStyle = "#241726"; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.stroke();
});
const leafTex = () => ctex("palmleaf", 512, 128, (g, r) => {
  g.fillStyle = "#e9d39a"; g.fillRect(0, 0, 512, 128);
  for (let y = 20; y < 120; y += 18) { g.strokeStyle = "rgba(90,58,40,0.75)"; g.lineWidth = 3; g.beginPath(); g.moveTo(20, y); for (let x = 20; x < 490; x += 8) g.lineTo(x, y + (r() - 0.5) * 3); g.stroke(); }
  g.strokeStyle = "#b99a5a"; g.lineWidth = 4; g.strokeRect(2, 2, 508, 124);
});

// ---------------- shared materials ----------------
const M = {
  grass: () => lam("grassHD", () => ({ map: grassHD() })),
  sand: () => lam("sand", () => ({ map: rep(sandTex(), 1, 1) })),
  red: () => lam("redstone", () => ({ map: sandstone("redstone2", ["#c99a84", "#c1917c", "#d1a58f", "#bb8a74"], "#957060") })),
  cream: () => lam("creamstone", () => ({ map: sandstone("creamstone", ["#ead8b8", "#e2cfae", "#f0e0c4", "#dcc6a2"], "#b8a080") })),
  marble: () => lam("marble", () => ({ map: sandstone("marble", ["#f4efe6", "#eee8dc", "#f8f4ec", "#e8e0d2"], "#c8bcaa") })),
  plaster: () => lam("plaster", () => ({ color: "#f3ead8" })),
  dome: () => lam("dome", () => ({ color: "#f6efe2" })),
  goldm: () => twoTone(new THREE.MeshPhongMaterial({ color: "#e0a838", specular: "#fff0b0", shininess: 50 }), 0.2),
  mud: () => lam("mud", () => ({ map: mudTex() })),
  thatch: () => lam("thatch", () => ({ map: thatchTex() })),
  wood: () => lam("woodplain", () => ({ color: "#9a6a42" })),
  darkwood: () => lam("darkwood", () => ({ color: "#6e4a32" })),
  bark: () => lam("bark", () => ({ color: "#7d5638" })),
  leaf: (i: number) => lam("leaf" + i, () => ({ color: ["#5aa64a", "#4c9a44", "#69b452", "#3f8a42"][i % 4] })),
  palm: () => lam("palmleafgreen", () => ({ color: "#6fae4a", side: THREE.DoubleSide })),
  clay: () => lam("clay", () => ({ color: "#c8774a" })),
  clayLight: () => lam("clayLight", () => ({ color: "#e8b98a" })),
  rock: () => lam("rock", () => ({ color: "#8f8a96" })),
  boat: () => lam("boat", () => ({ color: "#8a5a36" })),
  boatTrim: () => lam("boatTrim", () => ({ color: "#2f7a8a" })),
  lacquer: () => twoTone(new THREE.MeshPhongMaterial({ color: "#c8262a", specular: "#ffd0b0", shininess: 70 }), 0.2),
  lacquerDark: () => twoTone(new THREE.MeshPhongMaterial({ color: "#7a1a20", specular: "#ffb090", shininess: 60 }), 0.2),
  cloth: (a: string, b: string) => lam("cloth" + a + b, () => ({ map: fabricTex(a, b), side: THREE.DoubleSide })),
  target: () => lam("target", () => ({ map: targetTex(), side: THREE.DoubleSide })),
  page: () => lam("page", () => ({ map: leafTex() })),
  mat: () => lam("reedmat", () => ({ color: "#d8b46a" })),
  seabed: () => lam("seabed", () => ({ map: rep(sandTex(), 1, 1), color: "#4a6f6c" })),
  coral: (i: number) => lam("coral" + i, () => ({ color: ["#e8708a", "#f2a24a", "#8a6ad8", "#4ab0a0"][i % 4] })),
  weed: () => lam("weed", () => ({ color: "#3f9a6a", side: THREE.DoubleSide })),
  charred: () => lam("charred", () => ({ color: "#3a2a2e" })),
};

const tr = (x: number, y: number, z: number, ry = 0, s: number | [number, number, number] = 1) => {
  const S = Array.isArray(s) ? s : [s, s, s];
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(S[0], S[1], S[2]));
};
const cyl = (r0: number, r1: number, h: number, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n).translate(0, h / 2, 0);
/** onion-ish dome: a sphere cap swelling past the hemisphere, with a finial */
const domeGeo = (r: number) => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 0.62; pts.push(new THREE.Vector2(r * Math.sin(a + 0.35) * (1 - 0.15 * (i / 14) ** 3), r * 0.95 * (1 - Math.cos(a)) )); }
  pts.push(new THREE.Vector2(0.02, r * 1.25));
  return new THREE.LatheGeometry(pts, 16);
};
/** shikhara: a curvilinear tower (8 sides) with an amalaka disc and a kalasha finial */
const shikhara = (b: Batch, x: number, y: number, z: number, r: number, h: number, mats: { stone: THREE.Material; dome: THREE.Material; gold: THREE.Material }) => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector2(Math.max(0.05, r * (1 - u ** 1.6) * (1 + 0.12 * Math.sin(u * Math.PI))), u * h)); }
  b.add(new THREE.LatheGeometry(pts, 8), mats.stone, tr(x, y, z, Math.PI / 8));
  for (let k = 1; k < 5; k++) { const u = k / 5, rr = r * (1 - u ** 1.6) * (1 + 0.12 * Math.sin(u * Math.PI)) + 0.06; b.add(new THREE.CylinderGeometry(rr, rr, 0.12, 8), mats.dome, tr(x, y + u * h, z, Math.PI / 8)); }
  const am = new THREE.SphereGeometry(r * 0.32, 12, 6); am.scale(1, 0.45, 1);
  b.add(am, mats.dome, tr(x, y + h + r * 0.08, z));
  b.add(cyl(r * 0.08, r * 0.04, r * 0.5, 8), mats.gold, tr(x, y + h + r * 0.18, z));
};
/** pavilion roof: a low four-sided curved pyramid with a finial */
const pavRoof = (r: number) => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(new THREE.Vector2(Math.max(0.02, r * 1.15 * (1 - u) ** 1.4), u * r * 0.85)); }
  return new THREE.LatheGeometry(pts, 4).rotateY(Math.PI / 4);
};
/** a chhatri: four slim pillars, a slab and a pavilion roof (kiosk on palace roofs) */
const chhatri = (b: Batch, x: number, y: number, z: number, s: number, mats: { stone: THREE.Material; dome: THREE.Material; gold: THREE.Material }) => {
  keepBox("chhatri", [x - 1.3 * s, y, z - 1.3 * s], [x + 1.3 * s, y + 2.6 * s, z + 1.3 * s]);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.add(cyl(0.12 * s, 0.12 * s, 1.6 * s, 6), mats.stone, tr(x + dx * 0.8 * s, y, z + dz * 0.8 * s));
  b.add(boxGeo(V(x - 1.15 * s, y + 1.6 * s, z - 1.15 * s), V(x + 1.15 * s, y + 1.85 * s, z + 1.15 * s)), mats.stone);
  b.add(pavRoof(1.15 * s), mats.dome, tr(x, y + 1.85 * s, z));
  b.add(cyl(0.05 * s, 0.02 * s, 0.6 * s, 6), mats.gold, tr(x, y + 1.85 * s + 0.95 * s, z));
};
/** row of arches: pillars + lintel + parapet along x from x0 to x1 at z, height h, facing +z or -z */
const arcade = (b: Batch, x0: number, x1: number, z: number, y: number, h: number, depth: number, n: number, stone: THREE.Material, trim: THREE.Material) => {
  const step = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) { b.add(boxGeo(V(x0 + i * step - 0.32, y, z - 0.32), V(x0 + i * step + 0.32, y + h, z + 0.32), 2), stone); keepCyl("arcade pillar", x0 + i * step, z, 0.38, y, y + h); }
  // scalloped arch heads as small boxes stepping in (reads as an arch with ink)
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * step, hw = step / 2 - 0.32;
    for (let k = 0; k < 4; k++) { const w = hw * (1 - Math.sin(((k + 0.5) / 4) * Math.PI / 2) ** 2 * 0.9); b.add(boxGeo(V(cx - hw, y + h - 1.0 + k * 0.25, z - 0.25), V(cx - w, y + h - 0.75 + k * 0.25, z + 0.25)), stone); b.add(boxGeo(V(cx + w, y + h - 1.0 + k * 0.25, z - 0.25), V(cx + hw, y + h - 0.75 + k * 0.25, z + 0.25)), stone); }
  }
  b.add(boxGeo(V(x0 - 0.5, y + h, z - 0.45), V(x1 + 0.5, y + h + 0.7, z + depth + 0.4), 2), stone); // roof slab over the walk
  b.add(boxGeo(V(x0 - 0.55, y + h + 0.7, z - 0.55), V(x1 + 0.55, y + h + 0.9, z - 0.25), 2), trim); // cornice
  b.add(boxGeo(V(x0 - 0.5, y, z + depth), V(x1 + 0.5, y + h + 0.7, z + depth + 0.5), 2), stone); // back wall
  keepBox("arcade back wall", [x0 - 0.5, y, z + depth], [x1 + 0.5, y + h + 0.7, z + depth + 0.5]);
};
/** a round-canopy tree (mango / banyan): trunk + clustered leaf balls; banyan adds aerial roots */
export const tree = (b: Batch, x: number, z: number, h: number, seed: number, kind: "mango" | "banyan" | "forest" = "forest", y = G) => {
  const r = rng(seed), bark = M.bark();
  const tw = kind === "banyan" ? 0.9 : 0.24 + h * 0.016;
  b.add(cyl(tw * 0.75, tw, h * 0.55, 8), bark, tr(x, y, z, r() * 3));
  keepCyl(kind + " trunk", x, z, Math.max(0.45, tw * 1.4), y, y + h * 0.6);
  const n = kind === "banyan" ? 9 : 5, R = kind === "banyan" ? h * 0.55 : h * 0.32;
  keepBox(kind + " canopy", [x - R, y + h * 0.4, z - R], [x + R, y + h * 1.02, z + R]);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), d = i === 0 ? 0 : R * (0.45 + 0.35 * r()), s = R * (0.55 + 0.3 * r());
    const g = new THREE.IcosahedronGeometry(1, 1); g.scale(s, s * 0.78, s);
    b.add(g, M.leaf(i + seed), tr(x + Math.cos(a) * d, y + h * 0.62 + (i === 0 ? R * 0.35 : r() * R * 0.4), z + Math.sin(a) * d));
  }
  if (kind === "banyan") for (let i = 0; i < 7; i++) { const a = r() * 7, d = R * (0.5 + 0.4 * r()); b.add(cyl(0.07, 0.09, h * 0.55, 5), bark, tr(x + Math.cos(a) * d, y, z + Math.sin(a) * d)); }
  if (kind === "mango") for (let i = 0; i < 10; i++) { const a = r() * 7, d = R * (0.4 + 0.6 * r()); const g = new THREE.SphereGeometry(0.16, 8, 6); g.scale(0.85, 1.1, 0.85); b.add(g, lam("mangoFruit", () => ({ color: "#f2b632" })), tr(x + Math.cos(a) * d, y + h * 0.42 + r() * h * 0.2, z + Math.sin(a) * d)); }
};
const palmTree = (b: Batch, x: number, z: number, h: number, seed: number, y = G) => {
  const r = rng(seed), lean = (r() - 0.5) * 0.3;
  keepCyl("palm trunk", x, z, 0.3, y, y + h);
  const segs = 6;
  for (let i = 0; i < segs; i++) b.add(cyl(0.2, 0.24, h / segs + 0.05, 7), M.bark(), tr(x + lean * h * (i / segs) ** 2, y + (i * h) / segs, z));
  const tx = x + lean * h, ty = y + h;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r(), g = new THREE.PlaneGeometry(0.9, 3.4, 1, 3);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { const v = p.getY(k) + 1.7; p.setZ(k, -0.25 * v * v); }
    g.translate(0, 1.7, 0); g.rotateX(-1.1); g.computeVertexNormals();
    b.add(g, M.palm(), new THREE.Matrix4().compose(V(tx, ty, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), V(1, 1, 1)));
  }
};
/** mud hut with a thatched hip roof, doorway facing +z (rotated by yaw) */
const hut = (b: Batch, x: number, z: number, yaw: number, w: number, d: number, seed: number) => {
  const rr = (Math.max(w, d) + Math.min(w, d)) * 0.42;
  keepBox("mud hut", [x - rr, G, z - rr], [x + rr, G + 4.2, z + rr]);
  const m = new THREE.Matrix4().compose(V(x, G, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V(1, 1, 1));
  const add = (g: THREE.BufferGeometry, mat: THREE.Material) => b.add(g, mat, m);
  add(boxGeo(V(-w / 2, 0, -d / 2), V(-0.45, 2.3, d / 2), 2), M.mud());
  add(boxGeo(V(0.45, 0, -d / 2), V(w / 2, 2.3, d / 2), 2), M.mud());
  add(boxGeo(V(-0.45, 1.85, -d / 2), V(0.45, 2.3, d / 2), 2), M.mud());
  add(boxGeo(V(-0.45, 0, -d / 2), V(0.45, 1.85, d / 2 - 0.25), 2), M.darkwood()); // dark doorway recess
  const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.82, 1.9, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(w / Math.max(w, d), 1, d / Math.max(w, d));
  add(roof.translate(0, 2.3 + 0.95, 0), M.thatch());
};
const boatGeo = (len: number) => {
  const g = new THREE.CylinderGeometry(0.7, 0.7, len, 12, 1, true, Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2); g.scale(1, 0.6, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const xx = p.getX(i) / (len / 2); p.setZ(i, p.getZ(i) * (1 - xx * xx * 0.85)); p.setY(i, p.getY(i) + 0.25 * xx * xx); }
  g.computeVertexNormals();
  return g;
};

export type Sets = Record<string, THREE.Group> & { dyn: Dyn };
/** selectable set groups (terrain is always on and is not a storyboard set) */
export const SET_NAMES = ["palace", "village", "hermitage", "deer", "lac", "arena", "city", "naga"] as const;
/** treetops around the new city (x, crown y, z): where the Khandava fire burns */
export const CITY_TREES: [number, number, number][] = [];
/** pieces that move per shot (world.ts poses them) */
export type Dyn = {
  jars: THREE.InstancedMesh; lids: THREE.InstancedMesh; wheel: THREE.Group; city: THREE.Group; lacFire: THREE.Group; pages: THREE.Mesh;
  bigBow: THREE.Group; boat: THREE.Group; desk: THREE.Group; tunnel: THREE.Mesh; nectar: THREE.InstancedMesh; ladduPlate: THREE.Mesh;
};

export const buildSets = (root: THREE.Object3D): Sets => {
  resetKeepout();
  const S: Record<string, THREE.Group> = {};
  const group = (n: string) => { const g = new THREE.Group(); g.name = n; root.add(g); S[n] = g; return g; };
  const stoneM = { stone: M.red(), dome: M.dome(), gold: M.goldm() };

  // ---------------- terrain + river (always on) ----------------
  {
    const b = new Batch();
    const plane = (x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, tile: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile);
      b.add(g, mat);
    };
    plane(-700, 700, RIVER_Z + 4, 700, G, M.grass(), 12);
    plane(-700, 700, -700, -RIVER_Z - 4, G, M.grass(), 12);
    // sloping sandy banks into the water
    for (const s of [-1, 1]) {
      const z0 = s * RIVER_Z, z1 = s * (RIVER_Z + 4);
      const g = new THREE.PlaneGeometry(1400, 1); const p = g.attributes.position as THREE.BufferAttribute;
      p.setXYZ(0, -700, -0.8, z0); p.setXYZ(1, 700, -0.8, z0); p.setXYZ(2, -700, G, z1); p.setXYZ(3, 700, G, z1);
      if (s < 0) { p.setXYZ(0, -700, G, z1); p.setXYZ(1, 700, G, z1); p.setXYZ(2, -700, -0.8, z0); p.setXYZ(3, 700, -0.8, z0); }
      g.computeVertexNormals();
      const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i));
      b.add(g, M.sand());
    }
    plane(-700, 700, -RIVER_Z, RIVER_Z, -0.8, M.sand(), 8);
    b.build(group("terrain"));
  }

  // ---------------- Hastinapura palace (north bank) ----------------
  beginSet("palace");
  {
    const b = new Batch(), [px, , pz] = PAL;
    const red = M.red(), cream = M.cream();
    // courtyard floor
    b.add(boxGeo(V(px - 32, G - 0.4, pz - 18), V(px + 32, G + 0.12, pz + 22), 3), M.cream());
    // ghat steps down to the river
    for (let i = 0; i < 9; i++) b.add(boxGeo(V(px - 14, G - 0.25 * (i + 1) + 0.12, pz - 18 - (i + 1) * 0.6), V(px + 14, G - 0.25 * i + 0.12, pz - 18 - i * 0.6), 2), cream);
    // arcades on three sides
    arcade(b, px - 30, px + 30, pz + 19, G + 0.12, 4.6, 4, 10, red, cream);
    b.add(boxGeo(V(px - 31, G + 0.12, pz - 14), V(px - 30.4, G + 5.3, pz + 22)), red);
    b.add(boxGeo(V(px + 30.4, G + 0.12, pz - 14), V(px + 31, G + 5.3, pz + 22)), red);
    for (const sx of [-1, 1]) {
      // side arcades as pillars along z
      for (let i = 0; i <= 7; i++) b.add(boxGeo(V(px + sx * 26 - 0.32, G + 0.12, pz - 14 + i * 5 - 0.32), V(px + sx * 26 + 0.32, G + 4.72, pz - 14 + i * 5 + 0.32), 2), red);
      b.add(boxGeo(V(px + sx * (sx < 0 ? 30.5 : 25.5) - (sx < 0 ? 0 : 0), G + 4.72, pz - 14.5), V(px + sx * (sx < 0 ? 25.5 : 30.5), G + 5.4, pz + 22)), red);
      b.add(boxGeo(V(px + sx * 25.4 - 0.15, G + 5.4, pz - 14.6), V(px + sx * 25.4 + 0.15, G + 5.6, pz + 22)), cream);
      chhatri(b, px + sx * 28, G + 5.4, pz - 12, 1.1, stoneM);
      chhatri(b, px + sx * 28, G + 5.4, pz + 20, 1.1, stoneM);
    }
    // main palace block behind with jharokhas and a central dome
    b.add(boxGeo(V(px - 22, G, pz + 26), V(px + 22, G + 12, pz + 40), 3), red);
    keepBox("palace main block", [px - 22, G, pz + 26], [px + 22, G + 12, pz + 40]);
    b.add(boxGeo(V(px - 22.4, G + 12, pz + 25.6), V(px + 22.4, G + 12.5, pz + 40.4)), cream);
    for (let i = 0; i < 7; i++) for (const y of [4.5, 8.5]) {
      const x = px - 18 + i * 6;
      b.add(boxGeo(V(x - 1.0, G + y, pz + 25.2), V(x + 1.0, G + y + 0.25, pz + 26)), cream); // balcony slab
      b.add(boxGeo(V(x - 0.7, G + y + 0.25, pz + 25.95), V(x + 0.7, G + y + 2.0, pz + 26.05)), M.darkwood()); // window
      b.add(boxGeo(V(x - 1.15, G + y + 2.05, pz + 25.0), V(x + 1.15, G + y + 2.2, pz + 26.1)), cream); // chajja
    }
    b.add(boxGeo(V(px - 6, G + 12.5, pz + 27), V(px + 6, G + 14.5, pz + 39)), cream);
    shikhara(b, px, G + 14.5, pz + 33, 5.2, 11, stoneM);
    for (const sx of [-1, 1]) chhatri(b, px + sx * 17, G + 12.5, pz + 29, 1.6, stoneM);
    // gate towers at the courtyard's river side
    for (const sx of [-1, 1]) { b.add(boxGeo(V(px + sx * 15 - 1.4, G, pz - 19.5), V(px + sx * 15 + 1.4, G + 7, pz - 16.5), 2), red); keepBox("gate tower", [px + sx * 15 - 1.4, G, pz - 19.5], [px + sx * 15 + 1.4, G + 7, pz - 16.5]); chhatri(b, px + sx * 15, G + 7, pz - 18, 1.1, stoneM); }
    // mango trees + planters in the courtyard
    tree(b, px - 14, pz + 4, 7.5, 11, "mango", G + 0.12);
    tree(b, px + 15, pz + 8, 7, 12, "mango", G + 0.12);
    for (const [x, z] of [[-14, 4], [15, 8]]) b.add(cyl(2.2, 2.4, 0.5, 14), cream, tr(px + x, G + 0.12, pz + z));
    // a pool with a fountain step
    b.add(boxGeo(V(px - 4, G + 0.12, pz - 6), V(px + 4, G + 0.4, pz - 2)), cream);
    b.build(group("palace"));
  }

  // ---------------- fisher village (south bank) ----------------
  beginSet("village");
  {
    const b = new Batch(), [vx, , vz] = VIL;
    hut(b, vx - 9, vz - 6, 0.3, 4.2, 3.6, 1);
    hut(b, vx + 1, vz - 9, 0, 4.6, 4, 2); // Kunti's hut later (doorway faces the river)
    hut(b, vx + 11, vz - 5, -0.35, 4, 3.4, 3);
    hut(b, vx - 19, vz - 12, 0.6, 3.8, 3.4, 4);
    hut(b, vx + 20, vz - 13, -0.5, 4.2, 3.6, 5);
    for (const [x, z, h, s] of [[-14, -2, 9, 1], [6, -1, 10, 2], [16, 1, 8.5, 3], [-4, -16, 11, 4], [24, -6, 9, 5], [-24, -4, 10, 6]]) palmTree(b, vx + x, vz + z, h, s);
    // boats pulled up on the sand
    for (const [x, z, yaw] of [[-7, 14, 0.2], [9, 14.4, -0.1]]) { b.add(boatGeo(5), M.boat(), tr(vx + x, 0.35, vz + z, yaw)); b.add(boxGeo(V(-2.4, 0.18, -0.08), V(2.4, 0.34, 0.08)), M.boatTrim(), tr(vx + x, 0.35, vz + z, yaw)); keepBox("beached boat", [vx + x - 2.8, 0.3, vz + z - 0.8], [vx + x + 2.8, 1.1, vz + z + 0.8]); }
    // net drying poles
    for (const x of [-12, -9]) b.add(cyl(0.06, 0.06, 2.2, 5), M.wood(), tr(vx + x, G, vz + 3));
    b.add(boxGeo(V(vx - 12, G + 1.0, vz + 2.98), V(vx - 9, G + 2.1, vz + 3.02)), lam("net", () => ({ color: "#b8a888", side: THREE.DoubleSide })));
    for (let i = 0; i < 18; i++) { const r = rng(40 + i); tree(b, vx - 40 + r() * 80, vz - 26 - r() * 30, 7 + r() * 5, 60 + i); }
    b.build(group("village"));
  }

  // ---------------- forest hermitage (golden hour home of Vyasa and Ganesha) ----------------
  beginSet("hermitage");
  {
    const b = new Batch(), [hx, , hz] = HERM;
    tree(b, hx - 5, hz + 6, 12, 7, "banyan");
    // open hut: four posts, thatched roof, raised earthen floor
    b.add(boxGeo(V(hx - 3.2, G, hz - 2.6), V(hx + 3.2, G + 0.3, hz + 2.6), 2), M.mud());
    for (const [dx, dz] of [[-2.9, -2.3], [2.9, -2.3], [2.9, 2.3], [-2.9, 2.3]]) b.add(cyl(0.13, 0.15, 2.9, 7), M.wood(), tr(hx + dx, G + 0.3, hz + dz));
    const roof = new THREE.ConeGeometry(5.0, 2.2, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 0.82);
    b.add(roof, M.thatch(), tr(hx, G + 3.2 + 1.1, hz));
    b.add(boxGeo(V(hx - 2.0, G + 0.3, hz - 1.6), V(hx + 2.0, G + 0.33, hz + 1.2)), M.mat());
    // a water pot and lamp stand
    b.add(new THREE.SphereGeometry(0.32, 12, 9), M.clay(), tr(hx + 2.3, G + 0.6, hz + 0.6));
    b.add(cyl(0.05, 0.12, 1.1, 8), M.goldm(), tr(hx - 2.4, G + 0.3, hz + 1.6));
    for (let i = 0; i < 46; i++) { const r = rng(300 + i), a = r() * Math.PI * 2, d = 16 + r() * 50; tree(b, hx + Math.cos(a) * d, hz + Math.sin(a) * d * 0.8 + 10, 8 + r() * 7, 200 + i); }
    b.build(group("hermitage"));
  }
  // the writing desk with a growing stack of palm-leaf pages (dynamic)
  const desk = new THREE.Group();
  {
    const [hx, , hz] = HERM;
    const top = new THREE.Mesh(boxGeo(V(-0.45, 0.22, -0.3), V(0.45, 0.28, 0.3)), M.wood()), legs = new THREE.Mesh(mergeGeometries([[-0.38, -0.24], [0.38, -0.24], [0.38, 0.24], [-0.38, 0.24]].map(([x, z]) => boxGeo(V(x - 0.04, 0, z - 0.04), V(x + 0.04, 0.22, z + 0.04)))), M.darkwood());
    desk.add(top, legs); desk.position.set(hx + 2.0, G + 0.3, hz - 0.4);
    keepBox("writing desk", [hx + 1.5, G + 0.3, hz - 0.75], [hx + 2.5, G + 0.65, hz - 0.05]);
    desk.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    S.hermitage.add(desk);
  }
  const pages = new THREE.Mesh(boxGeo(V(-0.36, 0, -0.1), V(0.36, 1, 0.1)), M.page());
  pages.castShadow = true; pages.receiveShadow = true; desk.add(pages); pages.position.set(0, 0.28, 0);

  // ---------------- Pandu's clearing (forest east) ----------------
  beginSet("deer");
  {
    const b = new Batch(), [dx, , dz] = DEER;
    for (let i = 0; i < 60; i++) { const r = rng(500 + i), a = r() * Math.PI * 2, d = 13 + r() * 45; tree(b, dx + Math.cos(a) * d, dz + Math.sin(a) * d, 8 + r() * 8, 600 + i); }
    b.build(group("deer"));
  }

  // ---------------- the lacquer house (night) ----------------
  beginSet("lac");
  {
    const b = new Batch(), [lx, , lz] = LAC;
    const lq = M.lacquer(), lqd = M.lacquerDark(), gold = M.goldm();
    b.add(boxGeo(V(lx - 5, G, lz - 4), V(lx + 5, G + 3.4, lz + 4)), lq);
    keepBox("lacquer house", [lx - 5, G, lz - 4], [lx + 5, G + 8.9, lz + 4]);
    b.add(boxGeo(V(lx - 5.4, G + 3.4, lz - 4.4), V(lx + 5.4, G + 3.7, lz + 4.4)), gold);
    b.add(boxGeo(V(lx - 4, G + 3.7, lz - 3), V(lx + 4, G + 6.4, lz + 3)), lq);
    const roof = new THREE.ConeGeometry(6.4, 2.6, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.15, 1, 0.85);
    b.add(roof.translate(0, 1.3, 0), lqd, tr(lx, G + 6.4, lz));
    b.add(boxGeo(V(lx - 5.6, G + 0, lz - 4.6), V(lx + 5.6, G + 0.25, lz + 4.6)), gold);
    for (const x of [-3.4, -1.1, 1.1, 3.4]) b.add(boxGeo(V(lx + x - 0.55, G + 1.1, lz - 4.05), V(lx + x + 0.55, G + 2.5, lz - 3.98)), M.darkwood());
    b.add(boxGeo(V(lx - 0.8, G, lz - 4.06), V(lx + 0.8, G + 2.4, lz - 3.98)), lam("lacDoor", () => ({ color: "#2a0e12" })));
    for (const x of [-5, 5]) for (const z of [-4, 4]) b.add(cyl(0.22, 0.22, 3.4, 8), gold, tr(lx + x, G, lz + z));
    // houses of the town behind
    for (const [x, z, w, h] of [[-16, 10, 6, 5], [14, 12, 7, 6], [-24, -2, 5, 4], [22, -4, 6, 5]]) { b.add(boxGeo(V(lx + x - w / 2, G, lz + z - 3), V(lx + x + w / 2, G + h, lz + z + 3)), M.mud()); keepBox("town house", [lx + x - w / 2, G, lz + z - 3], [lx + x + w / 2, G + h, lz + z + 3]); const r = new THREE.ConeGeometry(w * 0.85, 2.2, 4, 1); r.rotateY(Math.PI / 4); b.add(r.translate(0, 1.1, 0), M.thatch(), tr(lx + x, G + h, lz + z)); }
    for (let i = 0; i < 20; i++) { const r = rng(1200 + i); tree(b, lx - 50 + r() * 100, lz + 18 + r() * 30, 8 + r() * 6, 1300 + i); }
    b.build(group("lac"));
  }
  const tunnel = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20).rotateX(-Math.PI / 2), lam("hole", () => ({ color: "#140c10" })));
  tunnel.position.set(LAC[0] + 3, G + 0.03, LAC[2] - 13); tunnel.receiveShadow = true; S.lac.add(tunnel);
  { const rim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.22, 6, 24).rotateX(-Math.PI / 2).scale(1, 0.6, 1), lam("dirt", () => ({ color: "#7a5636" }))); rim.position.set(LAC[0] + 3, G + 0.05, LAC[2] - 13); rim.castShadow = rim.receiveShadow = true; S.lac.add(rim);
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), lam("dirt", () => ({ color: "#7a5636" }))); c.position.set(LAC[0] + 4.4 + i * 0.25, G + 0.1, LAC[2] - 13.6 + i * 0.3); c.castShadow = true; S.lac.add(c); } }
  const lacFire = new THREE.Group(); S.lac.add(lacFire);

  // ---------------- the contest arena (Panchala) ----------------
  beginSet("arena");
  const wheel = new THREE.Group(), bigBow = new THREE.Group();
  {
    const b = new Batch(), [ax, , az] = ARENA;
    const marble = M.marble(), red = M.red(), gold = M.goldm();
    b.add(boxGeo(V(ax - 26, G - 0.3, az - 18), V(ax + 26, G + 0.15, az + 22), 3), marble);
    // pavilion: pillars around three sides, striped canopy
    for (let i = 0; i <= 10; i++) for (const z of [az + 14]) if (i !== 5) { b.add(cyl(0.3, 0.34, 6, 10), red, tr(ax - 22 + i * 4.4, G + 0.15, z)); keepCyl("pavilion pillar", ax - 22 + i * 4.4, z, 0.38, G + 0.15, G + 6.15); } // no pillar right behind the dais
    for (let i = 0; i <= 6; i++) for (const x of [ax - 22, ax + 22]) { b.add(cyl(0.3, 0.34, 6, 10), red, tr(x, G + 0.15, az - 12 + i * 4.4)); keepCyl("pavilion pillar", x, az - 12 + i * 4.4, 0.38, G + 0.15, G + 6.15); }
    const canopy = (x0: number, x1: number, z0: number, z1: number) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 2); g.rotateX(-Math.PI / 2); const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setY(i, -0.4 * Math.sin(((p.getX(i) - (x0 - x1) / 2) / (x1 - x0)) * Math.PI * 4) ** 2); g.translate((x0 + x1) / 2, G + 6.3, (z0 + z1) / 2); g.computeVertexNormals(); b.add(g, M.cloth("#d8343c", "#f2c230")); };
    canopy(ax - 23, ax + 23, az + 10, az + 18);
    canopy(ax - 26, ax - 18, az - 13, az + 10); canopy(ax + 18, ax + 26, az - 13, az + 10);
    // stepped seats for the kings under the side canopies
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) b.add(boxGeo(V(ax + sx * 21 - 2.2 + k * sx * 1.2, G + 0.15, az - 11), V(ax + sx * 21 + 2.2 - (1 - k) * 0, G + 0.6 + k * 0.45, az + 9)), marble);
    // Draupadi's dais at the back
    b.add(boxGeo(V(ax - 4, G + 0.15, az + 9), V(ax + 4, G + 1.0, az + 13)), marble);
    keepBox("draupadi dais", [ax - 4.2, G + 0.15, az + 8.8], [ax + 4.2, G + 1.15, az + 13.2]);
    b.add(boxGeo(V(ax - 4.2, G + 1.0, az + 8.8), V(ax + 4.2, G + 1.15, az + 13.2)), gold);
    // the target pole (centre), with a platform
    b.add(cyl(1.6, 1.8, 0.6, 16), marble, tr(ax, G + 0.15, az));
    b.add(cyl(0.16, 0.2, 15, 10), gold, tr(ax, G + 0.75, az));
    keepCyl("target pole", ax, az, 0.3, G + 0.15, G + 15.75);
    // garden + palace walls behind
    b.add(boxGeo(V(ax - 40, G, az + 26), V(ax + 40, G + 10, az + 34), 3), M.marble());
    keepBox("palace wall", [ax - 40, G, az + 26], [ax + 40, G + 10, az + 34]);
    for (const x of [-30, -15, 0, 15, 30]) chhatri(b, ax + x, G + 10, az + 30, 1.4, { stone: marble, dome: M.dome(), gold });
    for (let i = 0; i < 16; i++) { const r = rng(1500 + i); palmTree(b, ax - 45 + r() * 90, az - 30 - r() * 20, 8 + r() * 4, 1600 + i); }
    b.build(group("arena"));
    // spinning wheel with the target at the top of the pole
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 28), gold);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(boxGeo(V(-0.05, -1.4, -0.05), V(0.05, 1.4, 0.05)), gold); sp.rotation.z = (i / 6) * Math.PI; ring.add(sp); }
    const tgt = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), M.target()); tgt.position.set(0, 0, 0.05);
    const tgtB = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), M.target()); tgtB.rotation.y = Math.PI; tgtB.position.z = -0.05;
    wheel.add(ring); wheel.add(tgt, tgtB);
    wheel.position.set(ax, G + 15.9, az);
    wheel.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    S.arena.add(wheel);
    // the giant bow on its stand
    const stand = new THREE.Mesh(boxGeo(V(-1.6, 0, -0.5), V(1.6, 0.9, 0.5)), M.darkwood());
    const curveP = new THREE.QuadraticBezierCurve3(V(-2.6, 1.4, 0), V(0, 0.6, 0), V(2.6, 1.4, 0));
    const bowM = new THREE.Mesh(new THREE.TubeGeometry(curveP, 24, 0.09, 6), lam("bowwood", () => ({ color: "#7a3f22" })));
    bigBow.add(stand, bowM); bigBow.position.set(ax - 6, G + 0.15, az - 4); bigBow.rotation.y = 0.3;
    keepBox("bow stand", [ax - 7.8, G + 0.15, az - 4.6], [ax - 4.2, G + 1.6, az - 3.4]);
    bigBow.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    S.arena.add(bigBow);
  }

  // ---------------- the new city's clearing + Khandava forest ----------------
  beginSet("city");
  const city = new THREE.Group();
  {
    const b = new Batch(), [cx, , cz] = CITY;
    for (let i = 0; i < 70; i++) { const r = rng(1800 + i), a = r() * Math.PI * 2, d = 26 + r() * 60, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, h = 9 + r() * 8; tree(b, x, z, h, 1900 + i); CITY_TREES.push([x, G + h * 0.85, z]); }
    for (let i = 0; i < 12; i++) { const r = rng(2100 + i); b.add(cyl(0.35, 0.4, 0.5, 8), M.bark(), tr(cx - 14 + r() * 28, G, cz - 12 + r() * 24)); keepCyl("stump", cx - 14 + r() * 28, cz - 12 + r() * 24, 0.4, G, G + 0.5); } // stumps
    b.build(group("city"));
    // the rising city: a white palace + walls (scaled up from the ground per shot)
    const cb = new Batch(), marble = M.marble(), gold = M.goldm();
    cb.add(boxGeo(V(-12, 0, -6), V(12, 9, 6), 3), marble);
    cb.add(boxGeo(V(-12.3, 9, -6.3), V(12.3, 9.5, 6.3)), M.cream());
    cb.add(boxGeo(V(-4.5, 9.5, -4.5), V(4.5, 11, 4.5)), marble); shikhara(cb, 0, 11, 0, 4.2, 9, { stone: marble, dome: M.dome(), gold });
    for (const sx of [-1, 1]) { chhatri(cb, sx * 9.5, 9.5, -3.5, 1.3, { stone: marble, dome: M.dome(), gold }); chhatri(cb, sx * 9.5, 9.5, 3.5, 1.3, { stone: marble, dome: M.dome(), gold }); }
    for (let i = 0; i < 6; i++) { const x = -10 + i * 4; cb.add(boxGeo(V(x - 0.7, 3, -6.05), V(x + 0.7, 5.5, -5.95)), M.darkwood()); }
    for (const sx of [-1, 1]) { cb.add(boxGeo(V(sx * 20 - 3, 0, -4), V(sx * 20 + 3, 6, 4), 3), marble); chhatri(cb, sx * 20, 6, 0, 1.3, { stone: marble, dome: M.dome(), gold }); }
    cb.build(city);
    city.position.set(cx, G, cz + 6);
    keepBox("rising city", [cx - 23, G, cz + 2], [cx + 23, G + 20, cz + 10]);
    S.city.add(city);
  }

  // ---------------- the snake kingdom (under the river) ----------------
  beginSet("naga");
  const nectar = new THREE.InstancedMesh(new THREE.LatheGeometry([0, 0.28, 0.42, 0.46, 0.4, 0.26, 0.22, 0.26].map((r, i) => new THREE.Vector2(Math.max(0.001, r), i * 0.12)), 16), lam("nectarJar", () => ({ color: "#d8945a" })), 8);
  {
    const b = new Batch(), [nx, ny, nz] = NAGA;
    const g = new THREE.PlaneGeometry(200, 200, 30, 30); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setY(i, 0.6 * Math.sin(p.getX(i) * 0.15) * Math.cos(p.getZ(i) * 0.12));
    g.computeVertexNormals(); g.translate(nx, ny, nz);
    const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 25, uv.getY(i) * 25);
    b.add(g, M.seabed());
    for (let i = 0; i < 40; i++) { const r = rng(2500 + i), a = r() * 7, d = 6 + r() * 40; const rg = new THREE.IcosahedronGeometry(1, 0); rg.scale(1 + r() * 2.5, 0.8 + r() * 3, 1 + r() * 2.5); b.add(rg, M.rock(), tr(nx + Math.cos(a) * d, ny, nz + Math.sin(a) * d, r() * 3)); keepCyl("naga rock", nx + Math.cos(a) * d, nz + Math.sin(a) * d, 2 + r() * 2, ny, ny + 2 + r() * 3); }
    for (let i = 0; i < 30; i++) { const r = rng(2700 + i), a = r() * 7, d = 4 + r() * 25; const c = new THREE.IcosahedronGeometry(0.5 + r() * 0.6, 1); c.scale(1, 1.4, 1); b.add(c, M.coral(i), tr(nx + Math.cos(a) * d, ny + 0.3, nz + Math.sin(a) * d)); }
    for (let i = 0; i < 26; i++) { const r = rng(2900 + i), a = r() * 7, d = 5 + r() * 25, w = new THREE.PlaneGeometry(0.4, 3 + r() * 3, 1, 4); const pp = w.attributes.position as THREE.BufferAttribute; for (let k = 0; k < pp.count; k++) pp.setX(k, pp.getX(k) + 0.3 * Math.sin(pp.getY(k) * 1.5)); w.translate(0, 1.5 + r() * 1.5, 0); b.add(w, M.weed(), tr(nx + Math.cos(a) * d, ny, nz + Math.sin(a) * d, r() * 3)); }
    // the naga palace: a ring of pale pillars around a round floor
    b.add(cyl(7, 7.2, 0.4, 24), lam("tealstone", () => ({ color: "#2c5e5c" })), tr(nx, ny, nz + 4));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; if (Math.sin(a) < -0.5) continue; b.add(cyl(0.35, 0.4, 5, 10), M.marble(), tr(nx + Math.cos(a) * 6.5, ny + 0.4, nz + 4 + Math.sin(a) * 6.5)); keepCyl("naga pillar", nx + Math.cos(a) * 6.5, nz + 4 + Math.sin(a) * 6.5, 0.45, ny, ny + 5.4); }
    b.build(group("naga"));
    nectar.castShadow = true; nectar.receiveShadow = true;
    S.naga.add(nectar);
  }

  // ---------------- 101 jars of ghee in the palace arcade ----------------
  const jarG = new THREE.LatheGeometry([0, 0.28, 0.42, 0.46, 0.4, 0.26, 0.22, 0.26].map((r, i) => new THREE.Vector2(Math.max(0.001, r), i * 0.12)), 16);
  const jars = new THREE.InstancedMesh(jarG, M.clay(), 101);
  const lids = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14), M.clayLight(), 101);
  for (const m of [jars, lids]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; S.palace.add(m); }
  // the plate of sweets (laddus) by the river
  const ladduPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.05, 16), M.goldm());
  ladduPlate.castShadow = true; S.palace.add(ladduPlate); ladduPlate.visible = false;
  // Satyavati's boat (dynamic, on the river)
  const boat = new THREE.Group();
  { const hull = new THREE.Mesh(boatGeo(5.5), M.boat()), trim = new THREE.Mesh(boxGeo(V(-2.6, 0.18, -0.08), V(2.6, 0.34, 0.08)), M.boatTrim()); boat.add(hull, trim); boat.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }); root.add(boat); }

  return Object.assign(S, { dyn: { jars, lids, wheel, city, lacFire, pages, bigBow, boat, desk, tunnel, nectar, ladduPlate } }) as Sets;
};
