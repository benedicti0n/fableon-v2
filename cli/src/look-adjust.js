// Pure finishing-look resolution. The board writer uses lookFor(..., null) and must keep the old look block
// byte-identical; the final compiler uses look.json to override the mood and add world-only finishing controls.
const MOODS = new Set(['golden-glow', 'warm-side', 'dusk', 'night-moon', 'noon']);
const SHAFTS = new Set(['off', 'soft', 'strong']);

/** Return the look block for one shot. `adjust` is the scene entry from look.json, if any. */
export function lookFor(shot, sceneMood, adjust = null) {
  if (!adjust) return shot?.look ? { ...shot.look } : (sceneMood ? { mood: sceneMood } : undefined);
  const look = { ...(shot?.look ?? {}), ...(adjust.mood && MOODS.has(adjust.mood) ? { mood: adjust.mood } : sceneMood ? { mood: sceneMood } : {}) };
  for (const key of ['exposure', 'warmth', 'haze', 'vignette']) {
    if (typeof adjust[key] === 'number') look[key] = adjust[key];
  }
  if (typeof adjust.glow === 'number') look.glowScale = adjust.glow;
  if (SHAFTS.has(adjust.shafts)) {
    look.shafts = adjust.shafts !== 'off';
    look.shaftsStrength = adjust.shafts === 'strong' ? 1 : adjust.shafts === 'soft' ? 0.55 : 0;
  }
  return look;
}

/** Apply look.json to a compiled storyboard (in place on a clone) and return it. */
export function applyLook(storyboard, lookFile) {
  if (!lookFile?.scenes) return storyboard;
  const copy = structuredClone(storyboard);
  for (const shot of copy.shots ?? []) {
    const scene = shot.id ?? shot.scene;
    const adjust = lookFile.scenes?.[scene];
    if (!adjust) continue;
    const next = lookFor(shot, shot.look?.mood ?? null, adjust);
    if (next) shot.look = next;
  }
  return copy;
}
