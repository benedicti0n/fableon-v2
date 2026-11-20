// Part regeneration: snap a range to words, re-plan it locally, render takes and stitch the chosen take.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, RENDER_CJS, run } from './env.js';
import { historyPath, readJson, writeJsonArtifact } from './core/artifacts.js';
import { makeContext } from './frames.js';
import { compileBoard } from './authoring.js';
import { loadState, resetFrom, saveState } from './core/state.js';
import { DEFAULT_STYLE, styleAdapter, styleId } from './styles.js';

export const RANGE_MIN = 1;
export const RANGE_MAX = 20;
export const EDGE_MIN_FRAMES = 18;
const POSES = ['stand', 'talk', 'point', 'fold', 'present', 'hold', 'think', 'shrug', 'vow', 'pray'];
const EXPRS = ['neutral', 'stern', 'grin', 'shock', 'relief', 'smile', 'nervous'];
const rangeFile = (dir) => join(dir, 'ranges.json');
const json = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

const pick = (arr, seed, salt = 0) => arr[(Math.abs(seed * 31 + salt * 17) % arr.length)];

export function snapRange(words, from, to, { frames = false } = {}) {
  const fps = 30;
  if (frames) {
    const a = Math.max(0, Math.round(Number(from) * fps)), b = Math.max(a + 1, Math.round(Number(to) * fps));
    return { fromFrame: a, toFrame: b };
  }
  const start = [...words].sort((x, y) => Math.abs(x.a - Number(from)) - Math.abs(y.a - Number(from)))[0];
  const end = [...words].sort((x, y) => Math.abs(x.b - Number(to)) - Math.abs(y.b - Number(to)))[0];
  const a = Math.round((start?.a ?? Number(from)) * fps);
  const b = Math.max(a + 1, Math.round((end?.b ?? Number(to)) * fps));
  return { fromFrame: a, toFrame: b };
}

export function rangeFrames(projectDir, from, to, { frames = false } = {}) {
  const words = JSON.parse(readFileSync(join(projectDir, 'words.json'), 'utf8'));
  return snapRange(words, from, to, { frames });
}

function wordsInRange(words, fromFrame, toFrame) {
  return words.filter((w) => w.b * 30 > fromFrame - 0.5 && w.a * 30 < toFrame + 0.5).map((w) => w.w).join(' ');
}

function actorState(actor, f, ctx, start) {
  let st = { pose: actor.pose, expr: actor.expr, prop: actor.prop, facing: actor.facing, mirror: actor.mirror, look: actor.look };
  for (const b of actor.beats ?? []) if (ctx.anchor(b.at, start) <= f) st = { ...st, pose: b.pose ?? st.pose, expr: b.expr ?? st.expr, prop: b.prop !== undefined ? b.prop : st.prop, facing: b.facing ?? st.facing, mirror: b.mirror ?? st.mirror, look: b.look ?? st.look };
  return st;
}

function insertBeat(shot, actor, f, state, anchor) {
  actor.beats = (actor.beats ?? []).filter((b) => anchor(b.at) !== f);
  actor.beats.push({ at: { frame: f }, ...state });
  actor.beats.sort((a, b) => anchor(a.at) - anchor(b.at));
}

function splitShot(shot, f, ctx, suffix) {
  const start = ctx.anchor(shot.start), end = shot.end ? ctx.anchor(shot.end, start) : start + 1;
  const anchor = (a) => ctx.anchor(a, start);
  const left = structuredClone(shot), right = structuredClone(shot);
  left.id = `${shot.id}${suffix}a`; right.id = `${shot.id}${suffix}b`;
  left.end = { frame: f };
  right.start = { frame: f };
  left.camera = (shot.camera ?? []).filter((k) => anchor(k.at) < f);
  right.camera = (shot.camera ?? []).filter((k) => anchor(k.at) >= f);
  if (!left.camera.length) left.camera = [{ ...(shot.camera?.[0] ?? {}), at: { ...(shot.start ?? {}) } }];
  if (!right.camera.length) right.camera = [{ ...(shot.camera?.[0] ?? {}), at: { frame: f } }];
  for (const a of left.actors ?? []) a.beats = (a.beats ?? []).filter((b) => anchor(b.at) < f);
  for (const a of right.actors ?? []) a.beats = (a.beats ?? []).filter((b) => anchor(b.at) >= f);
  return { left, right };
}

function varyShot(shot, ctx, fromFrame, toFrame, seed, { camera = false } = {}) {
  const out = structuredClone(shot);
  const start = ctx.anchor(shot.start);
  const end = shot.end ? ctx.anchor(shot.end, start) : toFrame;
  const anchor = (a) => ctx.anchor(a, start);
  const original = new Map((shot.actors ?? []).map((a) => [a.id ?? a.who, a]));
  let salt = 0;
  for (const a of out.actors ?? []) {
    const id = a.id ?? a.who;
    const before = actorState(original.get(id) ?? a, Math.max(start, fromFrame - 1), ctx, start);
    const after = actorState(original.get(id) ?? a, Math.min(end, toFrame), ctx, start);
    const pose = pick(POSES.filter((p) => p !== before.pose), seed, salt++);
    const expr = pick(EXPRS, seed, salt++);
    insertBeat(out, a, Math.max(start, fromFrame), { ...before, pose, expr }, anchor);
    insertBeat(out, a, Math.min(end, toFrame), after, anchor);
  }
  if (camera && toFrame - fromFrame > 24) {
    out.camera = (out.camera ?? []).map((k, i) => {
      const fov = Number(k.fov ?? 40);
      return { ...k, fov: Math.max(24, Math.min(60, fov + ((seed + i) % 3 - 1) * 3)), roll: Number(k.roll ?? 0) + (seed % 2 ? 0.006 : -0.006) };
    });
  }
  return { ...out };
}

export function buildRangePatch(projectDir, fromFrame, toFrame, edges, seed) { return buildPatch(projectDir, fromFrame, toFrame, edges, seed); }

function buildPatch(projectDir, fromFrame, toFrame, edges, seed) {
  const ctx = makeContext(projectDir);
  const rows = json(join(projectDir, 'shots.json'), []);
  const sb = ctx.sb;
  const shots = [];
  const replaceIds = [];
  const affected = rows.map((row, i) => ({ row, story: sb.shots[i] })).filter((x) => x.story && x.row[2] > fromFrame && x.row[1] < toFrame);
  if (!affected.length) throw new Error('range does not touch any shot');
  for (const { row, story } of affected) {
    const start = ctx.anchor(story.start);
    const end = story.end ? ctx.anchor(story.end, start) : row[2];
    const cutsAtStart = edges === 'cut' && fromFrame > start + 1;
    const cutsAtEnd = edges === 'cut' && toFrame < end - 1;
    if (!cutsAtStart && !cutsAtEnd) {
      const whole = fromFrame <= start + 2 && toFrame >= end - 2;
      replaceIds.push(story.id);
      shots.push(varyShot(story, ctx, Math.max(start, fromFrame), Math.min(end, toFrame), seed, { camera: whole }));
      continue;
    }
    let pieces = [story];
    if (cutsAtStart) {
      const { left, right } = splitShot(pieces[0], fromFrame, ctx, `r${seed}`);
      pieces = [left, right];
    }
    if (cutsAtEnd) {
      const idx = pieces.length - 1;
      const { left, right } = splitShot(pieces[idx], toFrame, ctx, `t${seed}`);
      pieces.splice(idx, 1, left, right);
    }
    replaceIds.push(story.id);
    const varied = pieces.map((p) => {
      const ps = ctx.anchor(p.start), pe = p.end ? ctx.anchor(p.end, ps) : toFrame;
      const touches = pe > fromFrame && ps < toFrame;
      return touches ? varyShot(p, ctx, Math.max(ps, fromFrame), Math.min(pe, toFrame), seed + ps, { camera: true }) : p;
    });
    shots.push(...varied);
  }
  return { replaceIds, shots };
}

export function applyRangePatch(storyboard, patch) {
  const sb = structuredClone(storyboard);
  const ids = new Set(patch.replaceIds ?? []);
  const first = sb.shots.findIndex((s) => ids.has(s.id));
  const filtered = sb.shots.filter((s) => !ids.has(s.id));
  const at = first < 0 ? filtered.length : Math.min(first, filtered.length);
  filtered.splice(at, 0, ...structuredClone(patch.shots ?? []));
  sb.shots = filtered;
  return sb;
}

export function applyAcceptedRanges(projectDir, storyboard) {
  const data = json(rangeFile(projectDir), { accepted: [] });
  return applyPatchList(storyboard, data.accepted ?? []);
}

function applyPatchList(storyboard, accepted) {
  let sb = structuredClone(storyboard);
  for (const a of accepted ?? []) sb = applyRangePatch(sb, a.patch);
  return sb;
}

export function rangePatchErrors(patch, ctx, fromFrame, toFrame, edges) {
  const errors = [];
  const ids = new Set();
  for (const s of patch.shots) {
    if (ids.has(s.id)) errors.push(`duplicate shot id ${s.id}`); ids.add(s.id);
    const a = ctx.anchor(s.start), b = s.end ? ctx.anchor(s.end, a) : toFrame;
    if (edges === 'cut' && (b - a < EDGE_MIN_FRAMES)) errors.push(`shot ${s.id} is ${b - a} frames; cut edges need >= ${EDGE_MIN_FRAMES}`);
    const keys = (s.camera ?? []).map((k) => ctx.anchor(k.at, a)).sort((x, y) => x - y);
    for (let i = 1; i < keys.length; i++) if (keys[i] - keys[i - 1] < EDGE_MIN_FRAMES) errors.push(`shot ${s.id} has camera keys ${keys[i] - keys[i - 1]} frames apart; minimum ${EDGE_MIN_FRAMES}`);
  }
  if (!patch.shots.length) errors.push('the take is empty');
  return errors;
}

export function listRangeState(projectDir) {
  const data = json(rangeFile(projectDir), { version: 1, ranges: [], accepted: [] });
  return { ...data, ranges: (data.ranges ?? []).map((r) => ({ ...r, takes: (r.takes ?? []).map((t) => ({ id: t.id, index: t.index, video: t.video, inContext: t.inContext, summary: t.summary })) })) };
}

async function renderTake(projectDir, storyboard, file, fromFrame, toFrame, progress) {
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-range-take-'));
  try {
    for (const f of ['words.json', 'project.json', 'cast.json', 'look.json', 'cues.json']) {
      const p = join(projectDir, f);
      if (existsSync(p)) copyFileSync(p, join(tmp, f));
    }
    writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(storyboard, null, 2) + '\n');
    const pj = json(join(projectDir, 'project.json'), {});
    const sid = styleId(pj);
    const jobsFile = join(tmp, 'jobs.json');
    writeFileSync(jobsFile, JSON.stringify([[fromFrame, toFrame, file]]));
    if (sid !== DEFAULT_STYLE) {
      const { adapter } = await styleAdapter(sid);
      if (typeof adapter.renderSegments === 'function') { await adapter.renderSegments({ projectDir: tmp, jobsFile, size: '540x960' }); return; }
    }
    await run(process.execPath, [RENDER_CJS, 'segments', '--jobs', jobsFile, '--project', tmp, '--size', '540x960', '--msaa', '0'], { cwd: ROOT });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export async function runRangeTakes({ projectDir, from, to, note = '', count = 2, edges = 'match', frames = false, progress = null }) {
  const dir = resolve(projectDir);
  const data = json(rangeFile(dir), { version: 1, ranges: [], accepted: [] });
  const { fromFrame, toFrame } = rangeFrames(dir, from, to, { frames });
  const seconds = (toFrame - fromFrame) / 30;
  if (seconds < RANGE_MIN || seconds > RANGE_MAX) throw new Error(`range is ${seconds.toFixed(1)} s; choose ${RANGE_MIN}-${RANGE_MAX} s`);
  if (!['match', 'cut'].includes(edges)) throw new Error('edges must be match or cut');
  const n = Math.max(1, Math.min(3, Math.round(Number(count) || 1)));
  const ctx = makeContext(dir);
  const base = ctx.sb;
  const rangeId = `r_${randomBytes(5).toString('hex')}`;
  const outDir = join(dir, 'ranges', rangeId);
  mkdirSync(outDir, { recursive: true });
  const takes = [];
  for (let i = 1; i <= n; i++) {
    progress?.({ step: 'range:take', done: i - 1, total: n, message: `take ${i}/${n}` });
    const patch = buildPatch(dir, fromFrame, toFrame, edges, i * 97 + (note ? [...note].reduce((a, c) => a + c.charCodeAt(0), 0) : 0));
    const errors = rangePatchErrors(patch, ctx, fromFrame, toFrame, edges);
    if (errors.length) throw new Error(`range take ${i}: ${errors.join('; ')}`);
    const patched = applyRangePatch(base, patch);
    // The preview covers one second on each side so the cut can be judged in context.
    const ctxFrom = Math.max(0, fromFrame - 30), ctxTo = Math.min(ctx.END + (base.tailFrames ?? 0), toFrame + 30);
    const file = join(outDir, `take-${i}.mp4`);
    await renderTake(dir, patched, file, ctxFrom, ctxTo, progress);
    takes.push({
      id: `${rangeId}-t${i}`, index: i, seed: i, patch, video: file.replace(`${dir}/`, ''),
      previewStart: (fromFrame - ctxFrom) / 30, previewEnd: (toFrame - ctxFrom) / 30,
      inContext: { from: ctxFrom / 30, to: ctxTo / 30 },
      summary: `${edges} edges; ${patch.shots.length} shot(s); note: ${note || 'none'}`,
    });
    progress?.({ step: 'range:take', done: i, total: n, message: `take ${i}/${n} ready` });
  }
  data.ranges.push({ id: rangeId, fromFrame, toFrame, from: fromFrame / 30, to: toFrame / 30, words: wordsInRange(ctx.words, fromFrame, toFrame), note, count: n, edges, createdAt: new Date().toISOString(), takes });
  writeJsonArtifact(dir, 'ranges', 'ranges.json', data, null);
  return { id: rangeId, from: fromFrame / 30, to: toFrame / 30, edges, takes: takes.map((t) => ({ id: t.id, video: t.video, summary: t.summary })) };
}

export function recompileStoryboard(projectDir) {
  const ctx = makeContext(projectDir);
  const board = JSON.parse(readFileSync(join(projectDir, 'board.json'), 'utf8'));
  return compileBoard(board, ctx.words, ctx.catalog).storyboard;
}

export function acceptRangeTake(projectDir, rangeId, takeId) {
  const dir = resolve(projectDir);
  const data = json(rangeFile(dir), { version: 1, ranges: [], accepted: [] });
  const range = rangeId ? (data.ranges ?? []).find((r) => r.id === rangeId) : (data.ranges ?? []).find((r) => (r.takes ?? []).some((t) => t.id === takeId));
  if (!range) throw new Error(`range ${rangeId ?? ''} was not found`);
  const take = (range.takes ?? []).find((t) => t.id === takeId);
  if (!take) throw new Error(`take ${takeId} was not found`);
  const before = existsSync(join(dir, 'storyboard.json')) ? JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8')) : null;
  data.accepted = [...(data.accepted ?? []), {
    id: `a_${randomBytes(5).toString('hex')}`, rangeId, takeId, patch: take.patch, note: range.note,
    fromFrame: range.fromFrame, toFrame: range.toFrame, edges: range.edges, acceptedAt: new Date().toISOString(),
  }];
  data.history = [...(data.history ?? []), { type: 'accept', rangeId, takeId, at: new Date().toISOString(), before }];
  const storyboard = applyPatchList(recompileStoryboard(dir), data.accepted);
  writeJsonArtifact(dir, 'ranges', 'storyboard.json', storyboard, 'storyboard');
  writeJsonArtifact(dir, 'ranges', 'ranges.json', data, null);
  resetFrom(dir, 'board');
  const state = loadState(dir);
  if (state.stages?.board) { state.stages.board.status = 'edited'; state.stages.board.approvedHash = null; saveState(dir, state); }
  return { id: range.id, rangeId: range.id, takeId, storyboard: 'storyboard.json', from: range.from, to: range.to, fromFrame: range.fromFrame, toFrame: range.toFrame };
}

export function revertLastRange(projectDir) {
  const dir = resolve(projectDir);
  const data = json(rangeFile(dir), { version: 1, ranges: [], accepted: [] });
  if (!(data.history ?? []).length) throw new Error('there is no range edit to revert');
  const last = data.history.pop();
  data.accepted = (data.accepted ?? []).filter((a) => !(a.rangeId === last.rangeId && a.takeId === last.takeId));
  const storyboard = applyPatchList(recompileStoryboard(dir), data.accepted);
  writeJsonArtifact(dir, 'ranges', 'storyboard.json', storyboard, 'storyboard');
  writeJsonArtifact(dir, 'ranges', 'ranges.json', data, null);
  resetFrom(dir, 'board');
  const state = loadState(dir);
  if (state.stages?.board) { state.stages.board.status = 'edited'; state.stages.board.approvedHash = null; saveState(dir, state); }
  return { reverted: last, accepted: data.accepted.length };
}

/** Apply accepted edits to the project storyboard and return the new object. */
export function applyAcceptedToProject(projectDir) {
  const file = join(projectDir, 'storyboard.json');
  if (!existsSync(file)) return null;
  const current = JSON.parse(readFileSync(file, 'utf8'));
  let next;
  try { next = applyAcceptedRanges(projectDir, recompileStoryboard(projectDir)); }
  catch { next = applyAcceptedRanges(projectDir, current); }
  if (JSON.stringify(next) !== JSON.stringify(current)) writeJsonArtifact(projectDir, 'ranges', 'storyboard.json', next, 'storyboard');
  return next;
}

/** Remove cues that fall inside the replaced range; the audio mix is rebuilt by the caller. */
export function trimCuesForRange(projectDir, fromFrame, toFrame) {
  const file = join(projectDir, 'cues.json');
  if (!existsSync(file)) return false;
  const cues = JSON.parse(readFileSync(file, 'utf8'));
  const ctx = makeContext(projectDir);
  const inside = (at) => { try { const f = ctx.anchor(at); return f >= fromFrame && f <= toFrame; } catch { return false; } };
  let changed = false;
  for (const key of ['stingers', 'sfx']) {
    const before = (cues[key] ?? []).length;
    cues[key] = (cues[key] ?? []).filter((c) => !inside(c.at));
    if (cues[key].length !== before) changed = true;
  }
  if (changed) writeJsonArtifact(projectDir, 'sound', 'cues.json', cues, 'cues');
  return changed;
}
