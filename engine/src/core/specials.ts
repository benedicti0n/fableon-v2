// Special (non-person) cards used by the timeline and the storyboard interpreter. gn() is moved verbatim from story.ts.
import type { Stage, CamInfo } from "../cast";
import { card, lidAt } from "../cast";
import { ganesha } from "../people";
import type { V3 } from "../places";

export const gnCard = (out: Stage, cam: CamInfo, o: Parameters<typeof ganesha>[1], t: number, pos: V3, sc = 0.85) =>
  card(out, cam, `gan|${JSON.stringify(o)}|${lidAt(t, 77)}`, (p, light) => { ganesha(p, { ...o, light, blink: lidAt(t, 77) }); }, pos[0], pos[1], pos[2], { scale: sc, blobScale: 1.6, mirror: true });
