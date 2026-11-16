// Shared shot-list assembly: the per-shot dynamic-piece wrapper, crossfade rule, layer lookup and DOF ramp.
// The storyboard interpreter builds ShotDef[] through this module.
import type { ShotDef } from "../world";
import type { Sets } from "../sets";

export type Def = Omit<ShotDef, "id" | "a" | "b"> & { from: number; end?: number };
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => [number, number, number] };

/** jars stay hidden in every other shot; the wrapper is part of the look and is shared. */
export const hideJars = (s: Sets) => { s.dyn.jars.visible = s.dyn.lids.visible = false; };

export const assembleShots = (defs: Def[], total: number, pagesDefault = 0.3): ShotDef[] => {
  const sorted = [...defs].sort((a, b) => a.from - b.from);
  return sorted.map((d, i) => {
    const a = d.from, b = d.end ?? (i + 1 < sorted.length ? sorted[i + 1].from : total);
    const pose = d.pose;
    return { ...d, id: i + 1, a, b, pose: (t: number, f: number, s: Sets) => {
      hideJars(s); s.dyn.city.visible = false; s.dyn.ladduPlate.visible = false; s.dyn.pages.scale.set(1, pagesDefault, 1);
      pose?.(t, f, s);
    } };
  });
};

/** crossfades at place / time-of-day changes (frames), keyed by the incoming shot id */
export const crossfades = (shots: ShotDef[], frames = 10): Record<number, number> => {
  const xf: Record<number, number> = {};
  shots.forEach((s, i) => { if (i && shots[i - 1].light !== s.light) xf[s.id] = frames; });
  return xf;
};

export const shotAt = (shots: ShotDef[], f: number) => shots.find((s) => f >= s.a && f < s.b) ?? shots[shots.length - 1];
export const layersAt = (shots: ShotDef[], xfade: Record<number, number>, f: number): { id: number; alpha: number }[] => {
  for (const s of shots) {
    const x = xfade[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(shots, f).id, alpha: 1 }];
};

export const dofAt = (dofs: Dof[], f: number) => {
  let i = 0; while (i + 1 < dofs.length && f >= dofs[i + 1].f) i++;
  const d = dofs[i], p = dofs[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
