// Browser-side silhouette comparison for the new poses; used by the kit test.
import { Pen } from "./toon";
import { person, type Pose } from "./people";

const SPEC = { skin: "#c98c5c", build: "adult" as const, top: "#c8342e", lower: "#f2e6c4", border: "#e8b53a", head: "hair" as const, hairCol: "#1e1418" };
const POSES: Pose[] = ["stand", "kneel", "pranam", "lie", "fallen", "sleep", "strike", "guard", "blowConch", "drive", "ride", "dance", "weep", "lift"];
const POSE_PROP: Record<string, string | null> = { strike: 'sword', guard: 'shield', blowConch: 'conch', drive: null, ride: 'sword', dance: null, weep: null, lift: 'chakra' };

function mask(pose: Pose): Uint8Array {
  const c = document.createElement("canvas"); c.width = 600; c.height = 1000;
  const ctx = c.getContext("2d")!;
  const r = person(new Pen(ctx), SPEC, { pose, expr: "neutral", light: 0, prop: (POSE_PROP[pose] ?? null) as never });
  (window as unknown as { __hands: Record<string, unknown> }).__hands = { ...((window as unknown as { __hands?: Record<string, unknown> }).__hands ?? {}), [pose]: { L: r.L, R: r.R } };
  const d = ctx.getImageData(0, 0, 600, 1000).data;
  const m = new Uint8Array(600 * 1000);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  return m;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) union++; }
  return union ? inter / union : 1;
}

(window as unknown as { poseIoU: () => unknown }).poseIoU = () => {
  const masks = POSES.map(mask);
  const rows: Array<{ a: string; b: string; iou: number }> = [];
  for (let i = 0; i < POSES.length; i++) for (let j = i + 1; j < POSES.length; j++) rows.push({ a: POSES[i], b: POSES[j], iou: +iou(masks[i], masks[j]).toFixed(3) });
  return rows;
};
(window as unknown as { ready: boolean }).ready = true;
