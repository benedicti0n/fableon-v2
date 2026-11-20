// Browser-side silhouette bounds for the animal cards; used to derive catalog measures.
import { Pen } from "./toon";
import { horse, elephant, cow, calf, dog, monkey, crane, boar, mongoose, swan, owl, crow, python, chariot } from "./people";

const SU = 0.00216;
type Kind = { name: string; geo: "wide" | "body"; eyeY: number; head: number; draw: (p: Pen, light: number) => void };
const ITEMS: Kind[] = [
  { name: "horse", geo: "wide", eyeY: 247, head: 0.21, draw: (p, light) => horse(p, { light }) },
  { name: "elephant", geo: "body", eyeY: 528, head: 0.48, draw: (p, light) => elephant(p, { light }) },
  { name: "cow", geo: "wide", eyeY: 365, head: 0.23, draw: (p, light) => cow(p, { light }) },
  { name: "calf", geo: "wide", eyeY: 365, head: 0.23, draw: (p, light) => calf(p, { light }) },
  { name: "dog", geo: "wide", eyeY: 380, head: 0.22, draw: (p, light) => dog(p, { light }) },
  { name: "monkey", geo: "body", eyeY: 535, head: 0.36, draw: (p, light) => monkey(p, { light }) },
  { name: "hanuman", geo: "body", eyeY: 535, head: 0.36, draw: (p, light) => monkey(p, { light, hanuman: true }) },
  { name: "crane", geo: "wide", eyeY: 284, head: 0.14, draw: (p, light) => crane(p, { light }) },
  { name: "boar", geo: "wide", eyeY: 450, head: 0.28, draw: (p, light) => boar(p, { light }) },
  { name: "mongoose", geo: "wide", eyeY: 442, head: 0.18, draw: (p, light) => mongoose(p, { light }) },
  { name: "swan", geo: "wide", eyeY: 280, head: 0.12, draw: (p, light) => swan(p, { light }) },
  { name: "owl", geo: "body", eyeY: 465, head: 0.46, draw: (p, light) => owl(p, { light }) },
  { name: "crow", geo: "wide", eyeY: 424, head: 0.22, draw: (p, light) => crow(p, { light }) },
  { name: "python", geo: "wide", eyeY: 312, head: 0.24, draw: (p, light) => python(p, { light }) },
  { name: "chariot", geo: "wide", eyeY: 404, head: 0.55, draw: (p, light) => chariot(p, { light }) },
];
const WIDE = { w: 1000, h: 700, base: 640, cx: 500 }, BODY = { w: 600, h: 1000, base: 975, cx: 300 };

(window as unknown as { specialBounds: () => unknown }).specialBounds = () => ITEMS.map((it) => {
  const g = it.geo === "wide" ? WIDE : BODY;
  const c = document.createElement("canvas"); c.width = g.w; c.height = g.h;
  const ctx = c.getContext("2d")!;
  it.draw(new Pen(ctx), -2.2);
  const d = ctx.getImageData(0, 0, g.w, g.h).data;
  let minX = g.w, maxX = 0, minY = g.h, maxY = 0, pixels = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (d[(y * g.w + x) * 4 + 3] > 8) { pixels++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const standing = +((g.base - minY) * SU).toFixed(4);
  return { name: it.name, standing, seated: standing, eye: +((g.base - it.eyeY) * SU).toFixed(4), eyeSeated: +((g.base - it.eyeY) * SU).toFixed(4), head: +it.head.toFixed(3), halfWidth: +(Math.max(g.cx - minX, maxX - g.cx) * SU).toFixed(4), pixels, bounds: { minX, maxX, minY, maxY } };
});
(window as unknown as { ready: boolean }).ready = true;
