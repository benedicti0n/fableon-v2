// Kit review sheet: every new Spec field on 3 skins x 3 builds, the new poses/expressions/props and all presets.
// This file is bundled for a one-off Playwright screenshot; it is not part of the film renderer.
import { Pen } from "./toon";
import { person, type Spec, type Pose, type PropK } from "./people";
import CATALOG from "../../schema/catalog.json";

const W = 2600, M = 70, ROW_LABEL = 190;
const SKINS = ["#f4c9a0", "#c98c5c", "#7f4b2e"];
const BUILDS = ["adult", "stout", "kid"] as const;
const BASE: Spec = { skin: "#e7b07e", build: "adult", top: "#2f8a8a", lower: "#f2e6c4", border: "#e8b53a", head: "hair", hairCol: "#1e1418" };

const FIELD_ROWS: Array<{ name: string; extra: Partial<Spec> }> = [
  { name: "armour", extra: { armour: "#8a5a34" } },
  { name: "kavacha", extra: { kavacha: true, armour: "#c9a26a" } },
  { name: "quiver", extra: { quiver: "#8a5a34" } },
  { name: "gem", extra: { gem: "#e05a4a" } },
  { name: "snake", extra: { snake: "#2f8a4a" } },
  { name: "crescent", extra: { crescent: "#f4f1ea" } },
  { name: "armlets", extra: { armlets: "#e8b53a" } },
  { name: "ash", extra: { ash: "#f4f1ea" } },
  { name: "lowerPattern: tiger", extra: { lowerPattern: "tiger" } },
  { name: "lowerPattern: bark", extra: { lowerPattern: "bark" } },
  { name: "head: helmet", extra: { head: "helmet", crownCol: "#b8c0c8" } },
  { name: "head: jata", extra: { head: "jata", hairCol: "#2a1a1e" } },
  { name: "head: loose", extra: { head: "loose", hairCol: "#2a1a1e" } },
  { name: "head: featherCrown", extra: { head: "featherCrown", crownCol: "#e8b53a" } },
];

function draw() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 7600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f2e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pen = new Pen(ctx);
  const text = (s: string, x: number, y: number, size = 22, weight = "600") => {
    ctx.fillStyle = "#1e1418"; ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`; ctx.fillText(s, x, y);
  };
  const card = (x: number, y: number, w: number, h: number, label: string, spec: Spec, opts: { pose?: Pose; expr?: string; prop?: PropK } = {}) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = "#fffaf0"; ctx.fillRect(x, y, w, h);
    ctx.translate(x + w / 2, y + h - 18);
    const s = (h - 32) / 975;
    ctx.scale(s, s); ctx.translate(-300, -975);
    person(pen, spec, { pose: opts.pose ?? "stand", expr: (opts.expr ?? "neutral") as never, prop: opts.prop ?? null, light: 0.35 });
    ctx.restore();
    ctx.strokeStyle = "#d8cdb8"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#1e1418"; ctx.font = "600 18px Inter, system-ui, sans-serif"; ctx.fillText(label, x + 8, y + 24);
  };

  let y = 54;
  text("Fableon Phase 7 kit sheet", M, y, 38, "700"); y += 42;
  text("Every new Spec field on 3 skins x 3 builds; poses, expressions, props and iconography presets below.", M, y, 22, "400"); y += 44;

  // Fields: 9 columns, one row per field.
  const cw = 252, ch = 330;
  text("Spec fields", M, y, 26, "700"); y += 16;
  for (const row of FIELD_ROWS) {
    text(row.name, M, y + 28, 18, "600");
    let x = M + ROW_LABEL;
    for (const build of BUILDS) for (const skin of SKINS) {
      const spec: Spec = { ...BASE, skin, build, ...row.extra };
      card(x, y, cw, ch, `${build} · ${skin}`, spec);
      x += cw + 10;
    }
    y += ch + 14;
  }

  // Poses.
  y += 20; text("Poses", M, y, 28, "700"); y += 18;
  let x = M;
  for (const pose of ["kneel", "pranam", "lie", "fallen", "sleep", "strike", "guard", "blowConch", "drive", "ride", "dance", "weep", "lift"] as Pose[]) {
    if (x + 190 > W - M) { x = M; y += 330; }
    card(x, y, 180, 320, pose, { ...BASE, top: "#c8342e" }, { pose });
    x += 190;
  }
  y += 350;

  // Expressions.
  text("Expressions", M, y, 28, "700"); y += 18; x = M;
  for (const expr of ["angry", "sad", "smirk", "determined", "sleepy"]) {
    card(x, y, 180, 320, expr, { ...BASE, head: "crownSmall" }, { expr });
    x += 190;
  }
  y += 350;

  // Props.
  text("Props", M, y, 28, "700"); y += 18; x = M;
  for (const prop of ["conch", "flute", "chakra", "sword", "shield", "dice", "trident", "lotus", "bowl", "pestle", "plough", "umbrella", "chamara", "banner", "banner: snake", "banner: palm"]) {
    const [p, emblem] = prop.includes(":") ? prop.split(": ").map((z) => z.trim()) : [prop, null];
    card(x, y, 180, 320, prop, { ...BASE, emblem }, { prop: p as PropK });
    x += 190;
    if (x > W - M - 180) { x = M; y += 330; }
  }
  y += 350;

  // Presets.
  text("Iconography presets", M, y, 28, "700"); y += 18; x = M;
  const presets = (CATALOG as unknown as { iconography?: Array<{ name: string; spec: Spec; props?: string[] }> }).iconography ?? [];
  for (const preset of presets) {
    card(x, y, 210, 340, preset.name, preset.spec, { prop: (preset.props?.[0] ?? null) as PropK });
    x += 220;
    if (x > W - M - 210) { x = M; y += 350; }
  }
  y += 390;
  text("Review: fields, poses, expressions, props and presets. Existing Adi shots must stay pixel-identical.", M, y, 20, "400");
  return canvas.toDataURL("image/jpeg", 0.9);
}

(window as unknown as { drawKitSheet: () => string }).drawKitSheet = draw;
(window as unknown as { ready: boolean }).ready = true;
