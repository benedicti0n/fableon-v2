// Neutral finishing values and a writer that never stores an untouched scene card.
export const LOOK_NEUTRAL = { exposure: 0, warmth: 0, glow: 1, haze: 1, vignette: 1, shafts: 'off' as const };
export type LookLike = { version: 1; scenes: Record<string, Record<string, unknown>> };
export const cleanLook = (look: LookLike): LookLike => ({
  version: 1,
  scenes: Object.fromEntries(Object.entries(look.scenes ?? {}).filter(([, entry]) => entry && Object.keys(entry).length > 0)),
});
