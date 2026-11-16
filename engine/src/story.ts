// Timeline of the Adi Parva short: every cut and reaction is anchored to a word of the narration (words.json from
// Kokoro), so re-voicing only shifts the anchors. Camera grammar from the bridge short (motion.md): symmetric
// smootherstep glides of 18-40 f, big reframes are cuts, every hold creeps in (0.15-0.35 %/f, ~0.6 %/f on punch
// words), 4-5 degree rolls on emphasis, impact kicks that flip sign every frame and decay over 7 f.
import * as THREE from "three";
import WORDS from "./words.json";
import { G, PAL, VIL, HERM, DEER, LAC, ARENA, CITY, NAGA, WATER_Y, V3 } from "./places";
import { Cam, ShotDef } from "./world";
import { LightName } from "./lights";
import { Stage, CamInfo, who, card, fx, petals, hh, lidAt, FPS } from "./cast";
import { CITY_TREES } from "./sets";
import { C, KIDS, KAURAVA } from "./castlist";
import { makeAnchors, Wd } from "./core/anchors";
import { clamp01, glide, pop, talk, writeT } from "./core/timing";
import { dolly, run, kickAt as kickAtWith, kickCam as kickCamWith, Key, Kick } from "./core/camera";
import { gnCard } from "./core/specials";
import { assembleShots, crossfades, layersAt as layersAtShots, dofAt as dofAtList, Def, Dof, shotAt } from "./core/shotlist";
import {
  fxHalo, Spec, Opts, Pose, ganesha, agni, deer, naga, baby, person, fxWheel, fxWind, fxBolt, fxHorse, fxLump, fxBubble, fxSparkle, fxKnot, fxHeart,
  fxFire, fxSmoke, fxPigeon, fxArrow, fxMango, jarShape,
} from "./people";
import { Pen, Expr, fxStars, fxBurst, fxSplash, fxPuff, fxRing } from "./toon";

// ---------------- words ----------------
const WS = WORDS as Wd[];
const { A, K, END, TOTAL, T } = makeAnchors(WS);
export { A, TOTAL };

// ---------------- helpers ----------------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const at = (base: V3, dx: number, dy: number, dz: number): V3 => [base[0] + dx, base[1] + dy, base[2] + dz];

// ---------------- places of the characters ----------------
const HFLOOR = G + 0.33;
const VY: V3 = at(HERM, -1.15, 0.33, -0.25), GN: V3 = at(HERM, 0.75, 0.33, 0.15);
const GHAT: V3 = [0, G + 0.12, 24.6];
const VFRONT: V3 = at(VIL, 0, 0, 9.5);   // open sand in front of the village (z -24.5)
const KHUT: V3 = at(VIL, 1, 0, -6.4);    // in front of Kunti's hut door
const CY: V3 = at(PAL, 0, 0.12, 0);      // courtyard centre floor
const JAR0: V3 = at(PAL, -7.2, 0.12, 9); // first jar of the grid (13 x 8, 1.2 m)
const jarPos = (i: number): V3 => at(JAR0, (i % 13) * 1.2 + ((Math.floor(i / 13) % 2) * 0.3), 0, Math.floor(i / 13) * 1.25);
const TREE: V3 = at(PAL, -14, 0.12, 4);
const NG: V3 = at(NAGA, 0, 0.4, 4);

// ---------------- the brothers in disguise and as young men ----------------
const PRIEST = (s: Spec): Spec => ({ ...s, head: "topknot", drape: "#f2deb0", necklace: null, border: undefined, lower: "#f6efdc" });
const BROS = [C.yudhi, C.bhima, C.arjuna, C.nakula, C.sahadeva];
const KBROS = [KIDS.yudhi, KIDS.bhima, KIDS.arjuna, KIDS.nakula, KIDS.sahadeva];

// ---------------- shots ----------------
type LocalDef = Omit<ShotDef, "id" | "a" | "b"> & { from: number; dof?: Dof[] };
const defs: LocalDef[] = [];
const shot = (from: number, light: LightName, sets: string[], cam: Key[], stage: ShotDef["stage"], extra: Partial<LocalDef> = {}) =>
  defs.push({ from, light, sets, cam: run(cam), stage, ...(sets.includes("hermitage") ? { sunAz: 115, sunEl: 18 } : {}), ...extra });
const gn = (out: Stage, cam: CamInfo, o: Parameters<typeof ganesha>[1], t: number, pos: V3 = GN, sc = 0.85) =>
  gnCard(out, cam, o, t, pos, sc);

// ===== 0: hook — Ganesha writing at speed =====
const L1 = K(1, "Vyasa");
shot(0, "golden", ["hermitage"], [
  { f: 0, s: dolly(at(GN, 0.2, 0.85, -2.6), at(GN, 0, 0.75, 0), 0, 0.003, { fov: 38 }) },
  { f: K(0, "god"), dur: 20, s: dolly(at(GN, -0.1, 0.8, -1.9), at(GN, 0, 0.82, 0), K(0, "god"), 0.002, { fov: 38, roll: 0.035 }) },
], (t, f, out, cam) => {
  gn(out, cam, { write: writeT(t, 2.4), expr: f > A(0, "typist") ? "smile_closed" : "neutral", look: -0.6, down: 1 }, t);
  who(out, cam, 1, C.vyasa, { pose: "talk", seated: true, expr: talk(t), t }, VY[0], VY[1], VY[2], { t });
}, { pose: (t, f, s) => { s.dyn.pages.scale.set(1, 0.05 + 0.25 * clamp01(t / 4), 1); }, dof: [{ f: 0, cInf: 12 }] });

// ===== 1: dictation condition =====
shot(L1, "golden", ["hermitage"], [
  { f: L1, s: dolly(at(HERM, -0.2, 1.45, -7.4), at(HERM, -0.2, 1.05, 0), L1, 0.002, { fov: 44 }) },
  { f: K(1, "condition"), cut: true, s: dolly(at(GN, 0.15, 0.9, -2.2), at(GN, 0, 0.85, 0), K(1, "condition"), 0.0025, { fov: 38, roll: -0.03 }) },
  { f: K(1, "Vyasa", 1), cut: true, s: dolly(at(VY, 0.2, 0.75, -2.3), at(VY, 0, 0.72, 0), K(1, "Vyasa", 1), 0.002, { fov: 38 }, 0.006, K(1, "never")) },
], (t, f, out, cam) => {
  const cond = f >= K(1, "condition") && f < K(1, "Vyasa", 1);
  gn(out, cam, { write: cond ? 0.2 : writeT(t, 2.0), expr: cond ? "stern" : "neutral", look: cond ? 0 : -0.6, down: cond ? 0 : 1 }, t);
  who(out, cam, 1, C.vyasa, { pose: "talk", seated: true, expr: f >= K(1, "never") ? talk(t * 1.6, "nervous") : talk(t), t, facing: 1 }, VY[0], VY[1], VY[2], { t });
}, { pose: (t, f, s) => { s.dyn.pages.scale.set(1, 0.3 + 0.1 * clamp01((t - 3) / 3), 1); }, dof: [{ f: L1, cInf: 0 }, { f: K(1, "condition"), cInf: 12 }] });

// ===== 2: his counter =====
const L2 = K(2, "His");
shot(L2, "golden", ["hermitage"], [
  { f: L2, s: dolly(at(VY, 0.4, 0.8, -2.5), at(VY, 0.1, 0.75, 0), L2, 0.0025, { fov: 38, roll: 0.03 }) },
  { f: K(2, "understand"), cut: true, s: dolly(at(GN, -0.2, 0.9, -2.3), at(GN, 0, 0.85, 0), K(2, "understand"), 0.003, { fov: 38 }) },
], (t, f, out, cam) => {
  gn(out, cam, { write: 0.1, expr: f >= K(2, "understand") ? "stern" : "neutral", look: -0.5 }, t);
  who(out, cam, 1, C.vyasa, { pose: f < K(2, "understand") ? "vow" : "sit", seated: true, expr: f < K(2, "Ganesha") ? "smile" : talk(t, "smile"), t, facing: 1 }, VY[0], VY[1], VY[2], { t });
}, { dof: [{ f: L2, cInf: 13 }] });

// ===== 3: knotty verses =====
const L3 = K(3, "So");
shot(L3, "golden", ["hermitage"], [
  { f: L3, s: dolly(at(HERM, -0.15, 1.45, -7.2), at(HERM, -0.2, 1.05, 0), L3, 0.002, { fov: 44 }) },
  { f: K(3, "stop"), cut: true, s: dolly(at(GN, 0.1, 1.0, -1.9), at(GN, 0, 0.95, 0), K(3, "stop"), 0.003, { fov: 36, roll: 0.04 }, 0.006, K(3, "stop")) },
], (t, f, out, cam) => {
  const kn = f >= A(3, "knotty");
  gn(out, cam, { write: kn ? 0.1 : writeT(t, 2.0), puzzled: kn ? 1 : 0, expr: kn ? "stern" : "neutral", ear: Math.sin(t * 8) * 0.5 }, t);
  if (kn) fx(out, "knot", 256, 256, (p) => fxKnot(p, 1), GN[0] + 0.1, GN[1] + 1.75 + 0.05 * Math.sin(t * 3), GN[2] - 0.05, 0.55 * pop(T(f), T(A(3, "knotty"))), 0.55 * pop(T(f), T(A(3, "knotty"))));
  who(out, cam, 1, C.vyasa, { pose: f >= K(3, "drop") ? "drink" : "talk", prop: f >= K(3, "drop") ? "jar" : null, seated: true, expr: f >= K(3, "drop") ? "smile_closed" : "smile", t, facing: 1 }, VY[0], VY[1], VY[2], { t });
}, { dof: [{ f: L3, cInf: 0 }, { f: K(3, "stop"), cInf: 13 }] });

// ===== 4: Shantanu falls for the fisherman's daughter (river, day) =====
const L4 = K(4, "Our");
const boatAt = (t: number): V3 => [3.2 - 0.35 * (t - T(L4)), WATER_Y + 0.05 * Math.sin(t * 2), 9.5];
shot(L4, "day", ["palace", "village"], [
  { f: L4, s: dolly([3.4, 1.35, 2.2], [-1.0, 2.6, 24], L4, 0.0018, { fov: 44 }) },
  { f: K(4, "fisherman's"), cut: true, s: (f) => { const b = boatAt(T(f)); return dolly(add(b, [0.8, 1.5, -4.2]), add(b, [0, 1.15, 0]), K(4, "fisherman's"), 0.0025, { fov: 38 })(f); } },
], (t, f, out, cam) => {
  const b = boatAt(t);
  who(out, cam, 2, C.shantanu, { pose: f >= A(4, "falling") ? "pray" : "stand", expr: f >= A(4, "falling") ? "smile_closed" : "neutral", t, facing: 1 }, GHAT[0] - 1.6, GHAT[1], GHAT[2] - 0.2, { t });
  if (f >= A(4, "falling")) { const k = pop(t, T(A(4, "falling"))); fx(out, "heart", 256, 256, (p) => fxHeart(p), GHAT[0] - 1.6, GHAT[1] + 2.7 + 0.1 * Math.sin(t * 6), GHAT[2] - 0.5, 0.8 * k, 0.8 * k); }
  who(out, cam, 3, C.satyavati, { pose: "carry", prop: "oar", expr: "smile", t, facing: -1 }, b[0], b[1] + 0.12, b[2], { t, noBlob: true });
}, { pose: (t, f, s) => { const b = boatAt(t); s.dyn.boat.visible = true; s.dyn.boat.position.set(b[0], b[1] - 0.05, b[2]); s.dyn.boat.rotation.set(0, 0.15, 0.02 * Math.sin(t * 2)); },
  dof: [{ f: L4, cInf: 0 }, { f: K(4, "fisherman's"), cInf: 12 }] });

// ===== 5: her father's demand (village front, day) =====
const L5 = K(5, "Her");
const FA: V3 = at(VFRONT, 0.4, 0, 0), SA: V3 = at(VFRONT, 1.5, 0, -0.5), DV: V3 = at(VFRONT, -1.3, 0, 0.3);
shot(L5, "day", ["village"], [
  { f: L5, s: dolly(at(FA, -0.2, 1.75, 5.2), at(FA, 0.5, 1.35, 0), L5, 0.0022, { fov: 40 }) },
  { f: K(5, "her"), cut: true, s: dolly(at(FA, -0.25, 1.75, 2.6), at(FA, 0, 1.7, 0), K(5, "her"), 0.003, { fov: 38, roll: -0.035 }) },
], (t, f, out, cam) => {
  who(out, cam, 4, C.fisher, { pose: f >= K(5, "her") ? "vow" : "fold", expr: f >= K(5, "her") ? talk(t, "stern") : "stern", t, facing: -1 }, FA[0], FA[1], FA[2], { t });
  who(out, cam, 3, C.satyavati, { pose: "stand", expr: "smile", t, facing: -1 }, SA[0], SA[1], SA[2], { t });
}, { dof: [{ f: L5, cInf: 8 }, { f: K(5, "her"), cInf: 13 }] });

// ===== 6: the perfect heir (palace courtyard, day) =====
const L6 = K(6, "Problem");
const DVP: V3 = at(CY, 0, 0, -2);
shot(L6, "day", ["palace"], [
  { f: L6, s: dolly(at(DVP, 0.4, 0.85, -4.6), at(DVP, 0, 1.65, 0), L6, 0.0025, { fov: 42, roll: 0.03 }, 0.006, K(6, "Prince")) },
], (t, f, out, cam) => {
  who(out, cam, 5, C.devavrata, { pose: "hips", expr: f >= A(6, "perfect") ? "grin" : "smile", t }, DVP[0], DVP[1], DVP[2], { t });
  if (f >= A(6, "perfect")) for (let i = 0; i < 4; i++) { const k = pop(t, T(A(6, "perfect")) + i * 0.12) * (0.8 + 0.2 * Math.sin(t * 9 + i)); fx(out, "sparkle", 256, 256, (p) => fxSparkle(p), DVP[0] + [-0.7, 0.75, -0.55, 0.6][i], DVP[1] + [2.0, 2.3, 1.2, 1.4][i], DVP[2] - 0.3, 0.35 * k, 0.35 * k); }
}, { dof: [{ f: L6, cInf: 16 }] });

// ===== 7: gives up the throne / what about your kids =====
const L7 = K(7, "Devavrata");
shot(L7, "day", ["village"], [
  { f: L7, s: dolly(at(VFRONT, -0.4, 1.6, 6.0), at(VFRONT, -0.4, 1.3, 0), L7, 0.0022, { fov: 42 }) },
  { f: K(7, "Her"), cut: true, s: dolly(at(FA, -0.6, 1.72, 2.4), at(FA, -0.05, 1.7, 0), K(7, "Her"), 0.003, { fov: 38, roll: 0.035 }, 0.006, K(7, "kids")) },
], (t, f, out, cam) => {
  const ask = f >= K(7, "Her");
  who(out, cam, 5, C.devavrata, { pose: "offer", prop: "crown", expr: "neutral", t, facing: 1 }, DV[0], DV[1], DV[2], { t });
  who(out, cam, 4, C.fisher, { pose: ask ? "talk" : "fold", expr: ask ? talk(t, "smile") : "stern", t, facing: -1, look: ask ? -0.6 : 0 }, FA[0], FA[1], FA[2], { t });
  if (!ask) who(out, cam, 3, C.satyavati, { pose: "stand", expr: "shock", t, facing: -1 }, SA[0], SA[1], SA[2], { t });
}, { dof: [{ f: L7, cInf: 0 }, { f: K(7, "Her"), cInf: 13 }] });

// ===== 8: the vow =====
const L8 = K(8, "So");
shot(L8, "day", ["village"], [
  { f: L8, s: dolly(at(DV, 0.3, 0.8, 3.6), at(DV, 0, 1.8, 0), L8, 0.003, { fov: 40, roll: -0.04 }, 0.006, K(8, "vows")) },
], (t, f, out, cam) => {
  who(out, cam, 5, C.devavrata, { pose: f >= A(8, "vows") - 3 ? "vow" : "stand", expr: "stern", t }, DV[0], DV[1], DV[2], { t });
}, { dof: [{ f: L8, cInf: 13 }] });

// ===== 9: flowers, the new name =====
const L9 = K(9, "The");
shot(L9, "day", ["village"], [
  { f: L9, s: dolly(at(VFRONT, -0.3, 0.7, 6.4), at(VFRONT, 0, 2.6, 0), L9, 0.002, { fov: 44 }) },
  { f: K(9, "Bhishma"), cut: true, s: dolly(at(DV, 0.15, 1.35, 2.3), at(DV, 0, 1.85, 0), K(9, "Bhishma"), 0.003, { fov: 38, roll: 0.04 }) },
], (t, f, out, cam) => {
  who(out, cam, 5, C.devavrata, { pose: "stand", expr: "neutral", t, headTilt: 3 }, DV[0], DV[1], DV[2], { t });
  who(out, cam, 4, C.fisher, { pose: "armsUp", expr: "shock", t, facing: -1 }, FA[0], FA[1], FA[2], { t });
  who(out, cam, 3, C.satyavati, { pose: "pray", expr: "shock", t, facing: -1 }, SA[0], SA[1], SA[2], { t });
  petals(out, t, VFRONT[0], VFRONT[2], VFRONT[1] + 7, 70, 7, T(A(9, "rain")) - 0.5);
}, { dof: [{ f: L9, cInf: 0 }, { f: K(9, "Bhishma"), cInf: 12 }] });

// ===== 10: the gift (palace, golden) =====
const L10 = K(10, "Luckily");
const SH: V3 = at(CY, -0.75, 0, 2), DV2: V3 = at(CY, 0.75, 0, 1.7);
shot(L10, "golden", ["palace"], [
  { f: L10, s: dolly(at(CY, 0.1, 1.55, -3.3), at(CY, 0, 1.45, 1.9), L10, 0.0022, { fov: 40 }) },
  { f: K(10, "he"), dur: 26, s: dolly(at(DV2, 0.2, 1.5, -2.7), at(DV2, 0, 1.6, 0), K(10, "he"), 0.002, { fov: 38, roll: 0.03 }) },
], (t, f, out, cam) => {
  who(out, cam, 2, C.shantanu, { pose: "bless", expr: "smile", t, facing: 1 }, SH[0], SH[1], SH[2], { t });
  who(out, cam, 5, C.devavrata, { pose: "pray", expr: f >= A(10, "choose") ? "smile_closed" : "smile", t, facing: -1 }, DV2[0], DV2[1], DV2[2], { t });
}, { sunAz: -30, sunEl: 9, dof: [{ f: L10, cInf: 12 }] });

// ===== 11: he lives long enough (old Bhishma on the ghat, golden) =====
const L11 = K(11, "Unluckily");
const BG: V3 = at(GHAT, 0, 0, 0.6);
shot(L11, "golden", ["palace"], [
  { f: L11, s: dolly(at(BG, 0.25, 1.6, -2.3), at(BG, 0, 1.3, 0), L11, 0.003, { fov: 38 }) },
  { f: K(11, "see"), dur: 40, s: (f) => ({ pos: at(BG, 1.5, 4.8, -13), look: at(BG, 0, 1.0, 3), fov: 44, roll: 0 }) },
], (t, f, out, cam) => {
  who(out, cam, 6, C.bhishmaOld, { pose: "fold", expr: "neutral", t }, BG[0], BG[1], BG[2], { t });
}, { sunAz: 160, sunEl: 8, dof: [{ f: L11, cInf: 16 }, { f: K(11, "see"), dur: 40, cInf: 0 }] });

// ===== 12: a generation later =====
const L12 = K(12, "A");
const DH: V3 = at(CY, -1.15, 0, 5), PD: V3 = at(CY, 1.15, 0, 5);
shot(L12, "day", ["palace"], [
  { f: L12, s: dolly(at(DH, 0.05, 1.6, -3.4), at(DH, 0, 1.6, 0), L12, 0.0022, { fov: 40 }) },
  { f: K(12, "brother"), dur: 24, s: dolly(at(PD, -0.05, 1.6, -3.4), at(PD, 0, 1.6, 0), K(12, "brother"), 0.0022, { fov: 40, roll: -0.03 }) },
], (t, f, out, cam) => {
  who(out, cam, 7, C.dhritarashtra, { pose: "stand", expr: "neutral", t, facing: 1 }, DH[0], DH[1], DH[2], { t });
  who(out, cam, 8, C.pandu, { pose: "hold", prop: "bow", expr: f >= A(12, "king") ? "grin" : "smile", t, facing: -1 }, PD[0], PD[1], PD[2], { t });
}, { dof: [{ f: L12, cInf: 14 }] });

// ===== 13: the deer, the sage, the curse (forest clearing, day) =====
const L13 = K(13, "Pandu");
const PU: V3 = at(DEER, -2.4, 0, 3.5), DR: V3 = at(DEER, 2.2, 0, -4.5), KU: V3 = at(DEER, -3.4, 0, 4.4);
const arrowT0 = T(A(13, "shoots")), arrowT1 = T(A(13, "deer"));
shot(L13, "day", ["deer"], [
  { f: L13, s: dolly(at(PU, -1.2, 1.75, 3.3), at(DR, -0.5, 1.0, 0), L13, 0.0025, { fov: 40, roll: 0.03 }) },
  { f: K(13, "secretly"), cut: true, s: dolly(at(DR, 0.3, 1.6, 4.2), at(DR, 0, 1.4, 0), K(13, "secretly"), 0.003, { fov: 40 }) },
  { f: K(13, "The"), cut: true, s: dolly(at(DR, -0.4, 1.7, 2.4), at(DR, 0, 1.75, 0), K(13, "The"), 0.003, { fov: 38, roll: -0.04 }, 0.006, K(13, "lie")) },
  { f: K(13, "and"), cut: true, s: dolly(at(PU, 0.3, 1.65, -2.6), at(PU, -0.3, 1.6, 0.3), K(13, "and"), 0.004, { fov: 38, roll: 0.04 }) },
], (t, f, out, cam) => {
  const sage = f >= A(13, "secretly");
  if (!sage) card(out, cam, `deer|${Math.round(t * 4) % 2}`, (p, light) => deer(p, { phase: 0, graze: f < A(13, "deer") ? 1 : 0.2, expr: f >= A(13, "deer") ? "shock" : "neutral", light }), DR[0], DR[1], DR[2], { geo: "wide", scale: 1.1, mirror: true, blobScale: 1.6 });
  else who(out, cam, 9, C.sage, { pose: f >= K(13, "The") ? "point" : "hips", expr: "stern", t, facing: 1 }, DR[0], DR[1], DR[2], { t, mirror: true });
  if (sage && f < A(13, "secretly") + 12) { const k = (f - A(13, "secretly")) / 12; fx(out, `puff|${Math.round(k * 12)}`, 300, 300, (p) => fxPuff(p, k), DR[0], DR[1] + 1, DR[2] - 0.3, 2.6, 2.6, { kind: "soft" }); }
  const aiming = f < A(13, "deer") + 4;
  who(out, cam, 8, C.pandu, { pose: aiming ? "aim" : f >= K(13, "and") ? "armsUp" : "stand", prop: aiming ? "bowDrawn" : "bow", expr: f >= K(13, "and") ? "shock" : "stern", t, facing: aiming ? 1 : 0 }, PU[0], PU[1], PU[2], { t, mirror: aiming });
  if (f >= K(13, "and")) who(out, cam, 10, C.kunti, { pose: "stand", expr: "nervous", t, facing: 1 }, KU[0], KU[1], KU[2], { t });
  const u = (t - arrowT0) / Math.max(0.1, arrowT1 - arrowT0);
  if (u > 0 && u < 1) { const p0 = add(PU, [0.6, 1.5, -0.3]), p1 = add(DR, [0, 0.9, 0]); fx(out, "arrow", 256, 128, (p) => fxArrow(p), p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u, 0.9, 0.45, { rot: -0.2 }); }
  if (f >= A(13, "deer") && f < A(13, "deer") + 12) fx(out, `stars|${f % 12}`, 420, 220, (p) => fxStars(p, (f - A(13, "deer")) / 12), DR[0], DR[1] + 1.4, DR[2] - 0.2, 1.5, 0.79);
}, { dof: [{ f: L13, cInf: 0 }, { f: K(13, "secretly"), cInf: 10 }, { f: K(13, "The"), cInf: 13 }] });

// ===== 14: Kunti's chant =====
const L14 = K(14, "Conveniently");
const KC: V3 = at(DEER, 0, 0, 0), PC: V3 = at(DEER, 1.3, 0, 0.6);
shot(L14, "day", ["deer"], [
  { f: L14, s: dolly(at(KC, 0.5, 1.55, -4.2), at(KC, 0.5, 1.5, 0), L14, 0.0025, { fov: 40 }) },
  { f: K(14, "chant"), dur: 24, s: dolly(at(KC, 0.15, 1.7, -2.6), at(KC, 0, 1.8, 0), K(14, "chant"), 0.003, { fov: 38, roll: 0.035 }) },
], (t, f, out, cam) => {
  const ch = f >= A(14, "chant");
  who(out, cam, 10, C.kunti, { pose: ch ? "pray" : "stand", expr: ch ? "smile_closed" : "smile", t, facing: 1 }, KC[0], KC[1], KC[2], { t });
  who(out, cam, 8, C.pandu, { pose: "stand", expr: f >= A(14, "sons") ? "grin" : "nervous", t, facing: -1 }, PC[0], PC[1], PC[2], { t });
  if (ch) { const k = pop(t, T(A(14, "chant")), 0.4); fx(out, "haloK", 256, 256, (p) => fxHalo(p, "#fff0a0"), KC[0], KC[1] + 1.25, KC[2] + 0.15, 2.8 * k, 2.8 * k, { kind: "soft" }); }
}, { dof: [{ f: L14, cInf: 10 }] });

// ===== 15: three gods, then the twins =====
const L15 = K(15, "She");
const MD: V3 = at(DEER, 1.6, 0, 0.3);
const emblem = (out: Stage, key: string, draw: (p: Pen) => void, p: V3, k: number, t: number) => fx(out, key, 256, 256, draw, p[0], p[1] + 0.12 * Math.sin(t * 2.5 + p[0]), p[2], 1.15 * k, 1.15 * k, { kind: "glow" });
shot(L15, "day", ["deer"], [
  { f: L15, s: dolly(at(KC, 0.2, 1.1, -4.6), at(KC, 0.1, 1.55, 0), L15, 0.002, { fov: 48, roll: 0.03 }) },
  { f: K(15, "then"), cut: true, s: dolly(at(MD, -0.8, 1.2, -5.4), at(MD, -0.8, 1.3, 0), K(15, "then"), 0.0025, { fov: 46 }, 0.006, K(15, "twins")) },
], (t, f, out, cam) => {
  const later = f >= K(15, "then");
  who(out, cam, 10, C.kunti, { pose: later ? "talk" : "pray", expr: later ? talk(t, "smile") : "grin", t, facing: later ? 1 : 0 }, KC[0], KC[1], KC[2], { t });
  if (!later) {
    const E = [["wheel", fxWheel, "calls"], ["wind", (p: Pen) => fxWind(p, 0), "three"], ["bolt", fxBolt, "gods"]] as const;
    E.forEach(([k, d, w], i) => { const a = A(15, w); if (f >= a) emblem(out, k, d as (p: Pen) => void, at(KC, -0.95 + i * 0.95, 2.55 + (i === 1 ? 0.4 : 0), 0.1), pop(t, T(a)), t); });
    // three babies for Kunti: one per god
    E.forEach(([, , w], i) => { const a = A(15, w) + 6; if (f >= a) card(out, cam, "babyK" + i, (p, light) => baby(p, { light, wrap: ["#f6efdc", "#e9f0ff", "#fff3d0"][i] }), KC[0] - 0.7 + i * 0.7, KC[1] + 0.02, KC[2] - 0.9, { geo: "baby", scale: 0.42 * pop(t, T(a)), noBlob: false, blobScale: 0.6 }); });
  } else {
    who(out, cam, 11, C.madri, { pose: f >= A(15, "twins") ? "armsUp" : "pray", expr: f >= A(15, "twins") ? "grin" : "smile_closed", t, facing: -1 }, MD[0], MD[1], MD[2], { t });
    for (const i of [0, 1]) { const a = A(15, "second") + i * 5; if (f >= a) emblem(out, "horse" + i, fxHorse, at(MD, -0.45 + i * 0.9, 2.9, 0.2), pop(t, T(a)), t); }
    for (const i of [0, 1]) { const a = A(15, "twins") + i * 4; if (f >= a) card(out, cam, "babyM" + i, (p, light) => baby(p, { light, wrap: "#dff3e0" }), MD[0] - 0.45 + i * 0.9, MD[1] + 0.02, MD[2] - 0.8, { geo: "baby", scale: 0.42 * pop(t, T(a)), blobScale: 0.6 }); }
  }
}, { dof: [{ f: L15, cInf: 0 }, { f: K(15, "then"), cInf: 8 }] });

// ===== 16: five brothers =====
const L16 = K(16, "Five");
const ROW = (base: V3, n: number, gap: number, i: number): V3 => at(base, (i - (n - 1) / 2) * gap, 0, Math.abs(i - (n - 1) / 2) * 0.15);
shot(L16, "day", ["palace"], [
  { f: L16, s: dolly(at(CY, 0, 1.2, -9.2), at(CY, 0, 0.95, 0), L16, 0.0035, { fov: 44 }, 0.006, K(16, "Pandavas")) },
], (t, f, out, cam) => {
  KBROS.forEach((s, i) => { const k = pop(t, T(A(16, "Five")) + i * 0.08); who(out, cam, 20 + i, s, { pose: i === 1 ? "flex" : i === 2 ? "hips" : "stand", expr: "grin", t, facing: 0 }, ...ROW(CY, 5, 0.8, i), { t, scale: [1.08, 1.12, 1.0, 0.92, 0.92][i] * k }); });
}, { dof: [{ f: L16, cInf: 10 }] });

// ===== 17: two years, a lump =====
const L17 = K(17, "Meanwhile");
const GD: V3 = at(CY, -0.6, 0, 6), DH2: V3 = at(CY, 0.8, 0, 6.4), PLATE: V3 = at(CY, 0, 0.12, 4.2);
shot(L17, "day", ["palace"], [
  { f: L17, s: dolly(at(GD, 0.5, 1.5, -3.6), at(GD, 0.4, 1.35, 0), L17, 0.0022, { fov: 40 }) },
  { f: K(17, "two"), dur: 30, s: dolly(at(GD, 0.1, 1.2, -2.6), at(GD, 0, 1.15, 0), K(17, "two"), 0.003, { fov: 38, roll: -0.035 }) },
  { f: K(17, "lump"), cut: true, s: dolly(at(PLATE, 0.2, 1.2, -2.2), at(PLATE, 0, 0.3, 0), K(17, "lump"), 0.0035, { fov: 38 }) },
], (t, f, out, cam) => {
  const lump = f >= K(17, "lump");
  const belly = 0.55 + 0.45 * clamp01((t - T(L17)) / 2.2);
  who(out, cam, 12, { ...C.gandhari, belly: lump ? 0 : belly }, { pose: lump ? "armsUp" : "belly", expr: lump ? "shock" : f >= A(17, "two") ? "pained" : "nervous", t, facing: 1 }, GD[0], GD[1], GD[2], { t });
  who(out, cam, 7, C.dhritarashtra, { pose: lump ? "armsUp" : "stand", expr: lump ? "shock" : "neutral", t, facing: -1 }, DH2[0], DH2[1], DH2[2], { t });
  if (lump) fx(out, "lump", 256, 256, (p) => fxLump(p), PLATE[0], PLATE[1] + 0.33, PLATE[2], 0.6 * pop(t, T(A(17, "lump"))), 0.6 * pop(t, T(A(17, "lump"))));
}, { pose: (t, f, s) => { s.dyn.ladduPlate.visible = f >= K(17, "lump"); s.dyn.ladduPlate.position.set(PLATE[0], PLATE[1] + 0.05, PLATE[2]); s.dyn.ladduPlate.scale.set(1.6, 1, 1.6); },
  dof: [{ f: L17, cInf: 14 }, { f: K(17, "lump"), cInf: 14 }] });

// ===== 18: 101 jars of ghee =====
const L18 = K(18, "Vyasa");
const VJ: V3 = at(JAR0, -1.6, 0, 3.4);
const jarsOn = (f: number) => clamp01((f - A(18, "hundred")) / (A(18, "pieces") + 12 - A(18, "hundred"))) * 101;
shot(L18, "day", ["palace"], [
  { f: L18, s: dolly(at(VJ, -0.2, 1.6, -3.6), at(VJ, 0.4, 1.4, 0), L18, 0.0025, { fov: 40 }) },
  { f: K(18, "hundred"), cut: true, s: dolly(at(JAR0, 7.2, 8.5, -6.5), at(JAR0, 7.2, 0, 4.4), K(18, "hundred"), 0.0025, { fov: 46 }) },
  { f: K(18, "each"), dur: 30, s: dolly(at(JAR0, 1.2, 1.4, -2.6), at(JAR0, 1.8, 0.7, 1.0), K(18, "each"), 0.003, { fov: 40, roll: 0.03 }) },
], (t, f, out, cam) => {
  who(out, cam, 1, C.vyasa, { pose: f >= A(18, "divides") ? "bless" : "stand", expr: "smile_closed", t, facing: 1 }, VJ[0], VJ[1], VJ[2], { t });
}, { pose: (t, f, s) => poseJars(s, jarsOn(f), 0, f), dof: [{ f: L18, cInf: 9 }, { f: K(18, "hundred"), cInf: 0 }, { f: K(18, "each"), cInf: 10 }] });

// ===== 19: out come a hundred brothers and one sister =====
const L19 = K(19, "Out");
const popAt = (i: number) => A(19, "Out") + Math.round(hh(i, 7) * (A(19, "Kauravas") + 10 - A(19, "Out")));
const SIS = 6; // the sister's jar (front row, pops on "sister")
shot(L19, "day", ["palace"], [
  { f: L19, s: dolly(at(JAR0, 3.4, 1.7, -3.2), at(JAR0, 3.8, 1.0, 2.0), L19, 0.0025, { fov: 42 }) },
  { f: K(19, "one"), cut: true, s: dolly(at(jarPos(SIS), 0.15, 1.3, -2.2), at(jarPos(SIS), 0, 1.1, 0), K(19, "one"), 0.003, { fov: 38, roll: -0.035 }) },
], (t, f, out, cam) => {
  for (let i = 0; i < 101; i++) {
    const a = i === SIS ? A(19, "one") : i === 3 ? A(19, "Out") : popAt(i);
    if (f < a) continue;
    const k = pop(t, T(a), 0.22), p = jarPos(i);
    if (cam.pos.distanceTo({ x: p[0], y: p[1], z: p[2] } as never) > 22) continue;
    const s = i === SIS ? KIDS.duhshala : i === 3 ? KIDS.duryodhana : KAURAVA(i);
    who(out, cam, 100 + i, s, { pose: "armsUp", expr: i === 3 ? "smile" : "grin", t }, p[0], p[1] - 0.95 + 1.45 * k, p[2] + 0.02, { t, noBlob: true, scale: 0.78 });
  }
}, { pose: (t, f, s) => poseJars(s, 101, 1, f), dof: [{ f: L19, cInf: 9 }, { f: K(19, "one"), cInf: 13 }] });

// ===== 20: five cousins, a hundred cousins, one palace =====
const L20 = K(20, "Five");
const PB: V3 = at(CY, -5.5, 0, -6), KB: V3 = at(CY, 3, 0, 1);
shot(L20, "day", ["palace"], [
  { f: L20, s: dolly(at(CY, -7.8, 1.5, -11.5), at(CY, -4.5, 1.2, -4.5), L20, 0.002, { fov: 44 }) },
  { f: K(20, "hundred"), dur: 22, s: dolly(at(CY, -2.5, 2.4, -11), at(CY, 2.5, 1.0, 2), K(20, "hundred"), 0.002, { fov: 46 }) },
  { f: K(20, "one"), dur: 36, s: () => ({ pos: at(CY, 0, 3.0, -22), look: at(CY, 0, 7.5, 18), fov: 50, roll: 0 }) },
], (t, f, out, cam) => {
  KBROS.forEach((s, i) => who(out, cam, 20 + i, s, { pose: i === 1 ? "fold" : "stand", expr: "stern", t, facing: 1 }, PB[0] + (i % 3) * 0.95, PB[1], PB[2] + Math.floor(i / 3) * 1.1, { t, scale: [1.08, 1.12, 1.0, 0.92, 0.92][i] }));
  for (let i = 0; i < 100; i++) {
    const p = at(KB, (i % 12) * 0.95 - 4 + (Math.floor(i / 12) % 2) * 0.45, 0, Math.floor(i / 12) * 1.0);
    who(out, cam, 100 + i, i === 0 ? KIDS.duryodhana : KAURAVA(i), { pose: hh(i, 2) < 0.3 ? "fold" : "stand", expr: hh(i, 3) < 0.5 ? "stern" : "grin", t, facing: -1 }, p[0], p[1], p[2], { t, scale: 0.92 + 0.12 * hh(i, 4) });
  }
}, { dof: [{ f: L20, cInf: 0 }] });

// ===== 21: shaking the Kauravas out of the fruit tree =====
const L21 = K(21, "Bhima");
const shakeT = T(A(21, "shaking"));
const IN_TREE: V3[] = [[-1.5, 4.0, -1.6], [1.4, 4.3, -1.5], [0.1, 5.0, -1.4], [-0.6, 3.5, -2.0], [2.0, 3.6, -1.8], [-2.1, 4.8, -1.2]];
shot(L21, "day", ["palace"], [
  { f: L21, s: dolly(at(TREE, 0.4, 2.0, -9.0), at(TREE, 0.2, 3.0, 0), L21, 0.0025, { fov: 46 }) },
  { f: K(21, "shaking"), cut: true, s: dolly(at(TREE, 0.2, 1.4, -10.0), at(TREE, 0.1, 3.2, 0), K(21, "shaking"), 0.002, { fov: 50, roll: -0.03 }) },
], (t, f, out, cam) => {
  const sh = t >= shakeT;
  who(out, cam, 21, KIDS.bhima, { pose: sh ? "shake" : "hips", expr: "grin", t }, TREE[0] + 0.15, TREE[1] + 0.38, TREE[2] - 1.15, { t, scale: 1.12 });
  IN_TREE.forEach((d, i) => {
    const t0 = shakeT + 0.25 + i * 0.13, fall = Math.max(0, t - t0);
    const y = Math.max(0.38, d[1] - 4.9 * fall * fall);
    const landed = y <= 0.38 && fall > 0;
    who(out, cam, 101 + i, KAURAVA(i + 1), { pose: fall > 0 ? (landed ? "stand" : "armsUp") : "sit", seated: fall <= 0, expr: landed ? "dazed" : fall > 0 ? "shock" : "smile", t }, TREE[0] + d[0], TREE[1] + y - (fall > 0 ? 0 : 0.25), TREE[2] + d[2] - 1.0, { t, scale: 0.85, noBlob: !landed });
    if (fall > 0 && !landed) fx(out, "mango", 128, 128, (p) => fxMango(p), TREE[0] + d[0] + 0.4, TREE[1] + Math.max(0.3, d[1] + 0.6 - 4.9 * (fall + 0.08) ** 2), TREE[2] + d[2] - 1.1, 0.34, 0.34, { rot: fall * 6 });
  });
}, { pose: (t, f, s) => { /* the tree itself sways when shaken: handled by the camera kick */ }, dof: [{ f: L21, cInf: 8 }, { f: K(21, "shaking"), cInf: 0 }] });

// ===== 22: the poisoned sweet, the river =====
const L22 = K(22, "So");
const DY: V3 = at(GHAT, -0.7, 0, -0.1), BH: V3 = at(GHAT, 0.6, 0, -0.3);
shot(L22, "day", ["palace"], [
  { f: L22, s: dolly(at(GHAT, -0.1, 1.2, -5.0), at(GHAT, -0.05, 1.0, -0.2), L22, 0.0025, { fov: 42 }) },
  { f: K(22, "poisons"), cut: true, s: dolly(at(DY, 0.3, 1.0, -1.9), at(DY, 0, 1.05, 0), K(22, "poisons"), 0.0035, { fov: 36, roll: 0.04 }) },
  { f: K(22, "river"), cut: true, s: dolly([1.8, 2.6, 7.0], [1.8, 0.3, 14.5], K(22, "river"), 0.002, { fov: 44 }) },
], (t, f, out, cam) => {
  const thrown = f >= K(22, "throws");
  who(out, cam, 3 + 100, KIDS.duryodhana, { pose: thrown ? "dust" : "offer", prop: thrown ? null : "laddu", expr: f >= K(22, "poisons") ? "smile" : "grin", look: f >= K(22, "poisons") ? 1 : 0, t, facing: 1 }, DY[0], DY[1], DY[2], { t });
  if (!thrown) who(out, cam, 21, KIDS.bhima, { pose: "grab", expr: "grin", t, facing: -1 }, BH[0], BH[1], BH[2], { t });
  const sp = A(22, "river") - 3;
  if (f >= sp && f < sp + 20) fx(out, `splash|${f - sp}`, 800, 800, (p) => fxSplash(p, (f - sp) / 20), 1.8, WATER_Y + 1.1, 14.5, 3.2, 3.2);
}, { dof: [{ f: L22, cInf: 9 }, { f: K(22, "poisons"), cInf: 14 }, { f: K(22, "river"), cInf: 0 }] });

// ===== 23: the snake kingdom =====
const L23 = K(23, "Bhima");
const sinkY = (t: number) => NG[1] + Math.max(0, 5.5 - 3.2 * (t - T(L23)));
shot(L23, "deep", ["naga"], [
  { f: L23, s: dolly(at(NG, 0.4, 1.0, -6.5), at(NG, 0, 3.0, 0), L23, 0.002, { fov: 46, roll: 0.03 }) },
  { f: K(23, "drinks"), cut: true, s: dolly(at(NG, 0.3, 1.25, -3.3), at(NG, 0, 1.0, 0), K(23, "drinks"), 0.003, { fov: 40 }) },
  { f: K(23, "comes"), cut: true, s: dolly(at(NG, 0.2, 0.9, -2.9), at(NG, 0, 1.15, 0), K(23, "comes"), 0.004, { fov: 38, roll: -0.04 }, 0.006, K(23, "stronger")) },
], (t, f, out, cam) => {
  const y = sinkY(t), drink = f >= K(23, "drinks"), strong = f >= K(23, "comes");
  who(out, cam, 21, KIDS.bhima, { pose: strong ? "flex" : drink ? "drink" : "armsUp", prop: drink && !strong ? "jar" : null, expr: strong ? "grin" : drink ? "smile_closed" : "shock", t }, NG[0], y, NG[2], { t, noBlob: y > NG[1] + 0.05, scale: strong ? 1.25 : 1.05 });
  [[-1.5, 1.0, "#3f9a6a", true], [1.6, 1.2, "#6a4fb5", false], [-2.6, 2.6, "#2f7a9a", false], [2.7, 2.5, "#b5344a", false]].forEach(([dx, dz, col, king], i) =>
    card(out, cam, `naga|${col}|${Math.floor(t * 6) % 12}|${king}`, (p, light) => naga(p, { col: col as string, king: king as boolean, t, light, expr: strong ? "grin" : "smile" }), NG[0] + (dx as number), NG[1], NG[2] + (dz as number), { scale: 0.85, blobScale: 1.4 }));
  for (let i = 0; i < 14; i++) { const ph = (t * 0.6 + hh(i, 5)) % 1; fx(out, "bubble", 128, 128, (p) => fxBubble(p), NG[0] - 3 + hh(i, 1) * 6 + 0.2 * Math.sin(t * 3 + i), NG[1] + ph * 7, NG[2] - 1 + hh(i, 2) * 3, 0.18 + 0.12 * hh(i, 3), 0.18 + 0.12 * hh(i, 3), { kind: "soft" }); }
  if (strong) { const k = pop(t, T(A(23, "stronger"))); fx(out, "burst", 500, 500, (p) => fxBurst(p, 0.6, "#fff3b0"), NG[0], NG[1] + 1.4, NG[2] + 0.4, 3.2 * k, 3.2 * k, { kind: "glow" }); }
}, { pose: (t, f, s) => poseNectar(s, f), dof: [{ f: L23, cInf: 6 }, { f: K(23, "drinks"), cInf: 11 }] });

// ===== 24: the holiday home of lacquer (night) =====
const L24 = K(24, "Next");
const DO: V3 = at(LAC, -3.2, 0, -7.5), DOOR: V3 = at(LAC, 0, 0, -4.6);
const walkIn = (i: number, t: number): V3 => { const u = clamp01((t - T(L24) - 0.4) / 3.2 - i * 0.04); return at(DOOR, (i - 2.5) * 0.85 * (1 - u * 0.6), 0, -6.5 + 5.6 * u + i * 0.25); };
shot(L24, "night", ["lac"], [
  { f: L24, s: dolly(at(LAC, -1.0, 2.0, -18.5), at(LAC, 0, 3.0, 0), L24, 0.002, { fov: 44 }) },
  { f: K(24, "so"), cut: true, s: dolly(at(DO, 0.35, 1.7, -2.4), at(DO, 0, 1.7, 0), K(24, "so"), 0.0035, { fov: 38, roll: 0.04 }) },
], (t, f, out, cam) => {
  who(out, cam, 30, C.duryodhana, { pose: f >= K(24, "so") ? "hips" : "present", expr: f >= K(24, "so") ? "smile" : "grin", look: f >= K(24, "so") ? 1 : 0, t, facing: 1 }, DO[0], DO[1], DO[2], { t });
  if (f < K(24, "so")) {
    BROS.forEach((s, i) => who(out, cam, 31 + i, s, { pose: "walk", phase: (t * 1.8 + i * 0.3) % 1, expr: "smile", t }, ...walkIn(i, t), { t }));
    who(out, cam, 10, C.kunti, { pose: "walk", phase: (t * 1.8) % 1, expr: "smile", t }, ...walkIn(5, t), { t });
  }
  for (const s of [-1, 1]) fx(out, "lampglow", 256, 256, (p) => fxHalo(p, "#ffb060"), LAC[0] + s * 5.3, LAC[1] + 2.6, LAC[2] - 4.8, 1.6, 1.6, { kind: "glow" });
}, { sunAz: 40, sunEl: 20, dof: [{ f: L24, cInf: 0 }, { f: K(24, "so"), cInf: 13 }] });

// ===== 25: the tunnel, the fire, the escape =====
const L25 = K(25, "They");
const HOLE: V3 = at(LAC, 3, 0, -13);
const FIRE_SPOTS: [number, number, number, number][] = [
  ...[-4.4, -2.9, -1.45, 0, 1.45, 2.9, 4.4].map((x) => [x, 3.45, -3.7, 2.2] as [number, number, number, number]),    // first-floor ledge
  ...[-3, -1.5, 0, 1.5, 3].map((x, i) => [x, 7.3 + 0.5 * (1 - Math.abs(x) / 3), -0.6 + (i % 2) * 0.5, 3.4] as [number, number, number, number]), // roof
  ...[-3.4, -1.1, 1.1, 3.4].map((x) => [x, 1.15, -4.13, 1.3] as [number, number, number, number]),                    // windows
];
const fires = (out: Stage, t: number, f: number, start: number) => {
  FIRE_SPOTS.forEach(([dx, dy, dz, sz], i) => {
    const a = start + Math.round(hh(i, 8) * 24); if (f < a) return;
    const k = pop(t, T(a), 0.4), st = Math.floor(t * 8 + i) % 6, w = sz * k;
    fx(out, `fire|${st}|${i % 3}`, 512, 512, (p) => fxFire(p, st / 8, i % 3), LAC[0] + dx, LAC[1] + dy + w * 0.5, LAC[2] + dz, w, w, { kind: "fire" });
  });
  if (f >= start) { const k = pop(t, T(start), 0.8); fx(out, "firehalo", 256, 256, (p) => fxHalo(p, "#ff8a3a"), LAC[0], LAC[1] + 4, LAC[2] - 4.6, 16 * k, 13 * k, { kind: "soft" }); }
  for (let i = 0; i < 8; i++) { const ph = (t * 0.25 + hh(i, 5)) % 1; fx(out, "smoke" + (i % 3), 256, 256, (p) => fxSmoke(p, i), LAC[0] - 3 + hh(i, 1) * 6, LAC[1] + 10 + ph * 12, LAC[2] - 1 + hh(i, 2) * 3, 5 + ph * 6, 5 + ph * 6, { kind: "soft" }); }
};
shot(L25, "night", ["lac"], [
  { f: L25, s: dolly(at(HOLE, -0.5, 1.6, -4.4), at(HOLE, 0, 0.6, 0), L25, 0.003, { fov: 40 }) },
  { f: K(25, "torch"), cut: true, s: dolly(at(LAC, 1.5, 1.7, -12.8), at(LAC, 0, 3.4, 0), K(25, "torch"), 0.002, { fov: 46, roll: -0.03 }) },
  { f: K(25, "sneak"), cut: true, s: dolly(at(HOLE, 1.0, 1.4, -6.8), at(HOLE, -0.5, 1.6, 4), K(25, "sneak"), 0.0022, { fov: 44 }) },
], (t, f, out, cam) => {
  const torch = f >= K(25, "torch"), sneak = f >= K(25, "sneak");
  if (!torch) {
    const k = clamp01((t - T(L25) - 0.3) / 0.8);
    who(out, cam, 40, C.priest, { pose: "chop", prop: "axe", expr: "stern", t }, HOLE[0] + 0.1, HOLE[1] - 1.6 + 1.3 * k, HOLE[2] + 0.1, { t, noBlob: true });
    BROS.slice(0, 3).forEach((s, i) => who(out, cam, 31 + i, s, { pose: "stand", expr: "smile", t, facing: i === 0 ? 1 : -1 }, HOLE[0] - 1.4 + i * 1.4 + (i === 1 ? 0.0 : 0), HOLE[1], HOLE[2] + 1.4 + (i === 1 ? 0.6 : 0), { t }));
  } else if (!sneak) {
    who(out, cam, 32, C.bhima, { pose: "throw", prop: "torch", expr: "grin", t, facing: -1 }, LAC[0] + 0.7, LAC[1], LAC[2] - 8.4, { t });
    fires(out, t, f, A(25, "it"));
  } else {
    fires(out, t, f, A(25, "torch"));
    const u = clamp01((t - T(K(25, "sneak"))) / 2.5);
    [...BROS, C.kunti].forEach((s, i) => who(out, cam, 31 + i, s, { pose: "sneak", phase: (t * 1.4 + i * 0.27) % 1, expr: i === 5 ? "nervous" : "smile", look: 1, t, facing: -1 }, HOLE[0] + 1.2 - u * 3.5 - i * 0.9, HOLE[1], HOLE[2] - 1.6 - (i % 2) * 0.7, { t }));
  }
}, { sunAz: 70, sunEl: 18, dof: [{ f: L25, cInf: 10 }, { f: K(25, "torch"), cInf: 0 }, { f: K(25, "sneak"), cInf: 8 }] });

// ===== 26: the contest =====
const L26 = K(26, "In");
const DRA: V3 = at(ARENA, 0, 1.0, 11), BOW: V3 = at(ARENA, -6, 0.15, -4), POLE: V3 = at(ARENA, 0, 0, 0);
const kingsSeated = (out: Stage, cam: CamInfo, t: number, expr: Expr) => {
  for (let i = 0; i < 10; i++) { const sx = i < 5 ? -1 : 1, j = i % 5; who(out, cam, 50 + i, i % 2 ? C.king1 : C.king2, { pose: "sit", expr: hh(i, 2) < 0.3 ? "stern" : expr, t, facing: (sx * -1) as -1 | 1 }, ARENA[0] + sx * 20.6, ARENA[1] + 0.6, ARENA[2] - 8 + j * 3.6, { t, noBlob: true }); }
};
shot(L26, "day", ["arena"], [
  { f: L26, s: dolly(at(DRA, 1.2, 0.5, -6.6), at(DRA, 0.3, 0.9, 0), L26, 0.0022, { fov: 42 }) },
  { f: K(26, "string"), cut: true, s: dolly(at(BOW, 1.4, 1.6, -3.4), at(BOW, 0, 0.9, 0), K(26, "string"), 0.003, { fov: 40, roll: 0.03 }) },
  { f: K(26, "hit"), cut: true, s: (f) => { const u = glide((f - K(26, "hit")) / 26); return { pos: at(POLE, 1.4, 1.7, -5.5), look: at(POLE, 0, 2.6 + 13.4 * u, 0), fov: 46, roll: 0 }; } },
], (t, f, out, cam) => {
  who(out, cam, 60, C.draupadi, { pose: "hold", prop: "garland", expr: "smile", t }, DRA[0], DRA[1], DRA[2], { t });
  kingsSeated(out, cam, t, "smile");
  if (f >= K(26, "string") && f < K(26, "hit")) who(out, cam, 51, C.king1, { pose: "hips", expr: "stern", t, facing: 1 }, BOW[0] - 1.3, ARENA[1] + 0.15, BOW[2] - 0.6, { t });
  if (f < K(26, "string")) BROS.forEach((s, i) => who(out, cam, 31 + i, PRIEST(s), { pose: "walk", phase: (t * 1.6 + i * 0.3) % 1, expr: "smile", t, facing: 1 }, DRA[0] + 2.4 + i * 0.85 - 0.95 * (t - T(L26)), ARENA[1] + 0.15, DRA[2] - 2.6 - (i % 2) * 0.35, { t }));
}, { pose: (t, f, s) => { s.dyn.wheel.rotation.z = t * 2.2; }, dof: [{ f: L26, cInf: 10 }, { f: K(26, "string"), cInf: 11 }, { f: K(26, "hit"), cInf: 0 }] });

// ===== 27: kings fail =====
const L27 = K(27, "Kings");
const KF: V3 = at(BOW, -0.2, 0, -1.0);
shot(L27, "day", ["arena"], [
  { f: L27, s: dolly(at(KF, 0.6, 1.5, -3.6), at(KF, 0.4, 1.2, 0), L27, 0.003, { fov: 40 }) },
  { f: K(27, "thrown"), cut: true, s: dolly(at(KF, -0.4, 0.9, -3.2), at(KF, -1.0, 0.45, 0.3), K(27, "thrown"), 0.003, { fov: 40, roll: -0.04 }) },
], (t, f, out, cam) => {
  const flat = f >= K(27, "thrown");
  if (!flat) who(out, cam, 52, C.king2, { pose: "shake", expr: "pained", t }, KF[0], KF[1], KF[2], { t });
  else {
    card(out, cam, `flatking|${Math.floor(t * 4) % 2}`, (p, light) => { p.g.transform(0, 1, -1, 0, 1000, 215); person(p, C.king2, { pose: "armsUp", expr: "dazed", light, t }); }, KF[0] - 1.0, KF[1], KF[2] + 0.3, { geo: "wide", blobScale: 2.2 });
    const s0 = A(27, "thrown"); fx(out, `stars|${(f - s0) % 20}`, 420, 220, (p) => fxStars(p, ((f - s0) / 20) % 1), KF[0] - 1.0 + cam.right.x * 0.45, KF[1] + 0.75, KF[2] + 0.3 + cam.right.z * 0.45, 1.1, 0.58);
  }
  kingsSeated(out, cam, t, flat ? "laugh" : "nervous");
}, { pose: (t, f, s) => { s.dyn.bigBow.rotation.z = f >= A(27, "thrown") && f < A(27, "thrown") + 10 ? 0.15 * Math.sin((f - A(27, "thrown")) * 2) : 0; }, dof: [{ f: L27, cInf: 10 }] });

// ===== 28: Arjuna strings it in a blink =====
const L28 = K(28, "Arjuna");
const AR: V3 = at(BOW, 0.8, 0, -1.6);
const arrowUp = (f: number) => clamp01((f - A(28, "hits")) / (A(28, "mark") + 2 - A(28, "hits")));
shot(L28, "day", ["arena"], [
  { f: L28, s: dolly(at(AR, -0.5, 1.15, -5.0), at(AR, 0.25, 1.2, 0), L28, 0.003, { fov: 44, roll: 0.035 }, 0.006, K(28, "blink")) },
  { f: K(28, "mark"), cut: true, s: dolly(at(POLE, 0.6, 15.9, -4.5), at(POLE, 0, 15.9, 0), K(28, "mark"), 0.004, { fov: 36 }) },
], (t, f, out, cam) => {
  const shot2 = f >= K(28, "mark");
  if (!shot2) {
    who(out, cam, 33, PRIEST(C.arjuna), { pose: f >= A(28, "blink") ? "aim" : "stand", prop: f >= A(28, "blink") ? "bowDrawn" : "bow", expr: "stern", t, facing: 1 }, AR[0], AR[1], AR[2], { t, mirror: true });
    if (f >= A(28, "blink") && f < A(28, "blink") + 8) fx(out, "sparkA", 256, 256, (p) => fxSparkle(p), AR[0] + cam.right.x * 0.45, AR[1] + 1.35, AR[2] + cam.right.z * 0.45 - 0.15, 0.5, 0.5, { kind: "glow" });
  } else {
    const u = arrowUp(f);
    if (u < 1) fx(out, "arrow", 256, 128, (p) => fxArrow(p), POLE[0] - 2 + 2 * u, POLE[1] + 13 + 2.9 * u, POLE[2] - 0.1, 0.9, 0.45, { rot: 0.9 });
    else { const k = pop(t, T(A(28, "mark") + 2)); fx(out, "burstT", 500, 500, (p) => fxBurst(p, 0.7, "#fff3b0"), POLE[0], POLE[1] + 15.9, POLE[2] - 0.3, 3 * k, 3 * k, { kind: "glow" }); fx(out, "arrowIn", 256, 128, (p) => fxArrow(p), POLE[0] - 0.35, POLE[1] + 15.95, POLE[2] - 0.15, 0.9, 0.45, { rot: 0.35 }); }
  }
}, { pose: (t, f, s) => { s.dyn.wheel.rotation.z = f >= A(28, "mark") + 2 ? s.dyn.wheel.rotation.z : t * 2.2; }, dof: [{ f: L28, cInf: 9 }, { f: K(28, "mark"), cInf: 0 }] });

// ===== 29-31: home to Kunti (village, golden) =====
const L29 = K(29, "They");
const runHome = (i: number, t: number): V3 => { const u = clamp01((t - T(L29)) / 1.0); return at(KHUT, -1.8 + i * 0.9 + 0.2 * (i % 2), 0, 12 - 7.5 * u + (i % 2) * 0.5); };
shot(L29, "golden", ["village"], [
  { f: L29, s: dolly(at(KHUT, 0.3, 1.7, 0.4), at(KHUT, 0, 0.95, 9), L29, 0.0025, { fov: 46 }) },
  { f: K(29, "Mother"), cut: true, s: dolly(at(KHUT, 0.2, 1.6, 2.0), at(KHUT, 0.0, 1.3, 4.5), K(29, "Mother"), 0.004, { fov: 40, roll: 0.04 }) },
], (t, f, out, cam) => {
  const shout = f >= A(29, "Mother") - 2;
  [...BROS].forEach((s, i) => who(out, cam, 31 + i, PRIEST(s), { pose: shout ? (i === 2 ? "shout" : "stand") : "run", phase: (t * 2.2 + i * 0.3) % 1, expr: shout ? (i === 2 ? talk(t, "grin") : "grin") : "grin", t, facing: -1 }, ...runHome(i, t), { t }));
  who(out, cam, 60, C.draupadi, { pose: shout ? "hold" : "walk", prop: "garland", phase: (t * 2 % 1), expr: "smile", t }, ...add(runHome(2, t), [0.5, 0, 0.9]), { t });
}, { sunAz: 115, sunEl: 10, dof: [{ f: L29, cInf: 0 }, { f: K(29, "Mother"), cInf: 10 }] });

const L30 = K(30, "Kunti");
const KS: V3 = at(KHUT, 0.3, 0, 0.3);
shot(L30, "golden", ["village"], [
  { f: L30, s: dolly(at(KS, -0.4, 1.3, 2.7), at(KS, 0, 0.85, 0), L30, 0.003, { fov: 40 }, 0.006, K(30, "share")) },
], (t, f, out, cam) => {
  who(out, cam, 10, C.kunti, { pose: "stir", prop: "ladle", expr: f >= A(30, "share") ? talk(t, "neutral") : "neutral", look: -1, t, facing: -1 }, KS[0], KS[1], KS[2], { t });
  card(out, cam, "pot", (p) => jarShape(p, 300, 700, 140, 2.4, false), KS[0] + 0.75, KS[1], KS[2] - 0.25, { scale: 0.45, blobScale: 1.2 });
}, { sunAz: 115, sunEl: 10, dof: [{ f: L30, cInf: 12 }] });

const L31 = K(31, "Her");
const DRV: V3 = at(KHUT, 0, 0, 3.2);
shot(L31, "golden", ["village"], [
  { f: L31, s: dolly(at(KS, 0.3, 1.25, 2.4), at(KS, 0, 0.95, 0), L31, 0.004, { fov: 40, roll: -0.04 }) },
  { f: K(31, "so"), cut: true, s: dolly(at(DRV, 0, 1.8, 10.0), at(DRV, 0, 1.1, 0), K(31, "so"), 0.0035, { fov: 44 }) },
], (t, f, out, cam) => {
  if (f < K(31, "so")) {
    who(out, cam, 10, C.kunti, { pose: "armsUp", seated: true, expr: "shock", look: 1, t, facing: 1 }, KS[0], KS[1], KS[2], { t });
    card(out, cam, "pot", (p) => jarShape(p, 300, 700, 140, 2.4, false), KS[0] + 0.75, KS[1], KS[2] - 0.25, { scale: 0.45, blobScale: 1.2 });
  } else {
    const slot = (k: number) => (k - 2.5) * 0.62; // six in a row, Draupadi in slot 2 (left of centre on screen)
    who(out, cam, 60, C.draupadi, { pose: "hold", prop: "garland", expr: "neutral", t }, DRV[0] - slot(2), DRV[1], DRV[2] + 0.15, { t });
    BROS.forEach((s, i) => { const k = [0, 1, 3, 4, 5][i]; who(out, cam, 31 + i, PRIEST(s), { pose: "stand", expr: "neutral", t, facing: (k < 2 ? -1 : 1) as 1 | -1 }, DRV[0] - slot(k), DRV[1], DRV[2] - Math.abs(k - 2.5) * 0.12, { t }); });
    petals(out, t, DRV[0], DRV[2], DRV[1] + 4, 40, 5, T(A(31, "married")) - 0.8);
  }
}, { sunAz: 115, sunEl: 10, dof: [{ f: L31, cInf: 12 }, { f: K(31, "so"), cInf: 4 }] });

// ===== 32: a promise is a sent message (the pigeon) =====
const L32 = K(32, "You");
const pig = (t: number): V3 => { const u = Math.max(0, t - T(A(32, "sent"))); return at(KS, -0.2 + 1.6 * u, 1.9 + 1.5 * u + 0.4 * u * u, -0.5 - 1.2 * u); };
shot(L32, "golden", ["village"], [
  { f: L32, s: dolly(at(KS, 0.1, 1.2, 3.6), at(KS, 0.2, 2.0, 0), L32, 0.0025, { fov: 42 }) },
  { f: K(32, "There's"), dur: 30, s: (f) => ({ pos: at(KS, 0.4, 1.0, 4.8), look: pig(T(f)), fov: 46, roll: 0.03 }) },
], (t, f, out, cam) => {
  const sent = f >= A(32, "sent"), gone = f >= A(32, "unsend");
  who(out, cam, 10, C.kunti, { pose: gone ? "shrug" : sent ? "grab" : "hold", prop: sent ? null : "scroll", expr: gone ? "nervous" : sent ? "shock" : "smile", t, facing: 1 }, KS[0], KS[1], KS[2], { t });
  if (sent) { const p = pig(t); fx(out, `pigeon|${Math.floor(t * 10) % 4}`, 512, 320, (pp) => fxPigeon(pp, (Math.floor(t * 10) % 4) / 4), p[0], p[1], p[2], 0.9, 0.56); }
}, { sunAz: 115, sunEl: 10, dof: [{ f: L32, cInf: 8 }, { f: K(32, "There's"), cInf: 0 }] });

// ===== 33: every word gets kept =====
const L33 = K(33, "Bhishma's");
shot(L33, "golden", ["palace"], [
  { f: L33, s: dolly(at(BG, 0.2, 1.6, -2.2), at(BG, 0, 1.3, 0), L33, 0.004, { fov: 38, roll: 0.03 }) },
], (t, f, out, cam) => { who(out, cam, 6, C.bhishmaOld, { pose: "vow", expr: "stern", t }, BG[0], BG[1], BG[2], { t }); }, { sunAz: 160, sunEl: 8, dof: [{ f: L33, cInf: 16 }] });
shot(K(33, "Kunti's"), "golden", ["village"], [
  { f: K(33, "Kunti's"), s: dolly(at(KS, -0.2, 1.2, 2.1), at(KS, 0, 1.1, 0), K(33, "Kunti's"), 0.004, { fov: 38, roll: -0.03 }) },
], (t, f, out, cam) => { who(out, cam, 10, C.kunti, { pose: "shrug", expr: "nervous", t }, KS[0], KS[1], KS[2], { t }); }, { sunAz: 115, sunEl: 10, dof: [{ f: K(33, "Kunti's"), cInf: 12 }] });
const L33c = K(33, "even");
shot(L33c, "golden", ["hermitage"], [
  { f: L33c, s: dolly(at(GN, 0.05, 0.95, -2.5), at(GN, 0, 0.85, 0), L33c, 0.003, { fov: 40 }, 0.006, K(33, "costs")) },
], (t, f, out, cam) => {
  gn(out, cam, { write: writeT(t, 2.6), expr: "pained", look: -0.6, down: 1 }, t);
  for (let i = 0; i < 3; i++) { const ph = (t * 0.8 + i / 3) % 1; fx(out, "sweat", 128, 128, (p) => p.ell(64, 64, 18, 26, "#9fd4ff", 5), GN[0] + 0.55 + 0.1 * i, GN[1] + 1.45 - ph * 0.5, GN[2] - 0.3, 0.12, 0.12); }
}, { pose: (t, f, s) => { s.dyn.pages.scale.set(1, 1.3, 1); }, dof: [{ f: L33c, cInf: 10 }] });

// ===== 34: the wilderness, the city =====
const L34 = K(34, "The");
const CL: V3 = at(CITY, 0, 0, -8);
shot(L34, "day", ["city"], [
  { f: L34, s: dolly(at(CL, 0.5, 1.6, -6.8), at(CL, 0, 1.4, 0), L34, 0.0022, { fov: 44 }) },
  { f: K(34, "build"), cut: true, s: dolly(at(CL, 1.0, 2.0, -15), at(CL, 0, 6.5, 14), K(34, "build"), 0.0015, { fov: 50 }) },
], (t, f, out, cam) => {
  const b = f >= K(34, "build");
  [...BROS, C.kunti, C.draupadi].forEach((s, i) => who(out, cam, 31 + i, s, { pose: b ? (i < 5 ? "armsUp" : "pray") : f >= A(34, "wilderness") ? "shrug" : "stand", expr: b ? "grin" : f >= A(34, "wilderness") ? "nervous" : "neutral", t, facing: 0 }, CL[0] + (i - 3) * 0.95, CL[1], CL[2] + Math.abs(i - 3) * 0.2, { t }));
  if (b) for (let i = 0; i < 6; i++) { const ph = clamp01((t - T(A(34, "city")) - i * 0.05) / 1.2); if (ph > 0 && ph < 1) fx(out, "dust" + (i % 3), 256, 256, (p) => fxSmoke(p, i), CITY[0] - 12 + i * 5, CITY[1] + 1 + ph * 3, CITY[2] + 4, 5 * ph + 1, 5 * ph + 1, { kind: "soft" }); }
}, { pose: (t, f, s) => { const k = glide((f - A(34, "build")) / (A(34, "anyway") + 6 - A(34, "build"))); s.dyn.city.scale.set(1, Math.max(0.001, k), 1); s.dyn.city.visible = k > 0.002; }, dof: [{ f: L34, cInf: 8 }, { f: K(34, "build"), cInf: 0 }] });

// ===== 35: the fire god's indigestion =====
const L35 = K(35, "The");
const AG: V3 = at(CITY, 0, 0, 8);
let KH: [number, number, number][] | null = null; // treetops exist only once the world is built
const khandava = () => (KH && KH.length ? KH : (KH = CITY_TREES.filter(([x, , z]) => z > AG[2] + 4 && Math.hypot(x - AG[0], z - AG[2]) < 55)));
shot(L35, "night", ["city"], [
  { f: L35, s: dolly(at(AG, 1.0, 1.6, -7.5), at(AG, 0, 6.5, 12), L35, 0.002, { fov: 50 }) },
  { f: K(35, "fire"), cut: true, s: dolly(at(AG, 0.3, 1.2, -3.8), at(AG, 0, 1.75, 0), K(35, "fire"), 0.0025, { fov: 42 }) },
  { f: K(35, "Too"), cut: true, s: dolly(at(AG, -0.2, 1.65, -2.4), at(AG, 0, 1.7, 0), K(35, "Too"), 0.004, { fov: 38, roll: 0.04 }, 0.006, K(35, "ghee")) },
], (t, f, out, cam) => {
  khandava().forEach(([x, y, z], i) => {
    const a = L35 + Math.round(hh(i, 8) * 50); if (f < a) return;
    const k = pop(t, T(a), 0.5), st = Math.floor(t * 8 + i) % 6, w = 8.5 * k;
    fx(out, `fire|${st}|${i % 3}`, 512, 512, (p) => fxFire(p, st / 8, i % 3), x, y + 1.6 + w * 0.45, z, w, w, { kind: "fire" });
  });
  if (f >= L35) fx(out, "firehaloK2", 256, 256, (p) => fxHalo(p, "#ff7a2a", 0.45), AG[0], AG[1] + 9, AG[2] + 45, 80, 36, { kind: "soft" });
  if (f >= K(35, "fire")) {
    const g = f >= A(35, "ghee") - 2;
    card(out, cam, `agni|${Math.floor(t * 8) % 6}|${g}|${lidAt(t, 90)}`, (p, light) => { agni(p, { t: Math.floor(t * 8) / 8, light, expr: g ? "relief_open" : "pained", burp: g ? clamp01((f - A(35, "ghee")) / 8) : 0, blink: lidAt(t, 90) }); }, AG[0], AG[1], AG[2], { blobScale: 1.2 });
  }
}, { sunAz: 10, sunEl: 12, dof: [{ f: L35, cInf: 0 }, { f: K(35, "fire"), cInf: 12 }] });

// ===== 36: grandfather to both sides =====
const L36 = K(36, "Oh");
shot(L36, "golden", ["hermitage"], [
  { f: L36, s: dolly(at(VY, 0.15, 0.75, -2.3), at(VY, 0, 0.72, 0), L36, 0.0025, { fov: 38 }, 0.006, K(36, "dictating")) },
  { f: K(36, "grandfather"), cut: true, s: dolly(at(GN, 0.1, 0.95, -2.1), at(GN, 0, 0.92, 0), K(36, "grandfather"), 0.003, { fov: 38, roll: -0.04 }) },
  { f: END + 4, cut: true, s: dolly(at(HERM, -0.2, 1.45, -7.4), at(HERM, -0.2, 1.05, 0), END + 4, 0.003, { fov: 44 }) },
], (t, f, out, cam) => {
  const g = f >= A(36, "grandfather") - 2;
  gn(out, cam, { write: g ? 0.2 : writeT(t, 2.0), expr: g ? "shock" : "neutral", pen: !g, look: g ? 0.6 : -0.6, down: g ? 0 : 1 }, t);
  who(out, cam, 1, C.vyasa, { pose: f >= A(36, "dictating") ? "talk" : "sit", seated: true, expr: f >= END ? "smile_closed" : f >= A(36, "dictating") ? talk(t, "smile") : "smile", look: f >= END ? 0 : 0, t, facing: 1 }, VY[0], VY[1], VY[2], { t });
}, { pose: (t, f, s) => { s.dyn.pages.scale.set(1, 1.4, 1); }, dof: [{ f: L36, cInf: 12 }, { f: END + 4, cInf: 0 }] });

// ---------------- dynamic set pieces ----------------
const M4 = new THREE.Matrix4(), RZ = new THREE.Matrix4();
function poseJars(s: import("./sets").Sets, n: number, lidsOff: number, f: number) {
  for (let i = 0; i < 101; i++) {
    const p = jarPos(i), k = i < n ? Math.min(1, n - i) : 0;
    M4.makeScale(0.9 * k + 1e-4, 1.0 * k + 1e-4, 0.9 * k + 1e-4).setPosition(p[0], p[1], p[2]);
    s.dyn.jars.setMatrixAt(i, M4);
    let ly = p[1] + 0.86 * k, lx = p[0], rot = 0;
    let lz = p[2];
    if (lidsOff) { const a = i === SIS ? A(19, "one") : i === 3 ? A(19, "Out") : popAt(i); const u = Math.max(0, (f - a) / FPS); if (u > 0) { ly += 2.6 * u - 4.9 * u * u; lx += 0.5 * u; lz += 1.6 * u; rot = u * 9; } if (ly < p[1] - 0.2) ly = -50; }
    M4.makeScale(k + 1e-4, k + 1e-4, k + 1e-4).premultiply(RZ.makeRotationZ(rot)).setPosition(lx, ly, lz);
    s.dyn.lids.setMatrixAt(i, M4);
  }
  s.dyn.jars.instanceMatrix.needsUpdate = true; s.dyn.lids.instanceMatrix.needsUpdate = true;
  s.dyn.jars.visible = s.dyn.lids.visible = n > 0;
}
function poseNectar(s: import("./sets").Sets, f: number) {
  const d0 = A(23, "drinks"), d1 = A(23, "nectar") + 6;
  for (let i = 0; i < 8; i++) {
    const gone = f > d0 + ((d1 - d0) * (i + 1)) / 8, a = (i / 8) * Math.PI * 1.2 - 0.6 * Math.PI;
    M4.makeScale(gone ? 1e-4 : 0.7, gone ? 1e-4 : 0.7, gone ? 1e-4 : 0.7); M4.setPosition(NG[0] + Math.sin(a) * 1.3, NG[1] + 0.25, NG[2] + Math.cos(a) * 0.9 + 0.7);
    s.dyn.nectar.setMatrixAt(i, M4);
  }
  s.dyn.nectar.instanceMatrix.needsUpdate = true;
}
// jars stay hidden in every other shot
const hideJars = (s: import("./sets").Sets) => { s.dyn.jars.visible = s.dyn.lids.visible = false; };

// ---------------- assemble ----------------
export const SHOTS: ShotDef[] = assembleShots(defs, TOTAL);
export const XFADE = crossfades(SHOTS, 10);
export const FLASH_AT = L1;
export { shotAt };
export const layersAt = (f: number) => layersAtShots(SHOTS, XFADE, f);

// ---------------- lens ----------------
const DOFS: Dof[] = defs.flatMap((d) => d.dof ?? [{ f: d.from, cInf: 0 }]).sort((a, b) => a.f - b.f);
/** sorted DOF list, exported for the storyboard hybrid (legacy shots reuse their hand-written entries) */
export const LEGACY_DOFS = DOFS;
export const dofAt = (f: number) => dofAtList(DOFS, f);

// ---------------- impact kicks ----------------
export const KICKS: Kick[] = [
  [A(8, "vows"), 0.6], [A(13, "deer"), 0.8], [A(13, "die"), 0.7], [A(15, "calls"), 0.4], [A(15, "three"), 0.4], [A(15, "gods"), 0.4], [A(15, "twins"), 0.6],
  [A(17, "lump"), 0.8], [A(19, "Out"), 0.5], [A(19, "sister"), 0.6], [A(21, "shaking"), 0.5], [A(21, "shaking") + 9, 0.5], [A(21, "shaking") + 18, 0.6],
  [A(22, "river") - 3, 1.0], [A(23, "stronger"), 0.8], [A(25, "it"), 0.8], [A(27, "thrown"), 1.2], [A(28, "mark") + 2, 1.0], [A(31, "married"), 0.4],
  [A(35, "ghee"), 0.6], [A(36, "grandfather"), 0.7],
];
export const kickAt = (f: number) => kickAtWith(f, KICKS);
export const kickCam = (f: number, c: Cam): Cam => kickCamWith(f, c, KICKS);
export { HFLOOR };
