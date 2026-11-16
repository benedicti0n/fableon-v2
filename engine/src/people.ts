// Our own cast for the Adi Parva short, drawn with the bridge short's construction (toon.ts): superellipse bean heads,
// stick limbs with ink-dot hands, a thick-thin plum outline weighted away from the light, soft painted crescents,
// deadpan lidded eyes, no blush, no catchlights. Indian dress: dhoti, sari with pallu, angavastram stole, crowns,
// turbans, a sage's topknot, beards, blindfold. Design space 600 x 1000 units, soles at y = 975 (same as toon.ts).
import {
  Pen, INK, P2, Blob, Expr, blobPts, headBlob, thickAngle, mul, mix, shade, curve, rotPts, lerp2, rad, clamp, rnd, ellPts, rrect,
  taper, faceFront, SH_SKIN, SH_CLOTH, SH_FELT, WHITE, DEF_LIGHT, lidOf,
} from "./toon";

export type Build = "adult" | "stout" | "kid" | "big" | "elder" | "slim" | "baby";
export type Head = "crown" | "crownSmall" | "turban" | "bun" | "hair" | "long" | "bald" | "topknot" | null;
export type Spec = {
  skin: string; build?: Build;
  top?: string | null;        // upper garment (null = bare torso)
  lower?: string;             // dhoti / skirt
  sari?: string | null;       // full-length sari (women); `top` is the blouse
  border?: string;            // gold border on dhoti / sari / pallu
  drape?: string | null;      // stole across the chest (left shoulder -> right hip)
  head?: Head; hairCol?: string; crownCol?: string; turbanCol?: string;
  beard?: string | null; beardLong?: boolean; moustache?: string | null;
  necklace?: string | null; tilak?: string | null; blindfold?: string | null; blind?: boolean; flower?: string | null;
  belly?: number;             // 0..1 round belly (pregnancy, Agni, Ganesha)
  earrings?: string | null;
};
export type Pose = "stand" | "walk" | "run" | "sit" | "point" | "vow" | "pray" | "shout" | "armsUp" | "shrug" | "fold" | "bless"
  | "present" | "hold" | "belly" | "drink" | "flex" | "aim" | "shake" | "wave" | "talk" | "sneak" | "stir" | "offer" | "dust" | "chop"
  | "carry" | "throw" | "hips" | "think" | "grab";
export type PropK = null | "bow" | "bowDrawn" | "mace" | "spear" | "net" | "oar" | "laddu" | "garland" | "crown" | "jar" | "axe" | "torch"
  | "mango" | "ladle" | "scroll" | "bigbow";
export type Opts = {
  expr?: Expr; pose?: Pose; phase?: number; facing?: -1 | 0 | 1; look?: number; blink?: boolean | number; talk?: number;
  seed?: number; light?: number; prop?: PropK; t?: number; tilt?: number; headTilt?: number; seated?: boolean;
};

const BUILD: Record<Build, { a: number; torso: number; legs: number; tw: number }> = {
  adult: { a: 118, torso: 1.1, legs: 1.4, tw: 0.8 },
  slim: { a: 114, torso: 1.08, legs: 1.45, tw: 0.72 },
  stout: { a: 118, torso: 1.15, legs: 1.32, tw: 0.95 },
  big: { a: 124, torso: 1.2, legs: 1.32, tw: 1.08 },
  elder: { a: 116, torso: 1.1, legs: 1.38, tw: 0.82 },
  kid: { a: 112, torso: 0.85, legs: 1.0, tw: 0.72 },
  baby: { a: 104, torso: 0.6, legs: 0.55, tw: 0.75 },
};
export const GOLD = "#e8b53a";
export const SKINS = { light: "#f4c9a0", wheat: "#e7b07e", tan: "#c98c5c", brown: "#a8693f", dark: "#7f4b2e", fair: "#ffdcbc" };

/** two-bone arm: elbow bends away from the body (bend = side) */
const ik2 = (S: P2, Hd: P2, L1: number, L2: number, bend: number): P2 => {
  const dx = Hd[0] - S[0], dy = Hd[1] - S[1], d = clamp(Math.hypot(dx, dy), 1, L1 + L2 - 0.01);
  const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), k = Math.atan2(dy, dx) + A * bend;
  return [S[0] + L1 * Math.cos(k), S[1] + L1 * Math.sin(k)];
};

type Arm = { S: P2; E: P2; H: P2; front: boolean };

/** the full figure (front / 3-4 view). Returns where the hands ended up (for props drawn by the caller). */
export const person = (p: Pen, o: Spec, opts: Opts = {}) => {
  const { expr = "neutral", pose = "stand", phase = 0, look = 0, blink = false, light = DEF_LIGHT, facing = 0, seed = 1, prop = null,
    t = 0, tilt = 0, headTilt = 0, seated = false } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin, two = Math.PI * 2;
  let lid = lidOf(blink);
  if (o.blind) lid = 1;
  const H = headBlob(seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100, sole = 975;
  const thick = thickAngle(light), ow = 5 * u;
  const moving = pose === "walk" || pose === "run" || pose === "sneak";
  const bobA = pose === "run" ? 0.035 : pose === "walk" ? 0.02 : pose === "sneak" ? 0.012 : 0;
  const tall = (1 + Bd.torso + Bd.legs) * HH;
  const bob = bobA * tall * Math.cos(2 * two * phase);
  const sit = pose === "sit" || pose === "stir" || seated;
  const torsoBot = sit ? sole - 0.28 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hipY = torsoBot - 0.12 * HH;
  const lowerCol = o.lower ?? "#f3ead2", legSkin = mix(skin, INK, 0.45), legW = 5.8 * u, footW = 7.5 * u;
  const dress = !!o.sari;
  // ---------------- legs ----------------
  p.rot = null;
  if (sit) {
    // cross-legged: a lap of cloth with two bare feet tucked in
    const lap = ellPts(300, sole - 0.12 * HH, 0.62 * W, 0.16 * HH);
    p.gradFill(lap, dress ? o.sari! : lowerCol, mul(dress ? o.sari! : lowerCol, SH_CLOTH), light);
    p.inkRing(lap, ow * 0.9, thick);
    for (const s of [-1, 1]) p.ell(300 + s * 0.3 * W, sole - 0.1 * HH, 9 * u, 6 * u, skin, 2.4 * u);
  } else {
    const L = pose === "run" ? 95 : pose === "walk" ? 60 : pose === "sneak" ? 40 : 0;
    const stride = pose === "run" ? 0.22 : pose === "walk" ? 0.12 : 0.06;
    for (const [side, ph] of [[-1, 0], [1, 0.5]] as const) {
      const sw = moving ? Math.sin(two * (phase + ph)) : 0;
      const up = moving ? Math.max(0, sw) * L : 0;
      const hx = 300 + side * 15 * u, fx = 300 + side * 22 * u + (moving ? sw * stride * HH * 0.3 : 0), fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08];
      p.stroke(curve([hx, hipY], k, [fx, fy]), legW, legSkin);
      p.stroke([[fx - side * 3 * u, fy], [fx + side * 12 * u, fy + 0.5 * u]], footW + 3, INK);
      p.stroke([[fx - side * 3 * u, fy], [fx + side * 12 * u, fy + 0.5 * u]], footW, mix(skin, INK, 0.25));
    }
  }
  // ---------------- upper body (rotates about the hips) ----------------
  const sway = moving ? 1.4 * Math.sin(two * phase) : 0, A = tilt + sway + (pose === "run" ? 5 : 0) * (facing || 0);
  p.rot = A ? [rad(A), 300, hipY] : null;
  const tw = Bd.tw * (o.belly ? 1 + 0.25 * o.belly : 1);
  const T: Blob = { a: ((tw / 2) * W) / 1.06, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.6 + 0.6 * (o.belly ?? 0),
    egg: (o.build === "stout" || o.build === "big" ? 0.17 : 0.12) + 0.12 * (o.belly ?? 0), asym: 0.04 * facing, rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 3 * u * facing, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const L1 = 0.5 * HH, L2 = 0.52 * HH;
  const sw = moving ? Math.sin(two * phase) : 0;
  // hand targets per pose (absolute design units); front = drawn over the torso
  const hand = (side: number): { H: P2; front?: boolean } => {
    const S = sh(side), out = (x: number, y: number): P2 => [S[0] + side * x * HH, S[1] + y * HH];
    const wob = Math.sin(t * 9 + side) * 0.03;
    switch (pose) {
      case "walk": case "run": { const k = pose === "run" ? 0.3 : 0.16; return { H: out(0.18 + k * 0.4 * side * sw, 0.88 - (pose === "run" ? 0.25 : 0) - Math.abs(sw) * k * 0.3) }; }
      case "sneak": return { H: out(0.3, 0.3 + 0.05 * side * sw) };
      case "point": return side > 0 ? { H: out(0.92, -0.08) } : { H: out(0.15, 0.9) };
      case "vow": return side > 0 ? { H: out(0.2, -0.86) } : { H: [tcx + 10 * u, chin + 0.45 * HH], front: true };
      case "pray": return { H: [tcx + side * 5 * u, chin + 0.4 * HH], front: true };
      case "shout": return { H: [tcx + side * 30 * u + 22 * u * (facing || 0), chin - 0.02 * HH], front: true };
      case "armsUp": return { H: out(0.38, -0.78 + wob) };
      case "shrug": return { H: out(0.55, 0.38) };
      case "fold": return { H: [tcx - side * 0.55 * T.a, chin + 0.55 * HH], front: true };
      case "bless": return side > 0 ? { H: out(0.62, -0.25) } : { H: out(0.15, 0.9) };
      case "present": return { H: [S[0] + (facing || 1) * (0.55 + (side === (facing || 1) ? 0.3 : 0)) * HH, S[1] + 0.32 * HH] };
      case "hold": case "carry": case "offer": return { H: [tcx + side * 24 * u + (pose === "offer" ? 0.35 * HH * (facing || 1) : 0), chin + (pose === "carry" ? 0.5 : 0.55) * HH], front: true };
      case "belly": return { H: [tcx + side * 0.45 * T.a, torsoBot - 0.3 * HH], front: true };
      case "drink": return side > 0 ? { H: [tcx + 14 * u, chin + 0.02 * HH], front: true } : { H: out(0.15, 0.9) };
      case "flex": return { H: out(0.42, -0.42) };
      case "aim": return side < 0 ? { H: out(0.72, 0.02) } : { H: [tcx + 18 * u, chin + 0.22 * HH], front: true };
      case "shake": return { H: out(0.55 + 0.06 * Math.sin(t * 40), 0.22 + 0.05 * Math.sin(t * 40 + 1)) };
      case "wave": return side > 0 ? { H: out(0.45 + 0.12 * Math.sin(t * 12), -0.6) } : { H: out(0.15, 0.9) };
      case "talk": return side > 0 ? { H: out(0.42 + 0.06 * Math.sin(t * 6), 0.42 - 0.05 * Math.sin(t * 6)) } : { H: out(0.15, 0.9) };
      case "stir": return side > 0 ? { H: [tcx + 0.5 * HH + 0.08 * HH * Math.cos(t * 5), torsoBot + 0.05 * HH + 0.03 * HH * Math.sin(t * 5)], front: true } : { H: out(0.2, 0.75) };
      case "dust": return { H: [tcx + side * (8 + 6 * Math.sin(t * 20)) * u, chin + 0.62 * HH], front: true };
      case "chop": { const k = 0.5 + 0.5 * Math.sin(t * 7); return { H: [tcx + 0.4 * HH * (facing || 1), chin + (-0.7 + 1.1 * k) * HH], front: true }; }
      case "throw": return side > 0 ? { H: out(0.7, -0.55) } : { H: out(0.5, 0.1) };
      case "hips": return { H: [tcx + side * 1.15 * T.a, torsoBot - 0.2 * HH] };
      case "think": return side > 0 ? { H: [tcx + 26 * u, chin - 0.02 * HH], front: true } : { H: [tcx - 0.2 * T.a, chin + 0.5 * HH], front: true };
      case "grab": return { H: out(0.62, -0.3 + 0.05 * Math.sin(t * 15 + side)) };
      case "sit": return { H: [tcx + side * (1.15 * T.a + 6 * u), torsoBot + 0.02 * HH] };
      default: return { H: out(0.14 + 0.02 * side * sw, 0.9) };
    }
  };
  const arms: Arm[] = [-1, 1].map((side) => {
    const S = sh(side), h = hand(side);
    return { S, E: ik2(S, h.H, L1, L2, side > 0 ? 1 : -1), H: h.H, front: !!h.front };
  });
  const armCol = (o.top && o.top !== "none") ? mix(skin, INK, 0.45) : mix(skin, INK, 0.45);
  const drawArm = (a: Arm) => {
    const m: P2 = lerp2(a.E, lerp2(a.S, a.H, 0.5), 0.35);
    p.stroke(curve(a.S, m, a.H), 5.2 * u, armCol);
    p.stroke([a.S, lerp2(a.S, a.E, 0.35)], 7.5 * u, o.top ? mix(o.top, INK, 0.15) : armCol); // sleeve stub / shoulder
    p.dot(a.H[0], a.H[1], 5.5 * u);
  };
  // props behind the body
  const L = arms[0], R = arms[1];
  if (prop === "bow" || prop === "bowDrawn" || prop === "bigbow") drawBow(p, L.H, u, prop === "bowDrawn" || pose === "aim" ? R.H : null, prop === "bigbow" ? 1.6 : 1);
  if (prop === "mace") { p.band([[R.H[0], R.H[1]], [R.H[0] + 30 * u, R.H[1] - 0.9 * HH]], "#8a5a34", 6 * u, 1.6 * u, "round"); p.ell(R.H[0] + 34 * u, R.H[1] - 1.0 * HH, 26 * u, 26 * u, GOLD, 3 * u); p.ell(R.H[0] + 28 * u, R.H[1] - 1.06 * HH, 8 * u, 6 * u, "#fff3c0", 0); }
  if (prop === "spear") { p.band([[R.H[0], R.H[1] + 0.6 * HH], [R.H[0], R.H[1] - 1.3 * HH]], "#8a5a34", 4 * u, 1.4 * u, "round"); p.poly([[R.H[0] - 8 * u, R.H[1] - 1.3 * HH], [R.H[0] + 8 * u, R.H[1] - 1.3 * HH], [R.H[0], R.H[1] - 1.55 * HH]], "#c9ccd2", 2.4 * u); }
  if (prop === "oar") { p.band([[R.H[0] - 0.2 * HH, R.H[1] - 0.6 * HH], [R.H[0] + 0.5 * HH, R.H[1] + 1.2 * HH]], "#9a6a3e", 5 * u, 1.5 * u, "round"); }
  if (prop === "torch") { p.band([[R.H[0], R.H[1] + 0.2 * HH], [R.H[0] + 6 * u, R.H[1] - 0.55 * HH]], "#7a4b2a", 5 * u, 1.5 * u, "round"); flame(p, R.H[0] + 7 * u, R.H[1] - 0.6 * HH, 0.55 * u, t); }
  for (const a of arms) if (!a.front) drawArm(a);
  if (o.head === "long") { // hair falls behind the shoulders, drawn before the body
    const hb = blobPts(300, hc + 0.42 * HH, { ...H, a: H.a * 1.08, b: H.b * 1.45, egg: 0.3, asym: 0, seed: seed + 3 });
    p.shadedFill(hb, o.hairCol ?? "#2a1a1e", mul(o.hairCol ?? "#2a1a1e", SH_FELT), light, H.a); p.inkRing(hb, ow * 0.85, thick);
  }
  // ---------------- torso / sari ----------------
  if (dress && !sit) {
    const D: Blob = { a: 0.5 * W * 0.98, b: 0.5 * ((sole - 0.02 * HH) - (chin + 0.3 * HH)), nTop: 2.0, nBot: 3.2, egg: 0.3, asym: 0.03 * facing, rot: 0, noise: 0.006, seed: seed + 9 };
    const dp = blobPts(300, sole - 0.02 * HH - D.b, D);
    p.gradFill(dp, o.sari!, mul(o.sari!, SH_CLOTH), light);
    if (o.border) p.clip(dp, () => p.band([[300 - 0.6 * W, sole - 0.1 * HH], [300 + 0.6 * W, sole - 0.1 * HH]], o.border!, 0.09 * HH, 0));
    p.inkRing(dp, ow, thick);
    if (o.belly) { const bp = ellPts(300 + 14 * u * (facing || 0), torsoBot - 0.02 * HH, 0.36 * W * o.belly + 0.1 * W, 0.34 * HH * o.belly + 0.05 * HH); p.shadedFill(bp, o.sari!, mul(o.sari!, SH_CLOTH), light, 0.4 * W, 0.4); p.inkRing(bp, ow * 0.9, thick); }
  }
  if (!dress && !sit) {
    // dhoti: a wrap from the waist to mid-calf, pleat lines down the front
    const yb = torsoBot - 0.1 * HH, ye = sole - 0.42 * Bd.legs * HH + bob * 0.5, wb = 0.52 * T.a * 1.06, we = 0.62 * T.a;
    const dh: P2[] = [[300 - wb, yb], [300 + wb, yb], [300 + we, ye], [300 + 0.1 * we, ye - 0.08 * HH], [300 - 0.1 * we, ye - 0.08 * HH], [300 - we, ye]];
    p.gradFill(dh, lowerCol, mul(lowerCol, SH_CLOTH), light);
    if (o.border) p.clip(dh, () => { p.band([[300 - we * 1.2, ye - 4 * u], [300 + we * 1.2, ye - 4 * u]], o.border!, 5 * u, 0); });
    p.stroke([[300 + 4 * u, yb + 0.1 * HH], [300 + 2 * u, ye - 0.1 * HH]], 2 * u, mix(lowerCol, INK, 0.45));
    p.poly(dh, null, ow * 0.8);
  }
  // upper body
  const topCol = o.top ?? skin;
  if (o.belly && o.belly > 0.3) p.shadedFill(tp, topCol, mul(topCol, o.top ? SH_CLOTH : SH_SKIN), light, T.a, 0.45);
  else p.gradFill(tp, topCol, mul(topCol, o.top ? SH_CLOTH : SH_SKIN), light);
  p.clip(tp, () => {
    if (o.top && !dress && o.build !== "kid") p.stroke([[tcx + 2 * u * facing, chin + 0.05 * HH], [tcx + 2 * u * facing, chin + 0.4 * HH]], 2 * u, mix(o.top, INK, 0.4));
    if (dress && o.top) {
      // bare midriff under a short blouse, then the pallu over the left shoulder
      p.poly([[tcx - 1.2 * T.a, torsoBot - 0.42 * HH], [tcx + 1.2 * T.a, torsoBot - 0.42 * HH], [tcx + 1.2 * T.a, torsoBot + 0.2 * HH], [tcx - 1.2 * T.a, torsoBot + 0.2 * HH]], skin, 0);
      p.band([[tcx - 0.9 * T.a, chin - 0.05 * HH], [tcx + 1.1 * T.a, torsoBot + 0.05 * HH]], o.sari!, 0.34 * HH, 1.8 * u);
      if (o.border) p.band([[tcx - 0.9 * T.a + 0.12 * HH, chin - 0.05 * HH], [tcx + 1.1 * T.a + 0.12 * HH, torsoBot + 0.05 * HH]], o.border, 0.05 * HH, 0);
    }
    if (o.drape) {
      p.band([[tcx - 0.95 * T.a, chin - 0.02 * HH], [tcx + 1.0 * T.a, torsoBot - 0.05 * HH]], o.drape, 0.16 * HH, 1.6 * u);
      if (o.border) p.band([[tcx - 0.95 * T.a, chin + 0.06 * HH], [tcx + 1.0 * T.a, torsoBot + 0.03 * HH]], o.border, 0.03 * HH, 0);
    }
    if (o.necklace) { for (let i = 0; i <= 8; i++) { const a = rad(200 + (140 * i) / 8); p.dot(tcx + 0.55 * T.a * Math.cos(a) * -1, chin + 0.02 * HH - 0.28 * HH * Math.sin(a), 3.2 * u, o.necklace); } }
    if (!dress && !o.top) p.arc(tcx, chin + 0.05 * HH, 0.32 * T.a, 0.1 * HH, 20, 160, 1.8 * u, mix(skin, INK, 0.35)); // collarbone tick on bare torsos
  });
  p.inkRing(tp, ow, thick);
  for (const a of arms) if (a.front) drawArm(a);
  // props in front
  if (prop === "laddu") { p.ell(R.H[0] + 6 * u, R.H[1] - 10 * u, 13 * u, 12 * u, "#f0a43a", 2.6 * u); for (const [dx, dy] of [[-4, -14], [5, -8], [0, -4]]) p.dot(R.H[0] + (6 + dx) * u, R.H[1] + (dy) * u, 1.6 * u, "#c46d1e"); p.dot(R.H[0], R.H[1], 5.5 * u); }
  if (prop === "mango") { p.ell(R.H[0] + 4 * u, R.H[1] - 10 * u, 11 * u, 14 * u, "#f2b632", 2.4 * u, 0, 360, 20); p.dot(R.H[0], R.H[1], 5.5 * u); }
  if (prop === "garland") garland(p, (L.H[0] + R.H[0]) / 2, Math.max(L.H[1], R.H[1]) + 6 * u, 0.42 * HH, u);
  if (prop === "crown") { const cx = (L.H[0] + R.H[0]) / 2, cy = (L.H[1] + R.H[1]) / 2 - 6 * u; crownShape(p, cx, cy, 52 * u, 46 * u, o.crownCol ?? GOLD, u); }
  if (prop === "jar") { const cx = (L.H[0] + R.H[0]) / 2, cy = (L.H[1] + R.H[1]) / 2 + 8 * u; jarShape(p, cx, cy, 30 * u, u); }
  if (prop === "net") { const cx = (L.H[0] + R.H[0]) / 2; for (let i = 0; i < 5; i++) p.stroke([[cx - 30 * u + i * 15 * u, R.H[1]], [cx - 36 * u + i * 18 * u, R.H[1] + 0.5 * HH]], 1.6 * u); for (let j = 1; j < 4; j++) p.stroke([[cx - 32 * u - j * 2 * u, R.H[1] + j * 0.12 * HH], [cx + 32 * u + j * 2 * u, R.H[1] + j * 0.12 * HH]], 1.6 * u); }
  if (prop === "axe") { const [hx, hy] = R.H; p.band([[hx, hy + 0.15 * HH], [hx, hy - 0.5 * HH]], "#8a5a34", 5 * u, 1.5 * u, "round"); p.poly([[hx, hy - 0.5 * HH], [hx + 28 * u, hy - 0.6 * HH], [hx + 26 * u, hy - 0.3 * HH], [hx, hy - 0.36 * HH]], "#9aa2ab", 2.4 * u); }
  if (prop === "ladle") { const [hx, hy] = R.H; p.band([[hx, hy], [hx - 4 * u, hy + 0.35 * HH]], "#8a5a34", 4 * u, 1.3 * u, "round"); }
  if (prop === "scroll") { const [hx, hy] = R.H; p.poly(rrect(hx - 8 * u, hy - 30 * u, hx + 8 * u, hy + 4 * u, 4 * u), "#f2deb0", 2.2 * u); }
  // ---------------- head ----------------
  const [cpx, cpy] = rotPts([[300, chin]], rad(A), 300, hipY)[0];
  const Ah = A + headTilt;
  p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
  const hp = blobPts(300, hc, H);
  if (o.head === "bun" || o.head === "topknot") { const r = o.head === "bun" ? 0.32 : 0.2; p.ell(300 + 4 * u * facing, crown + 0.02 * HH, r * W * 0.55, r * HH * 0.6, o.hairCol ?? "#2a1a1e", ow * 0.8); }
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  if (o.earrings) for (const s of [-1, 1]) p.dot(300 + s * 0.98 * H.a, hc + 0.3 * H.b, 5 * u, o.earrings);
  p.inkRing(hp, ow, thick);
  hair(p, o, hp, H, hc, crown, light, u, ow, facing);
  const brim = o.head === "crown" || o.head === "turban" || o.head === "crownSmall";
  if (o.beard) {
    // beard below the mouth line: from cheek to cheek, long ones reach the chest
    const by = hc + 0.32 * H.b, bl = o.beardLong ? 0.85 * HH : 0.3 * HH, bx = 0.74 * H.a;
    const bp: P2[] = [];
    for (let i = 0; i <= 16; i++) { const a = rad(180 * i / 16); bp.push([300 + 7 * u * facing + bx * Math.cos(a), by + (bl * 0.55 + 0.45 * bl * Math.sin(a)) * Math.sin(a) * (0.6 + 0.4 * Math.sin(a))]); }
    p.shadedFill(bp, o.beard, mul(o.beard, SH_FELT), light, bx, 0.4);
    p.poly(bp, null, ow * 0.8);
    for (let i = -1; i <= 1; i++) p.stroke([[300 + i * 18 * u, by + 0.22 * bl], [300 + i * 22 * u, by + 0.7 * bl]], 1.8 * u, mix(o.beard, INK, 0.35));
  }
  faceFront(p, 300, hc, W, o.blindfold ? "neutral" : expr, facing, look, lid, brim, skin, o.moustache ?? undefined, o.build === "stout" || o.build === "big");
  if (o.beard) { // redraw the mouth over the beard
    const mx = 300 + 8 * u * facing, my = hc + 20 * u;
    if (expr === "shock") p.ell(mx, my + 2 * u, 8 * u, 10 * u, "#5a1e28", 3 * u); else p.stroke([[mx - 7 * u, my], [mx + 7 * u, my]], 3.6 * u);
  }
  if (o.blindfold) {
    p.band([[300 - 1.02 * H.a, hc - 2 * u], [300 + 1.02 * H.a, hc - 4 * u]], o.blindfold, 0.16 * HH, 1.8 * u);
    const F = expr === "shock" ? "O" : expr === "smile" || expr === "grin" ? "smile" : expr === "stern" ? "frown" : "dash";
    const mx = 300 + 8 * u * facing, my = hc + 20 * u;
    if (F === "O") p.ell(mx, my + 2 * u, 8 * u, 9 * u, "#5a1e28", 3 * u); else if (F === "smile") p.arc(mx, my - 3 * u, 8 * u, 4.5 * u, 20, 160, 4 * u); else if (F === "frown") p.arc(mx, my + 3 * u, 6.5 * u, 3.5 * u, 200, 340, 4 * u);
  }
  if (o.tilak) p.poly([[300 + 7 * u * facing - 2.2 * u, hc - 34 * u], [300 + 7 * u * facing + 2.2 * u, hc - 34 * u], [300 + 7 * u * facing, hc - 24 * u]], o.tilak, 0);
  if (o.flower) for (let i = 0; i < 5; i++) { const a = rad(72 * i); p.ell(300 - 0.85 * H.a + 9 * u * Math.cos(a), hc - 0.55 * H.b + 9 * u * Math.sin(a), 6 * u, 6 * u, o.flower, 1.5 * u); }
  headwear(p, o, H, hc, crown, light, u, ow, facing);
  p.rot = null;
  return { L: L.H, R: R.H, hc, chin, crown, u, HH };
};

const hair = (p: Pen, o: Spec, hp: P2[], H: Blob, hc: number, crown: number, light: number, u: number, ow: number, facing: number) => {
  if (!o.head || o.head === "bald" || o.head === "turban") return;
  const col = o.hairCol ?? "#2a1a1e", HH = 2 * H.b;
  const cut = crown + (o.head === "crown" || o.head === "crownSmall" ? 0.36 : o.head === "bun" || o.head === "topknot" ? 0.3 : 0.4) * HH;
  const keep = (x: number, y: number) => y < cut;
  const n = hp.length, startIdx = Math.max(0, hp.findIndex(([x, y], i) => keep(x, y) && !keep(hp[(i + n - 1) % n][0], hp[(i + n - 1) % n][1])));
  const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([x, y]) => keep(x, y)).map(([x, y]) => [300 + (x - 300) * 1.03, hc + (y - hc) * 1.03] as P2);
  if (arc.length < 3) return;
  const [x0, y0] = arc[arc.length - 1], [x1, y1] = arc[0];
  for (let i = 1; i < 6; i++) arc.push([x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6 + (i % 2 ? 4 * u : 0)]);
  p.shadedFill(arc, col, mul(col, SH_FELT), light, H.a, 0.35);
  p.poly(arc, null, ow);
  if (o.head === "long" || o.head === "hair") p.stroke([[300 + (facing || 1) * 6 * u, cut - 30 * u], [300 + (facing || 1) * 1 * u, cut - 10 * u]], 1.4 * u);
};

export const crownShape = (p: Pen, cx: number, yb: number, w: number, h: number, col: string, u: number) => {
  // a tiered mukuta: band, three rising points, a tall centre spire with a jewel
  const pts: P2[] = [[cx - w, yb], [cx - w * 0.92, yb - h * 0.55], [cx - w * 0.6, yb - h * 0.4], [cx - w * 0.42, yb - h * 0.85], [cx - w * 0.2, yb - h * 0.6],
    [cx, yb - h * 1.3], [cx + w * 0.2, yb - h * 0.6], [cx + w * 0.42, yb - h * 0.85], [cx + w * 0.6, yb - h * 0.4], [cx + w * 0.92, yb - h * 0.55], [cx + w, yb]];
  p.gradFill(pts, col, mul(col, [0.72, 0.66, 0.6]), rad(-120));
  p.band([[cx - w, yb - h * 0.12], [cx + w, yb - h * 0.12]], mul(col, [0.85, 0.8, 0.75]), h * 0.16, 1.2 * u);
  p.poly(pts, null, 4 * u);
  p.ell(cx, yb - h * 0.55, 7 * u, 8 * u, "#d8343c", 2.2 * u);
  for (const s of [-1, 1]) p.ell(cx + s * w * 0.55, yb - h * 0.12, 4.5 * u, 4.5 * u, "#2f8a6a", 1.6 * u);
};

const headwear = (p: Pen, o: Spec, H: Blob, hc: number, crown: number, light: number, u: number, ow: number, facing: number) => {
  const HH = 2 * H.b, W = 2 * H.a;
  if (o.head === "crown") crownShape(p, 300 + 2 * u * facing, crown + 0.3 * HH, 0.4 * W, 0.42 * HH, o.crownCol ?? GOLD, u);
  if (o.head === "crownSmall") crownShape(p, 300 + 2 * u * facing, crown + 0.27 * HH, 0.3 * W, 0.26 * HH, o.crownCol ?? GOLD, u);
  if (o.head === "turban") {
    const col = o.turbanCol ?? "#e8e0c8", yb = crown + 0.36 * HH;
    const tb: P2[] = blobPts(300 + 3 * u * facing, yb - 0.2 * HH, { a: 0.56 * W, b: 0.28 * HH, nTop: 2.0, nBot: 3.2, egg: -0.1, asym: 0.05 * facing, rot: 0, noise: 0.01, seed: 5 });
    p.shadedFill(tb, col, mul(col, SH_CLOTH), light, 0.5 * W);
    p.clip(tb, () => { for (let i = 0; i < 3; i++) p.stroke([[300 - 0.6 * W, yb - (0.08 + 0.12 * i) * HH + 10 * u], [300 + 0.6 * W, yb - (0.14 + 0.12 * i) * HH - 6 * u]], 2.2 * u, mix(col, INK, 0.4)); });
    p.poly(tb, null, ow);
    p.ell(300 + 3 * u * facing, yb - 0.3 * HH, 6 * u, 6 * u, "#d8343c", 1.8 * u);
  }
};

/** a big recurve bow held at `g` (vertical), string pulled to `pull` if given */
export const drawBow = (p: Pen, g: P2, u: number, pull: P2 | null, k = 1) => {
  const h = 150 * u * k, top: P2 = [g[0] + 10 * u, g[1] - h], bot: P2 = [g[0] + 10 * u, g[1] + h];
  const bowPts = curve(top, [g[0] - 32 * u * k, g[1]], bot, 18);
  p.stroke(bowPts, 12 * u, INK); p.stroke(bowPts, 7 * u, "#8a4f2a");
  const s = pull ?? [g[0] + 14 * u, g[1]];
  p.stroke([top, s, bot], 1.6 * u, "#f5ecd8");
  if (pull) { p.stroke([[pull[0] + 8 * u, pull[1]], [g[0] - 40 * u, g[1]]], 3 * u, "#7a4b2a"); p.poly([[g[0] - 40 * u, g[1] - 7 * u], [g[0] - 40 * u, g[1] + 7 * u], [g[0] - 58 * u, g[1]]], "#c9ccd2", 1.6 * u); }
};
export const garland = (p: Pen, cx: number, cy: number, r: number, u: number) => {
  const pts: P2[] = [];
  for (let i = 0; i <= 24; i++) { const a = rad(180 * i / 24); pts.push([cx - r * 0.62 * Math.cos(a), cy - r * 0.35 + r * 0.95 * Math.sin(a)]); }
  p.stroke(pts, 15 * u, INK); p.stroke(pts, 11 * u, "#f29a1b");
  for (let i = 1; i < 24; i += 2) { const [x, y] = pts[i]; p.dot(x, y, 3.2 * u, i % 4 === 1 ? "#ffd84a" : "#d8343c"); }
};
export const jarShape = (p: Pen, cx: number, cy: number, r: number, u: number, lid = true) => {
  const pts = ellPts(cx, cy, r, r * 0.9);
  p.shadedFill(pts, "#c8774a", "#9a5534", rad(-120), r);
  p.poly(pts, null, 3 * u);
  p.poly(rrect(cx - 0.55 * r, cy - 1.15 * r, cx + 0.55 * r, cy - 0.8 * r, 3 * u), "#b4673e", 3 * u);
  if (lid) p.ell(cx, cy - 1.15 * r, 0.62 * r, 0.16 * r, "#f2dea0", 2.4 * u);
  p.arc(cx, cy, r * 0.9, r * 0.3, 20, 160, 2 * u, "#f0b07a");
};
/** a cartoon flame (y = base), flickering with t */
export const flame = (p: Pen, x: number, y: number, s: number, t: number, seed = 0, ink = true) => {
  const f = (k: number) => Math.sin(t * 11 + seed * 3 + k) * 0.12;
  const out: P2[] = [[x - 40 * s, y], [x - 46 * s, y - 50 * s], [x - 20 * s, y - 90 * s * (1 + f(1))], [x - 8 * s, y - 60 * s], [x + 6 * s, y - 140 * s * (1 + f(2))],
    [x + 26 * s, y - 70 * s], [x + 40 * s, y - 100 * s * (1 + f(3))], [x + 48 * s, y - 40 * s], [x + 40 * s, y]];
  p.poly(out, "#ff8a1f", ink ? 5 * s : 0);
  p.poly(out.map(([a, b]) => [x + (a - x) * 0.55, y + (b - y) * 0.6] as P2), "#ffd23a", 0);
};

// ---------------- special characters ----------------
const GANESHA_SKIN = "#f2b49c";
/** Ganesha seated cross-legged, writing: elephant head, big ears, trunk, one tusk, tall crown, round belly.
 *  write = 0..1 hand stroke phase, puzzled -> stops writing and scratches his head with the trunk curled up */
export const ganesha = (p: Pen, opts: { expr?: Expr; write?: number; blink?: number; puzzled?: number; light?: number; look?: number; ear?: number; pen?: boolean; tired?: boolean; down?: number }) => {
  const { expr = "neutral", write = 0, blink = 0, puzzled = 0, light = DEF_LIGHT, look = 0, ear = 0, pen = true, down = 0 } = opts;
  const u = 2.36, sole = 975, thick = thickAngle(light), ow = 5 * u;
  const skin = GANESHA_SKIN;
  // lap + feet
  const lap = ellPts(300, sole - 30, 190, 42);
  p.gradFill(lap, "#f2c230", mul("#f2c230", SH_CLOTH), light); p.inkRing(lap, ow * 0.9, thick);
  for (const s of [-1, 1]) p.ell(300 + s * 120, sole - 26, 22, 14, skin, 2.4 * u);
  // belly / torso
  const T: Blob = { a: 150, b: 165, nTop: 2.2, nBot: 2.8, egg: 0.25, asym: 0, rot: 0, noise: 0.005, seed: 21 };
  const tp = blobPts(300, sole - 200, T);
  p.shadedFill(tp, skin, mul(skin, SH_SKIN), light, 150, 0.45);
  p.clip(tp, () => {
    p.band([[300 - 170, 690], [300 + 170, 860]], "#d8402e", 34, 2 * u);
    p.band([[300 - 170, 700], [300 + 170, 870]], GOLD, 6, 0);
    for (let i = 0; i <= 8; i++) { const a = rad(200 + (140 * i) / 8); p.dot(300 - 80 * Math.cos(a), 650 - 60 * Math.sin(a), 7, GOLD); }
    p.arc(300, 850, 18, 10, 20, 160, 4, mul(skin, [0.8, 0.7, 0.7])); // navel
  });
  p.inkRing(tp, ow, thick);
  // arms: left holds palm leaves, right writes with a stylus
  const S1: P2 = [180, 650], S2: P2 = [420, 650];
  const LH: P2 = [215, 850];
  const wk = Math.sin(write * Math.PI * 2);
  const RH: P2 = puzzled > 0.5 ? [430, 560] : [395 + 26 * wk, 852 + 6 * Math.cos(write * Math.PI * 4)];
  const armC = mix(skin, INK, 0.4);
  for (const [S, Hd, s] of [[S1, LH, -1], [S2, RH, 1]] as const) {
    const E = ik2(S, Hd, 120, 125, s);
    p.stroke(curve(S, lerp2(E, lerp2(S, Hd, 0.5), 0.35), Hd), 14, armC);
    p.dot(Hd[0], Hd[1], 14);
    p.ell(E[0], E[1] - 4, 10, 6, GOLD, 2); // arm band
  }
  // palm-leaf page in the left hand
  p.poly([[LH[0] - 90, LH[1] - 20], [LH[0] + 120, LH[1] - 38], [LH[0] + 124, LH[1] - 4], [LH[0] - 86, LH[1] + 14]], "#e9d39a", 2.4 * u);
  for (let i = 0; i < 3; i++) p.stroke([[LH[0] - 70, LH[1] - 10 + i * 8 - i * 2], [LH[0] - 70 + 160 * clamp(write * 3 - i, 0.15, 1), LH[1] - 10 - 22 * clamp(write * 3 - i, 0.15, 1) + i * 8]], 2.2, "#5a3a2a");
  if (pen && puzzled <= 0.5) p.band([[RH[0], RH[1]], [RH[0] + 26, RH[1] - 60]], "#f0e6d0", 6, 2, "round");
  // head: big ears behind, head dome, trunk, tusks, crown
  const hc = 468, ew = 140 * (1 + 0.03 * ear), eh = 165;
  for (const s of [-1, 1]) {
    const ep = blobPts(300 + s * 175, hc + 20, { a: ew * 0.62, b: eh * 0.62, nTop: 2.2, nBot: 2.4, egg: 0.2, asym: 0, rot: rad(s * (12 + 4 * ear)), noise: 0.01, seed: 30 + s });
    p.shadedFill(ep, skin, mul(skin, [0.86, 0.74, 0.74]), light, ew * 0.6);
    p.inkRing(ep, ow, thick);
    p.clip(ep, () => p.ell(300 + s * 185, hc + 30, ew * 0.38, eh * 0.38, "#f7c9b6", 0));
  }
  const H: Blob = { a: 135, b: 128, nTop: 1.9, nBot: 2.2, egg: -0.05, asym: 0, rot: 0, noise: 0.006, seed: 7 };
  const hp = blobPts(300, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, 135);
  p.inkRing(hp, ow, thick);
  // trunk: curls down to the side (curls up to the head when puzzled)
  const trunk: P2[] = puzzled > 0.5
    ? curve([300, hc + 40], [370, hc + 40], [380, hc - 60], 14)
    : [...curve([300, hc + 40], [292, hc + 170], [250, hc + 205], 12), ...curve([250, hc + 205], [228, hc + 215], [222, hc + 190], 6).slice(1)];
  p.line(trunk, skin, 44);
  for (let i = 2; i < trunk.length - 2; i += 2) { const [x, y] = trunk[i]; p.stroke([[x - 14, y], [x + 14, y + 2]], 2.4, mul(skin, [0.75, 0.62, 0.62])); }
  // tusks: left whole, right broken short
  p.poly([[262, hc + 70], [276, hc + 72], [252, hc + 118], [244, hc + 112]], "#fbf6e8", 2.4 * u);
  p.poly([[324, hc + 72], [338, hc + 70], [340, hc + 92], [330, hc + 92]], "#fbf6e8", 2.4 * u);
  // eyes + brows (puzzled: one brow up)
  const lid = blink >= 1 ? 1 : blink > 0 ? 0.5 : 0;
  for (const s of [-1, 1]) {
    const x = 300 + s * 50 + look * 6, y = hc - 6 + down * 7;
    if (lid >= 1 || expr === "smile_closed" || expr === "grin") p.arc(x, y + 6, 12, 8, 200, 340, 6);
    else if (expr === "shock") { p.ell(x, y, 17, 17, WHITE, 5); p.dot(x, y + 2, 5); }
    else { p.ell(x, y, 7, lid ? 4 : 9, INK, 0); }
    const by = y - 34 + (puzzled > 0.5 && s > 0 ? -12 : 0) + (puzzled > 0.5 && s < 0 ? 6 : 0);
    taper(p, [x - s * 16, by + (expr === "stern" ? 5 : expr === "pained" ? -4 : -2)], [x + s * 16, by + (expr === "pained" ? 3 : 0)], 9, 5);
  }
  // mouth peeks out under the trunk on one side
  if (expr === "grin" || expr === "laugh") p.arc(345, hc + 70, 18, 10, 20, 160, 5);
  else if (expr === "shock") p.ell(340, hc + 74, 10, 12, "#5a1e28", 4);
  else p.stroke([[332, hc + 70], [352, hc + 66]], 5);
  p.poly([[300 - 4, hc - 70], [300 + 4, hc - 70], [300, hc - 48]], "#d8343c", 0); // tilak
  crownShape(p, 300, hc - 95, 100, 120, GOLD, u);
  return { RH, LH };
};

/** Agni, the fire god: red skin, flame hair, a round belly he is holding (indigestion) */
export const agni = (p: Pen, opts: { expr?: Expr; t?: number; light?: number; blink?: number; burp?: number; pose?: Pose }) => {
  const { expr = "pained", t = 0, light = DEF_LIGHT, blink = 0, burp = 0, pose = "belly" } = opts;
  // hair of flames drawn behind the head, then the person on top
  const r = person(p, { skin: "#e0533a", build: "stout", top: null, lower: "#f2c230", border: "#d8402e", drape: "#ffb02e", necklace: GOLD, head: "bald", belly: 0.9, earrings: GOLD },
    { expr, pose, t, light, blink, facing: 0, seed: 11 });
  const u = r.u;
  for (let i = -3; i <= 3; i++) flame(p, 300 + i * 22 * u, r.crown + 0.12 * r.HH, (0.5 + 0.18 * (3 - Math.abs(i)) / 3) * u, t, i);
  if (burp > 0) for (let i = 0; i < 3; i++) p.ell(300 + 38 * u + i * 14 * u * burp, r.hc + 6 * u - i * 26 * u * burp, (5 + 3 * i) * u * burp, (5 + 3 * i) * u * burp, "#9a9aa6", 2 * u);
  return r;
};

/** stag, side view facing screen-right, on a 1000 x 700 canvas; legs cycle with phase */
export const deer = (p: Pen, opts: { phase?: number; expr?: "neutral" | "shock"; light?: number; graze?: number }) => {
  const { phase = 0, expr = "neutral", light = DEF_LIGHT, graze = 0 } = opts;
  const body = "#b9773f", belly = "#f2dcc0", thick = thickAngle(light);
  for (const [x, ph, far] of [[380, 0, true], [640, 0.5, true], [400, 0.5, false], [660, 0, false]] as const) {
    const s = Math.sin(Math.PI * 2 * (phase + ph)) * 30;
    p.stroke(curve([x, 430], [x + s * 0.4, 540], [x + s, 660]), 18, far ? mix(body, INK, 0.55) : mix(body, INK, 0.35));
    p.dot(x + s, 662, 11);
  }
  const bp = blobPts(520, 400, { a: 210, b: 95, nTop: 2.2, nBot: 2.4, egg: 0, asym: 0.05, rot: rad(-3), noise: 0.006, seed: 3 });
  p.shadedFill(bp, body, mul(body, SH_CLOTH), light, 210);
  p.clip(bp, () => { p.ell(520, 470, 190, 40, belly, 0); for (const [x, y] of [[440, 360], [500, 345], [560, 365], [610, 340], [470, 395], [590, 390]]) p.ell(x, y, 10, 8, "#fff2dc", 0); });
  p.inkRing(bp, 12, thick);
  p.ell(318, 360, 26, 18, belly, 8); // tail
  const hy = 230 + graze * 220, hx = 760 + graze * 30;
  p.line([[700, 380], [hx - 10, hy + 60]], body, 70, true);
  const hp = blobPts(hx + 20, hy, { a: 70, b: 50, nTop: 2.0, nBot: 2.2, egg: 0.2, asym: 0.1, rot: rad(20 + graze * 40), noise: 0.006, seed: 9 });
  p.shadedFill(hp, body, mul(body, SH_SKIN), light, 70); p.inkRing(hp, 11, thick);
  p.ell(hx + 80, hy + 26 + graze * 20, 13, 11, INK, 0); // nose
  p.ell(hx - 20, hy - 46, 26, 14, body, 8, 0, 360, -30); // ear
  for (const s of [0, 1]) { const ax = hx - 6 + s * 22; p.stroke([[ax, hy - 46], [ax - 20, hy - 120], [ax - 44, hy - 150]], 10, "#6a4426"); p.stroke([[ax - 14, hy - 100], [ax + 10, hy - 128]], 9, "#6a4426"); }
  if (expr === "shock") { p.ell(hx + 20, hy - 6, 16, 16, WHITE, 5); p.dot(hx + 24, hy - 4, 5); } else p.ell(hx + 22, hy - 6, 7, 9, INK, 0);
};

/** a naga: coiled cobra with a hood and a friendly face; crown for the king. 600 x 1000 card, base at 975. */
export const naga = (p: Pen, opts: { col?: string; king?: boolean; expr?: Expr; t?: number; light?: number; blink?: number }) => {
  const { col = "#3f9a6a", king = false, expr = "smile", t = 0, light = DEF_LIGHT, blink = 0 } = opts;
  const thick = thickAngle(light), belly = mix(col, "#fff3c8", 0.6);
  const coil = [ellPts(300, 930, 210, 55), ellPts(300, 870, 170, 48), ellPts(300, 815, 130, 42)];
  for (const c of coil) { p.shadedFill(c, col, mul(col, SH_CLOTH), light, 200); p.inkRing(c, 11, thick); }
  const sway = Math.sin(t * 2) * 18;
  p.line(curve([300, 800], [300 + sway, 640], [300 + sway * 0.5, 520]), col, 70, true);
  p.stroke(curve([300, 790], [300 + sway, 640], [300 + sway * 0.5, 540]), 34, belly);
  const hood = blobPts(300 + sway * 0.5, 420, { a: 150, b: 150, nTop: 1.8, nBot: 2.6, egg: -0.3, asym: 0, rot: 0, noise: 0.006, seed: 4 });
  p.shadedFill(hood, col, mul(col, SH_CLOTH), light, 150); p.inkRing(hood, 12, thick);
  p.clip(hood, () => { p.ell(300 + sway * 0.5, 450, 80, 110, belly, 0); for (const s of [-1, 1]) p.ell(300 + sway * 0.5 + s * 95, 360, 18, 26, mix(col, INK, 0.4), 0); });
  const hx = 300 + sway * 0.5, hy = 380;
  const lid = blink >= 1 ? 1 : 0;
  for (const s of [-1, 1]) { if (lid || expr === "smile_closed") p.arc(hx + s * 34, hy + 4, 12, 8, 200, 340, 6); else p.ell(hx + s * 34, hy, 8, 11, INK, 0); }
  if (expr === "grin" || expr === "laugh") p.arc(hx, hy + 40, 26, 12, 20, 160, 6); else p.arc(hx, hy + 38, 18, 8, 20, 160, 6);
  if (king) crownShape(p, hx, hy - 90, 70, 80, GOLD, 2.2);
};

/** swaddled baby (bundle), 600 x 700 canvas, held / lying */
export const baby = (p: Pen, opts: { skin?: string; wrap?: string; expr?: Expr; light?: number; blink?: number }) => {
  const { skin = SKINS.wheat, wrap = "#f6efdc", expr = "smile_closed", light = DEF_LIGHT } = opts;
  const b = blobPts(300, 470, { a: 150, b: 200, nTop: 2.2, nBot: 2.2, egg: 0.2, asym: 0, rot: rad(-8), noise: 0.006, seed: 8 });
  p.gradFill(b, wrap, mul(wrap, SH_CLOTH), light); p.inkRing(b, 12, thickAngle(light));
  const hp = blobPts(300, 300, headBlob(13, 95, 0));
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, 95); p.inkRing(hp, 10, thickAngle(light));
  faceFront(p, 300, 300, 190, expr, 0, 0, 0, false, skin);
};

// ---------------- effect cards (unlit) ----------------
export const fxPetal = (p: Pen, col: string) => { p.ell(64, 64, 40, 26, col, 6, 0, 360, 30); p.ell(64, 64, 12, 9, "#fff6c0", 0); };
export const fxHeart = (p: Pen, col = "#e8475a") => {
  const pts: P2[] = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, x = 16 * Math.sin(a) ** 3, y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); pts.push([128 + x * 6.5, 120 - y * 6.5]); }
  p.poly(pts, col, 10);
};
export const fxKnot = (p: Pen, t = 1) => {
  const pts: P2[] = [];
  for (let i = 0; i <= 200 * t; i++) { const a = i / 16; pts.push([128 + 70 * Math.sin(a * 1.3) * Math.cos(a * 0.7), 128 + 60 * Math.sin(a * 0.9 + 1) * Math.sin(a * 0.5 + 0.3)]); }
  if (pts.length > 1) p.stroke(pts, 10);
};
export const fxWheel = (p: Pen) => {
  p.ell(128, 128, 100, 100, GOLD, 10); p.ell(128, 128, 76, 76, "#fff3b0", 6); p.ell(128, 128, 18, 18, GOLD, 6);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.stroke([[128 + 18 * Math.cos(a), 128 + 18 * Math.sin(a)], [128 + 76 * Math.cos(a), 128 + 76 * Math.sin(a)]], 8); }
};
export const fxWind = (p: Pen, t = 0) => {
  for (let k = 0; k < 3; k++) {
    const pts: P2[] = [], y0 = 70 + k * 55, x0 = 30 + k * 12;
    for (let i = 0; i <= 30; i++) { const a = i / 30; pts.push([x0 + a * 170, y0 + 10 * Math.sin(a * 6 + t * 4 + k)]); }
    const r = 22, cx = pts[30][0] - 2, cy = pts[30][1] - r;
    for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 - (i / 12) * Math.PI * 1.5; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    p.stroke(pts, 16, INK); p.stroke(pts, 9, "#dff6ff");
  }
};
export const fxBolt = (p: Pen) => p.poly([[150, 10], [70, 130], [125, 130], [90, 246], [190, 100], [132, 100], [175, 10]], "#ffe04a", 9);
export const fxHorse = (p: Pen) => {
  // a horse head in profile, facing right, on 256 x 256
  const pts: P2[] = [[60, 240], [70, 150], [90, 90], [120, 50], [140, 30], [150, 50], [175, 60], [215, 105], [225, 130], [205, 140], [170, 128], [150, 150], [140, 240]];
  p.poly(pts, "#f7f1e6", 9); p.dot(165, 82, 7); p.stroke([[95, 80], [70, 120], [62, 170], [58, 230]], 14, "#c9a46a");
};
export const fxLump = (p: Pen) => { const pts = blobPts(128, 140, { a: 90, b: 80, nTop: 2.2, nBot: 2.2, egg: 0.1, asym: 0, rot: 0, noise: 0.03, seed: 3 }); p.shadedFill(pts, "#8f8d96", "#5d5b66", rad(-120), 90); p.inkRing(pts, 9, rad(60)); p.arc(110, 120, 30, 16, 200, 300, 6, "#b6b4be"); };
export const fxBubble = (p: Pen) => { p.ell(64, 64, 50, 50, "rgba(220,250,255,0.35)", 6); p.arc(52, 50, 24, 20, 200, 280, 6, "#ffffff"); };
export const fxSparkle = (p: Pen, col = "#fff3a0") => { p.poly([[128, 10], [148, 108], [246, 128], [148, 148], [128, 246], [108, 148], [10, 128], [108, 108]], col, 8); };
export const fxNectar = (p: Pen) => { jarShape(p, 128, 150, 70, 2.4, false); p.ell(128, 82, 40, 10, "#9ff7ff", 4); };
export const fxFire = (p: Pen, t: number, seed: number) => { flame(p, 256, 500, 3.2, t, seed, false); };
export const fxSmoke = (p: Pen, seed: number) => { for (const [x, y, r] of [[90, 150, 60], [150, 120, 70], [170, 165, 55], [120, 100, 50]]) p.ell(x + (seed % 3) * 6, y, r, r * 0.85, "#5a5470", 0); };
export const fxPigeon = (p: Pen, flap: number) => {
  // a grey pigeon carrying a rolled message, flying right, on 512 x 320
  const w = Math.sin(flap * Math.PI * 2);
  p.poly([[230, 160], [140, 160 - 120 * w], [80, 150 - 90 * w], [200, 175]], "#b7bccb", 7); // far wing
  const body = blobPts(260, 180, { a: 120, b: 55, nTop: 2.2, nBot: 2.2, egg: 0, asym: 0.1, rot: rad(-5), noise: 0.005, seed: 2 });
  p.shadedFill(body, "#cfd3de", "#9da3b5", rad(-120), 120); p.inkRing(body, 8, rad(60));
  p.poly([[140, 175], [70, 150], [80, 200]], "#9da3b5", 7); // tail
  p.ell(372, 150, 42, 38, "#cfd3de", 8); p.dot(385, 140, 6); p.poly([[410, 150], [440, 158], [410, 166]], "#e8a03a", 4);
  p.poly([[260, 170], [180, 170 - 140 * w], [120, 160 - 100 * w], [240, 195]], "#dfe2ea", 7); // near wing
  p.poly(rrect(300, 210, 360, 236, 8), "#f2deb0", 5); // scroll in the feet
};
export const fxArrow = (p: Pen) => { p.stroke([[20, 64], [220, 64]], 8, "#7a4b2a"); p.poly([[220, 50], [252, 64], [220, 78]], "#c9ccd2", 5); p.poly([[20, 64], [44, 46], [60, 46], [36, 64], [60, 82], [44, 82]], "#e8475a", 4); };
export const fxMango = (p: Pen) => { p.ell(64, 70, 34, 44, "#f2b632", 7, 0, 360, 25); p.ell(78, 26, 16, 8, "#5aa64a", 4, 0, 360, -30); };
/** soft round glow on a 256 x 256 canvas (chant aura, lamp light): drawn on a see-through card */
export const fxHalo = (p: Pen, col: string, peak = 1) => {
  const g = p.g, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const a = (k: number) => Math.round(255 * k * peak).toString(16).padStart(2, "0");
  gr.addColorStop(0, col + a(1)); gr.addColorStop(0.35, col + a(0.66)); gr.addColorStop(1, col + "00");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
};
