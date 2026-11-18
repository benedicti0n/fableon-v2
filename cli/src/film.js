// Film-level camera statistics from a compiled storyboard (Phase 3D checks after compile).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.js';
import { inferSize } from './composition.js';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z']/g, '');
const anchorFrame = (a, words, fps = 30, shotStart = 0) => {
  if (!a) return shotStart;
  if (a.shot) return shotStart + (a.offset ?? 0);
  if (a.frame !== undefined) return a.frame + (a.offset ?? 0);
  if (a.end) { const end = Math.round((words[words.length - 1]?.b ?? 0) * fps); return end + (a.offset ?? 0); }
  if (a.wordIndex !== undefined) {
    const hit = words.filter((w) => w.line === a.line)[a.wordIndex];
    return hit ? Math.round(hit.a * fps) + (a.offset ?? 0) : shotStart;
  }
  const hit = words.filter((w) => w.line === a.line && norm(w.w) === norm(a.word))[a.nth ?? 0];
  return hit ? Math.round(hit.a * fps) + (a.offset ?? 0) : shotStart;
};

/** Counts and shares that the reference-style checks care about, measured on the compiled timeline. */
export function filmStats(storyboard, words, script) {
  const fps = storyboard.fps ?? 30;
  const shots = storyboard.shots ?? [];
  const total = Math.max(1, Math.round((words[words.length - 1]?.b ?? 0) * fps));
  const starts = shots.map((s) => anchorFrame(s.start, words, fps));
  let hold = 0, dof = 0, keys = 0, fg = 0, low = 0, lowFull = 0, punches = 0, rolls = 0, cuts = 0, flashes = 0, crossfades = 0, holdKeys = 0, minHoldCreep = 1;
  shots.forEach((s, i) => {
    const t0 = starts[i], t1 = i + 1 < shots.length ? starts[i + 1] : total;
    if (s.transition?.type === 'cut') cuts++;
    if (s.transition?.type === 'flash') flashes++;
    if (s.transition?.type === 'crossfade') crossfades++;
    const cam = [...(s.camera ?? [])].sort((a, b) => anchorFrame(a.at, words, fps, t0) - anchorFrame(b.at, words, fps, t0));
    cam.forEach((k, j) => {
      const a = Math.max(t0, anchorFrame(k.at, words, fps, t0));
      const b = j + 1 < cam.length ? Math.min(t1, anchorFrame(cam[j + 1].at, words, fps, t0)) : t1;
      const d = Math.max(0, b - a);
      const size = k.size ?? inferSize(k.fov);
      keys++;
      if (['push', 'hold'].includes(k.move ?? 'push')) { hold += d; holdKeys++; const rate = k.push?.rate ?? 0; minHoldCreep = Math.min(minHoldCreep, rate !== 0 ? 1 - Math.exp(-Math.abs(rate) * 60) : 0); }
      if (['close', 'medium', 'insert'].includes(size)) dof += d;
      if (k.over) fg++;
      if (['full', 'wide', 'establishing'].includes(size)) { lowFull++; if (k.angle === 'low') low++; }
      if (k.push?.punchAt) punches++;
      if (k.roll) rolls++;
    });
  });
  return {
    shots: shots.length,
    cuts, flashes, crossfades,
    holdShare: +(hold / total).toFixed(3),
    dofShare: +(dof / total).toFixed(3),
    foregroundShare: +(keys ? fg / keys : 0).toFixed(3),
    lowHeightShare: +(lowFull ? low / lowFull : 0).toFixed(3),
    punches, rolls, kicks: (storyboard.kicks ?? []).length, holdKeys, minHoldCreep: +(holdKeys ? minHoldCreep : 1).toFixed(3),
    keys, seconds: +(total / fps).toFixed(2),
  };
}

export function filmErrors(stats, { words, script, policy = {} } = {}) {
  const errs = [];
  if (!stats.keys) return errs;
  if (stats.cuts > (policy.maxCuts ?? 2)) errs.push(`film has ${stats.cuts} hard cuts; use at most ${policy.maxCuts ?? 2}`);
  if (stats.flashes > (policy.maxFlashes ?? 3)) errs.push(`film has ${stats.flashes} flashes; use at most ${policy.maxFlashes ?? 3}`);
  if (stats.holdShare < (policy.holdMin ?? 0.70) || stats.holdShare > (policy.holdMax ?? 0.95)) errs.push(`film hold share ${(stats.holdShare * 100).toFixed(0)}% is outside ${((policy.holdMin ?? 0.70) * 100).toFixed(0)}-${((policy.holdMax ?? 0.95) * 100).toFixed(0)}%`);
  if (stats.dofShare < (policy.dofMin ?? 0.25) || stats.dofShare > (policy.dofMax ?? 0.40)) errs.push(`film DOF share ${(stats.dofShare * 100).toFixed(0)}% is outside ${((policy.dofMin ?? 0.25) * 100).toFixed(0)}-${((policy.dofMax ?? 0.40) * 100).toFixed(0)}%`);
  if (stats.foregroundShare < (policy.fgMin ?? 0.25) || stats.foregroundShare > (policy.fgMax ?? 0.40)) errs.push(`film foreground share ${(stats.foregroundShare * 100).toFixed(0)}% is outside ${((policy.fgMin ?? 0.25) * 100).toFixed(0)}-${((policy.fgMax ?? 0.40) * 100).toFixed(0)}%`);
  if (!stats.punches) errs.push('film has no punch-in');
  if (stats.holdKeys && stats.minHoldCreep < 0.06) errs.push(`hold creep ${(stats.minHoldCreep * 100).toFixed(1)}% over 2 s is below 6%`);
  return errs;
}

export const hasDirection = (storyboard) => (storyboard.shots ?? []).some((s) => s.transition || (s.camera ?? []).some((k) => k.ease || k.over || k.push?.punchAt || k.roll));

export function compileFilmCheck(dir, words, script) {
  const sb = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8'));
  if (!hasDirection(sb)) return { stats: filmStats(sb, words, script), errors: [], skipped: true };
  const stats = filmStats(sb, words, script);
  return { stats, errors: filmErrors(stats, { words, script }), skipped: false };
}
