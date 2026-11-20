// Browser-side silhouette bounds for deriving pose framing envelopes.
import { Pen } from "./toon";
import { person, type Pose } from "./people";
const SPEC = { skin: "#c98c5c", build: "adult" as const, top: "#c8342e", lower: "#f2e6c4", border: "#e8b53a", head: "hair" as const, hairCol: "#1e1418" };
const POSES: Pose[] = ["stand", "kneel", "pranam", "lie", "fallen", "sleep", "strike", "guard", "blowConch", "drive", "ride", "dance", "weep", "lift"];
const PROP: Record<string, string | null> = { strike: 'sword', guard: 'shield', blowConch: 'conch', drive: null, ride: 'sword', dance: null, weep: null, lift: 'chakra' };
(window as unknown as { poseBounds: () => unknown }).poseBounds = () => POSES.map((pose) => {
  const c = document.createElement("canvas"); c.width = 600; c.height = 1000;
  const ctx = c.getContext("2d")!;
  const r = person(new Pen(ctx), SPEC, { pose, expr: "neutral", light: 0, prop: (PROP[pose] ?? null) as never });
  const d = ctx.getImageData(0, 0, 600, 1000).data;
  let minX = 600, maxX = 0, minY = 1000, maxY = 0;
  for (let y = 0; y < 1000; y++) for (let x = 0; x < 600; x++) if (d[(y * 600 + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { pose, minX, maxX, minY, maxY, hc: r.hc, chin: r.chin, crown: r.crown };
});
(window as unknown as { ready: boolean }).ready = true;
