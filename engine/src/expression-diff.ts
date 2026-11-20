// Browser-side expression difference check on the face region.
import { Pen, type Expr } from "./toon";
import { person } from "./people";
const SPEC = { skin: "#c98c5c", build: "adult" as const, top: "#2f8a8a", lower: "#f2e6c4", border: "#e8b53a", head: "crownSmall" as const, crownCol: "#e8b53a" };
const EXPRS: Expr[] = ["neutral", "angry", "sad", "smirk", "determined", "sleepy"];
function pixels(expr: Expr): Uint8ClampedArray {
  const c = document.createElement("canvas"); c.width = 600; c.height = 1000;
  const ctx = c.getContext("2d")!;
  person(new Pen(ctx), SPEC, { expr, pose: "stand", light: 0 });
  return ctx.getImageData(190, 180, 220, 290).data;
}
(window as unknown as { expressionDiff: () => unknown }).expressionDiff = () => {
  const imgs = EXPRS.map(pixels);
  const rows: Array<{ a: string; b: string; mad: number; changed: number }> = [];
  for (let i = 0; i < EXPRS.length; i++) for (let j = i + 1; j < EXPRS.length; j++) {
    let sum = 0, changed = 0;
    for (let k = 0; k < imgs[i].length; k += 4) {
      const d = (Math.abs(imgs[i][k] - imgs[j][k]) + Math.abs(imgs[i][k + 1] - imgs[j][k + 1]) + Math.abs(imgs[i][k + 2] - imgs[j][k + 2])) / 3;
      sum += d; if (d > 8) changed++;
    }
    rows.push({ a: EXPRS[i], b: EXPRS[j], mad: +(sum / (imgs[i].length / 4)).toFixed(3), changed });
  }
  return rows;
};
(window as unknown as { ready: boolean }).ready = true;
