// Keep-out volumes for the framing solver and in-frame validator. Scenery builders register a simple volume as
// they build; the browser page exports the resulting per-set list through `render.cjs catalog`.
export type BoxVolume = { kind: "box"; name: string; min: [number, number, number]; max: [number, number, number] };
export type CylVolume = { kind: "cylinder"; name: string; x: number; z: number; r: number; y0: number; y1: number };
export type Volume = BoxVolume | CylVolume;

export const KEEPOUT: Record<string, Volume[]> = {};
let current = "";

export function resetKeepout() {
  for (const k of Object.keys(KEEPOUT)) delete KEEPOUT[k];
  current = "";
}

/** Set the set whose builders are currently registering volumes. */
export function beginSet(name: string) { current = name; }

export function keepBox(name: string, min: [number, number, number], max: [number, number, number]) {
  if (!current) return;
  (KEEPOUT[current] ??= []).push({ kind: "box", name, min, max });
}

export function keepCyl(name: string, x: number, z: number, r: number, y0: number, y1: number) {
  if (!current) return;
  (KEEPOUT[current] ??= []).push({ kind: "cylinder", name, x, z, r, y0, y1 });
}
