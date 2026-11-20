// F5 review sheet: the touched F4 kit items again, the new animals, mounts and effect cards.
import { Pen } from "./toon";
import { person, type Spec, type Pose, type PropK, horse, elephant, cow, calf, dog, monkey, crane, boar, mongoose, swan, owl, crow, python, chariot, fxChakra, fxConch, fxDivine, fxCloth } from "./people";
import CATALOG from "../../schema/catalog.json";

const M = 90, W = 3000;
const BASE: Spec = { skin: "#c98c5c", build: "adult", top: "#2f8a8a", lower: "#f2e6c4", border: "#e8b53a", head: "hair", hairCol: "#1e1418" };
const preset = (name: string): Spec => (CATALOG as unknown as { iconography: Array<{ name: string; spec: Spec }> }).iconography.find((p) => p.name === name)!.spec;

function draw() {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = 5000;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f2e8"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const text = (s: string, x: number, y: number, size = 22, weight = "600") => { ctx.fillStyle = "#1e1418"; ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`; ctx.fillText(s, x, y); };
  const card = (x: number, y: number, w: number, h: number, label: string, geo: "body" | "wide", fn: (p: Pen, light: number) => void, zoom = 1) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = "#fffaf0"; ctx.fillRect(x, y, w, h);
    const cw = geo === "wide" ? 1000 : 600, ch = geo === "wide" ? 700 : 1000, base = geo === "wide" ? 640 : 975;
    const s = Math.min((w - 16) / cw, (h - 52) / ch);
    ctx.translate(x + w / 2, y + h - 12 - (ch - base) * s * zoom);
    ctx.scale(s * zoom, s * zoom); ctx.translate(-cw / 2, -base);
    fn(new Pen(ctx), -2.2);
    ctx.restore();
    ctx.strokeStyle = "#d8cdb8"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    text(label, x + 8, y + 24, 18);
  };
  const mountCard = (x: number, y: number, w: number, h: number, label: string, base: number, fn: (p: Pen, light: number) => void) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = "#fffaf0"; ctx.fillRect(x, y, w, h);
    const s = Math.min((w - 16) / 1000, (h - 52) / base);
    ctx.translate(x + w / 2, y + h - 12); ctx.scale(s, s); ctx.translate(-500, -base);
    fn(new Pen(ctx), -2.2);
    ctx.restore();
    ctx.strokeStyle = "#d8cdb8"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    text(label, x + 8, y + 24, 18);
  };
  const fxCard = (x: number, y: number, w: number, h: number, label: string, fn: (p: Pen) => void) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = "#241a1c"; ctx.fillRect(x, y, w, h);
    const s = Math.min(w - 16, h - 52) / 256;
    ctx.translate(x + w / 2 - 128 * s, y + h - 12 - 256 * s);
    ctx.scale(s, s); fn(new Pen(ctx)); ctx.restore();
    ctx.fillStyle = "#f7f2e8"; ctx.fillRect(x, y, w, 40);
    ctx.strokeStyle = "#4a3a3c"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    text(label, x + 8, y + 26, 18);
  };
  const rider = (p: Pen, spec: Spec, x: number, baseY: number, pose: Pose = "ride", facing: -1 | 0 | 1 = 1) => {
    p.g.save(); p.g.translate(x, baseY - 975); person(p, spec, { pose, expr: "neutral", facing, light: -2.2 }); p.g.restore();
  };

  let y = 54;
  text("Fableon Phase 7 · F5 animals, mounts and effects", M, y, 40, "700"); y += 44;
  text("Top: the kit review round 2 items again. Below: the new animal cards, mounts and effect cards. Existing films must stay pixel-identical.", M, y, 22, "400"); y += 48;

  text("Kit round 2 touched items", M, y, 28, "700"); y += 18;
  let x = M;
  const pc = (label: string, spec: Spec, opts: { pose?: Pose; expr?: string; prop?: PropK } = {}) => { card(x, y, 360, 580, label, "body", (p, l) => person(p, spec, { pose: opts.pose ?? "stand", expr: (opts.expr ?? "neutral") as never, prop: opts.prop ?? null, light: l })); x += 375; };
  pc("Karna · base hair", { ...preset("karna") });
  pc("Karna · crowned at 12:0", { ...preset("karna-crowned") });
  pc("Ashwatthama · forehead gem", { ...preset("ashwatthama") });
  pc("Shiva · jata, crescent, tripundra, snake", { ...preset("shiva") });
  y += 600; x = M;
  pc("Krishna · feather crown", { ...preset("krishna") });
  pc("Balarama · hala on shoulder", { ...preset("balarama") }, { prop: "plough" });
  pc("angry", { ...BASE, head: "crownSmall" }, { expr: "angry" });
  pc("sad", { ...BASE, head: "crownSmall" }, { expr: "sad" });
  pc("determined", { ...BASE, head: "crownSmall" }, { expr: "determined" });
  pc("kneel", { ...BASE, top: "#c8342e" }, { pose: "kneel" });
  y += 600; x = M;
  pc("pranam", { ...BASE, top: "#c8342e" }, { pose: "pranam" });
  pc("strike", { ...BASE, top: "#c8342e" }, { pose: "strike", prop: "sword" });
  pc("drive (seat)", { ...BASE, top: "#c8342e" }, { pose: "drive" });
  pc("guard", { ...BASE, top: "#c8342e" }, { pose: "guard", prop: "shield" });
  y += 620;

  text("Animals", M, y, 28, "700"); y += 18; x = M;
  const wide = (label: string, fn: (p: Pen, l: number) => void, zoom = 1) => { if (x + 420 > W - M) { x = M; y += 350; } card(x, y, 420, 330, label, "wide", fn, zoom); x += 435; };
  const body = (label: string, fn: (p: Pen, l: number) => void, zoom = 1) => { if (x + 330 > W - M) { x = M; y += 490; } card(x, y, 330, 470, label, "body", fn, zoom); x += 345; };
  wide("horse", (p, l) => horse(p, { light: l }));
  wide("cow", (p, l) => cow(p, { light: l, calf: true }));
  wide("calf · author at 0.55", (p, l) => calf(p, { light: l }), 0.55);
  wide("dog", (p, l) => dog(p, { light: l }));
  wide("boar", (p, l) => boar(p, { light: l }));
  wide("mongoose · half-golden", (p, l) => mongoose(p, { light: l, golden: 0.5 }));
  wide("crane", (p, l) => crane(p, { light: l }));
  wide("swan", (p, l) => swan(p, { light: l }));
  wide("crow", (p, l) => crow(p, { light: l }));
  wide("python", (p, l) => python(p, { light: l }));
  body("monkey", (p, l) => monkey(p, { light: l }));
  body("Hanuman preset", (p, l) => monkey(p, { light: l, hanuman: true, old: true }));
  wide("chariot · 2 horses", (p, l) => chariot(p, { light: l, horses: 2 }), 0.9);
  wide("chariot · 4 horses", (p, l) => chariot(p, { light: l, horses: 4 }), 0.9);
  wide("chariot · wheel stuck", (p, l) => chariot(p, { light: l, horses: 2, stuck: true }), 0.9);
  body("elephant + howdah", (p, l) => elephant(p, { light: l }));
  body("owl", (p, l) => owl(p, { light: l }));
  y += 510;

  text("Mounts and seats", M, y, 28, "700"); y += 18; x = M;
  mountCard(x, y, 620, 800, "horse · seat rider", 1050, (p, l) => { p.g.save(); p.g.translate(0, 1050 - 640); horse(p, { light: l, saddle: true }); p.g.restore(); rider(p, { ...preset("karna") }, 500, 1050 - 241, "ride", 1); }); x += 635;
  mountCard(x, y, 620, 800, "elephant · driver in howdah", 1350, (p, l) => { p.g.save(); p.g.translate(0, 1350 - 975); elephant(p, { light: l }); p.g.restore(); rider(p, { ...preset("karna") }, 310, 1350 - 491, "drive", 1); }); x += 635;
  mountCard(x, y, 620, 800, "chariot · driver + warrior", 1050, (p, l) => { p.g.save(); p.g.translate(0, 1050 - 640); chariot(p, { light: l }); p.g.restore(); rider(p, { ...preset("karna") }, 639, 1050 - 236, "drive", 1); rider(p, { skin: "#7f4b2e", build: "stout", top: "#2f6a8a", lower: "#f2e6c4", head: "crownSmall" }, 361, 1050 - 236, "drive", 1); });
  y += 830;
  text("Seats are offsets from the mount: rider/driver/warrior/passenger. The solver frames the mount and every rider as one subject.", M, y, 20, "400"); y += 50;

  text("Effects", M, y, 28, "700"); y += 18; x = M;
  fxCard(x, y, 300, 340, "chakra · spin", (p) => fxChakra(p, 0.6)); x += 315;
  fxCard(x, y, 300, 340, "conch · rings", (p) => fxConch(p, 0.52)); x += 315;
  fxCard(x, y, 300, 340, "divine · rays", (p) => fxDivine(p, "#fff0a0", 12, 1)); x += 315;
  fxCard(x, y, 300, 340, "endless cloth · unroll", (p) => fxCloth(p, 0.82)); x += 315;
  y += 380;
  text("Review: shapes read at medium size; measures come from the drawn silhouettes. All checks and golden stills must stay identical.", M, y, 20, "400");
  return canvas.toDataURL("image/jpeg", 0.9);
}

(window as unknown as { drawAnimalsSheet: () => string }).drawAnimalsSheet = draw;
(window as unknown as { ready: boolean }).ready = true;
