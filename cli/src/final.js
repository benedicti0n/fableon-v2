// Final render: per-shot segment cache, transition composites, assembly, QA and the final manifest.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, RENDER_CJS, run } from './env.js';
import { FableonError, ERROR_CODES } from './core/errors.js';
import { fileHash, sha256, atomicWrite } from './core/artifacts.js';
import { runQa } from './pipeline.js';
import { lookcheckCommand } from './lookcheck.js';
import { applyLook } from './look-adjust.js';
import { DEFAULT_STYLE, readStyle, styleAdapter, styleId } from './styles.js';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

const hash12 = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 12);

/** Engine identity: source + built bundle + three version + the GPU string when one is known. */
export function engineBuildId(projectDir = null) {
  if (process.env.FABLEON_ENGINE_ID) return process.env.FABLEON_ENGINE_ID;
  const h = createHash('sha256');
  for (const p of [...walk(join(ROOT, 'engine', 'src')), ...walk(join(ROOT, 'engine', 'dist'))]) {
    h.update(relative(ROOT, p));
    h.update(readFileSync(p));
  }
  const pkg = json(join(ROOT, 'engine', 'package.json'));
  h.update(String(pkg.dependencies?.three ?? ''));
  let sid = DEFAULT_STYLE;
  if (projectDir && existsSync(join(projectDir, 'project.json'))) { try { sid = styleId(json(join(projectDir, 'project.json'))); } catch { /* default */ } }
  h.update(`style:${sid}`);
  try { const s = readStyle(sid); h.update(readFileSync(resolve(s.dir, s.adapter))); h.update(readFileSync(resolve(ROOT, s.catalog))); } catch { /* the style check reports a broken pack */ }
  let gl = process.env.FABLEON_GLINFO ?? 'unknown';
  if (projectDir && existsSync(join(projectDir, '.fableon', 'glinfo.json'))) {
    try { gl = json(join(projectDir, '.fableon', 'glinfo.json')).renderer ?? gl; } catch { /* keep unknown */ }
  }
  return `${h.digest('hex').slice(0, 12)}-${String(pkg.dependencies?.three ?? '')}-${hash12(gl).slice(0, 6)}`;
}

const anchor = (a, words, fps, end, shotStart = 0) => {
  if (a?.shot) return shotStart + (a.offset ?? 0);
  if (a?.frame !== undefined) return a.frame + (a.offset ?? 0);
  if (a?.end) return end + (a.offset ?? 0);
  if (a?.wordIndex !== undefined) {
    const hit = words.filter((w) => w.line === a.line)[a.wordIndex];
    return hit ? Math.round(hit.a * fps) + (a.offset ?? 0) : 0;
  }
  return 0;
};

function load(projectDir) {
  const boardPath = join(projectDir, 'board.json');
  const storyPath = join(projectDir, 'storyboard.json');
  const shotsPath = join(projectDir, 'shots.json');
  const wordsPath = join(projectDir, 'words.json');
  for (const p of [boardPath, storyPath, shotsPath, wordsPath]) if (!existsSync(p)) throw new Error(`final: ${p} is missing (run the animatic stage first)`);
  const board = json(boardPath), storyboard = json(storyPath), shots = json(shotsPath), words = json(wordsPath);
  const look = existsSync(join(projectDir, 'look.json')) ? json(join(projectDir, 'look.json')) : null;
  return { board, storyboard: applyLook(storyboard, look), shots, words, look, fps: storyboard.fps ?? 30 };
}

const freeBytes = (dir) => {
  try { const s = statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return Number.MAX_SAFE_INTEGER; }
};

export const secondsPerFrame = (projectDir) => {
  if (process.env.FABLEON_SECONDS_PER_FRAME) return Number(process.env.FABLEON_SECONDS_PER_FRAME) || 0.35;
  const jobsFile = join(dirname(projectDir), '.fableon-server', 'jobs.jsonl');
  if (existsSync(jobsFile)) {
    const rows = readFileSync(jobsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const done = rows.filter((j) => j.op === 'final' && j.status === 'done' && j.startedAt && j.finishedAt && j.progress?.total > 0).slice(-5);
    if (done.length) {
      const values = done.map((j) => (Date.parse(j.finishedAt) - Date.parse(j.startedAt)) / 1000 / j.progress.total).filter((x) => x > 0.01 && x < 10);
      if (values.length) return +values.reduce((a, b) => a + b, 0) / values.length;
    }
  }
  return 0.35;
};

/** Resolve every shot to frames and derive the exact boundary transition map. */
export function shotRanges(projectDir) {
  const { board, storyboard, shots, words, fps, look } = load(projectDir);
  const end = Math.round(((words[words.length - 1]?.b ?? 0) * fps));
  const rows = shots.map(([id, a, b], i) => ({ id: String(id), a, b, index: i, board: board.shots?.[i] ?? {}, story: storyboard.shots?.[i] ?? {} }));
  const transitions = [];
  const explicit = (board.shots ?? []).some((s) => s.transition);
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i];
    const t = cur.board.transition;
    if (t?.type === 'crossfade') transitions.push({ index: i, type: 'crossfade', frames: Math.max(1, Math.round(t.frames ?? 7)), at: cur.a });
    else if (t?.type === 'flash') transitions.push({ index: i, type: 'flash', frames: 4, at: cur.a });
    else if (t?.type === 'cut') transitions.push({ index: i, type: 'cut', frames: 0, at: cur.a });
    else if (!explicit && prev.story.light !== cur.story.light) transitions.push({ index: i, type: 'crossfade', frames: Math.max(1, Math.round(storyboard.crossfade ?? 10)), at: cur.a });
    else transitions.push({ index: i, type: 'cut', frames: 0, at: cur.a });
  }
  return { rows, transitions, end, fps, board, storyboard, words, look };
}

export function finalPlan(projectDir) {
  const { rows, transitions, board, storyboard, words } = shotRanges(projectDir);
  const size = process.env.FABLEON_FINAL_SIZE || '1440x2560';
  const quality = size === '1440x2560' ? 'final' : 'test';
  const engine = engineBuildId(projectDir);
  const manifestPath = join(projectDir, 'render', 'final', 'manifest.json');
  const manifest = existsSync(manifestPath) ? json(manifestPath) : null;
  const castHash = fileHash(join(projectDir, 'cast.json')) ?? 'none';
  const boardHash = fileHash(join(projectDir, 'board.json')) ?? 'none';
  const lookHash = fileHash(join(projectDir, 'look.json')) ?? 'none';
  const mixHash = fileHash(join(projectDir, 'audio', 'mix.wav')) ?? 'none';
  const segments = rows.map((row, i) => {
    const shotLookHash = hash12(row.story.look ?? null);
    const payload = { shot: row.story, range: [row.a, row.b], cast: castHash, look: shotLookHash, board: boardHash, engine, quality, size };
    const hash = hash12(payload);
    const file = join('render', 'final', 'segments', `${row.id}.${hash}.mp4`);
    const prev = manifest?.segments?.[row.id];
    const exists = existsSync(join(projectDir, file));
    let reason = 'new';
    if (prev?.hash === hash && exists) reason = null;
    else if (prev?.engine && prev.engine !== engine) reason = 'engine';
    else if (prev?.lookHash !== shotLookHash) reason = 'look';
    else if (prev?.boardHash && prev.boardHash !== boardHash) reason = 'board';
    else if (prev && prev.size !== size) reason = 'quality';
    return { shot: row.id, scene: row.board.scene ?? row.id, frames: row.b - row.a, cached: !reason, reason, file, hash, lookHash: shotLookHash };
  });
  const transitionPlans = transitions.map((t, i) => {
    const prev = segments[t.index - 1], next = segments[t.index];
    const payload = { type: t.type, frames: t.frames, at: t.at, prev: prev.hash, next: next.hash, engine, size, quality };
    const hash = hash12(payload);
    const start = t.type === 'crossfade' ? Math.ceil(t.at - t.frames / 2) : t.at;
    const end = t.type === 'crossfade' ? Math.ceil(t.at + t.frames / 2) : t.type === 'flash' ? t.at + 4 : t.at;
    const file = join('render', 'final', 'transitions', `${t.index}.${hash}.mp4`);
    const prevManifest = manifest?.transitions?.[String(i)];
    const cached = prevManifest?.hash === hash && existsSync(join(projectDir, file));
    return { ...t, hash, start, end, frames: Math.max(0, end - start), file, cached, reason: cached ? null : 'transition' };
  });
  const dirtyShots = segments.filter((s) => !s.cached);
  const dirtyTransitions = transitionPlans.filter((t) => !t.cached);
  const framesToRender = dirtyShots.reduce((n, s) => n + s.frames, 0) + dirtyTransitions.reduce((n, t) => n + t.frames, 0);
  const totalFrames = segments.reduce((n, s) => n + s.frames, 0);
  const spf = secondsPerFrame(projectDir);
  const finalExists = existsSync(join(projectDir, 'final.mp4'));
  const audioOnly = framesToRender === 0 && finalExists && manifest?.audioHash !== mixHash;
  return {
    project: projectDir.split('/').pop(), engine, quality, size, totalFrames, segments, transitions: transitionPlans,
    framesToRender, audioOnly, assembleOnly: framesToRender === 0 && (!finalExists || manifest?.finalHash == null),
    estMinutes: +((framesToRender * spf) / 60).toFixed(2),
    diskNeedMB: Math.ceil(400 + framesToRender * 0.5),
    audioHash: mixHash, manifest: manifestPath,
  };
}

function ensureDisk(projectDir, plan) {
  const need = (plan.diskNeedMB + 3 * 1024) * 1024 * 1024;
  const free = freeBytes(projectDir);
  if (free < need) throw new FableonError(ERROR_CODES.DISK_LOW, `final needs about ${plan.diskNeedMB} MB and 3 GB headroom; ${Math.round(free / 1024 / 1024)} MB free`, { freeMB: Math.round(free / 1024 / 1024), needMB: plan.diskNeedMB });
}

function caffeinate() {
  if (process.platform !== 'darwin') return null;
  try { return spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' }); } catch { return null; }
}

function tempProject(projectDir, storyboard) {
  const dir = mkdtempSync(join(tmpdir(), 'fableon-final-'));
  writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(storyboard, null, 2) + '\n');
  copyFileSync(join(projectDir, 'words.json'), join(dir, 'words.json'));
  return dir;
}

function assemble(projectDir, plan, pieces) {
  const piecesFile = join(projectDir, 'render', 'final', 'pieces.json');
  mkdirSync(dirname(piecesFile), { recursive: true });
  writeFileSync(piecesFile, JSON.stringify(pieces, null, 2));
  const r = spawnSync(process.execPath, [join(ROOT, 'engine', 'scripts', 'assemble-final.mjs'), '--project', projectDir, '--pieces', piecesFile, '--audio', join(projectDir, 'audio', 'mix.wav'), '--out', join(projectDir, 'final.mp4')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`final assembly failed (exit ${r.status})`);
}

export async function renderFinal(projectDir, { progress = null } = {}) {
  const plan = finalPlan(projectDir);
  if (!plan.framesToRender && !plan.audioOnly && !plan.assembleOnly && existsSync(join(projectDir, 'final.mp4'))) return { ...plan, skipped: true };
  ensureDisk(projectDir, plan);
  const projectJson = json(join(projectDir, 'project.json'));
  const sid = styleId(projectJson);
  const custom = sid === DEFAULT_STYLE ? null : (await styleAdapter(sid)).adapter;
  const final = join(projectDir, 'final.mp4');
  if (existsSync(final)) copyFileSync(final, join(projectDir, 'final.prev.mp4'));
  const wake = caffeinate();
  try {
    if (plan.audioOnly && existsSync(join(projectDir, 'render', 'final', 'manifest.json'))) {
      const tmp = join(projectDir, 'final.audioonly.mp4');
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', final, '-i', join(projectDir, 'audio', 'mix.wav'), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', '-shortest', tmp], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('final audio-only remux failed');
      renameSync(tmp, final);
    } else {
      const current = shotRanges(projectDir);
      const tmp = tempProject(projectDir, current.storyboard);
      try {
        const dirtyShots = plan.segments.filter((s) => !s.cached);
        if (dirtyShots.length) {
          const jobs = dirtyShots.map((s) => {
            const row = current.rows.find((r) => r.id === s.shot);
            return { id: Number(s.shot) || row.index + 1, from: row.a, to: row.b, file: join(projectDir, s.file) };
          });
          mkdirSync(join(projectDir, 'render', 'final', 'segments'), { recursive: true });
          for (const job of jobs) mkdirSync(dirname(job.file), { recursive: true });
          const jobsFile = join(tmp, 'shot-jobs.json');
          writeFileSync(jobsFile, JSON.stringify(jobs));
          progress?.({ step: 'final:segments', done: 0, total: jobs.length });
          if (custom && typeof custom.renderShotSegments === 'function') await custom.renderShotSegments({ projectDir: tmp, jobsFile, size: plan.size, crf: 8 });
          else await run(process.execPath, [RENDER_CJS, 'shotsegments', '--jobs', jobsFile, '--project', tmp, '--size', plan.size, '--msaa', '0', '--crf', '8'], { cwd: ROOT });
          progress?.({ step: 'final:segments', done: jobs.length, total: jobs.length });
        }
        const dirtyTransitions = plan.transitions.filter((t) => !t.cached);
        if (dirtyTransitions.length) {
          mkdirSync(join(projectDir, 'render', 'final', 'transitions'), { recursive: true });
          const jobs = dirtyTransitions.map((t) => [t.start, t.end, join(projectDir, t.file)]);
          const jobsFile = join(tmp, 'transition-jobs.json');
          writeFileSync(jobsFile, JSON.stringify(jobs));
          progress?.({ step: 'final:transitions', done: 0, total: jobs.length });
          if (custom && typeof custom.renderSegments === 'function') await custom.renderSegments({ projectDir: tmp, jobsFile, size: plan.size });
          else await run(process.execPath, [RENDER_CJS, 'segments', '--jobs', jobsFile, '--project', tmp, '--size', plan.size, '--msaa', '0', '--crf', '8'], { cwd: ROOT });
          progress?.({ step: 'final:transitions', done: jobs.length, total: jobs.length });
        }
      } finally { rmSync(tmp, { recursive: true, force: true }); }
      const { rows, transitions } = current;
      const segmentFor = (i) => plan.segments[i];
      const pieces = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const left = transitions.find((t) => t.index === i);
        const right = transitions.find((t) => t.index === i + 1);
        const start = i === 0 ? row.a : left?.type === 'crossfade' ? Math.ceil(left.at + left.frames / 2) : left?.type === 'flash' ? left.at + 4 : row.a;
        const end = i === rows.length - 1 ? row.b : right?.type === 'crossfade' ? Math.ceil(right.at - right.frames / 2) : row.b;
        const seg = segmentFor(i);
        if (end > start) pieces.push({ file: join(projectDir, seg.file), start: start - row.a, end: end - row.a, from: start, to: end });
        const next = transitions.find((t) => t.index === i + 1);
        if (next && next.type !== 'cut') {
          const tp = plan.transitions.find((t) => t.index === next.index);
          pieces.push({ file: join(projectDir, tp.file), start: 0, end: tp.frames, from: tp.start, to: tp.end });
        }
      }
      progress?.({ step: 'final:assemble', done: 0, total: 1 });
      assemble(projectDir, plan, pieces);
      progress?.({ step: 'final:assemble', done: 1, total: 1 });
    }
  } finally { try { wake?.kill(); } catch { /* ended */ } }

  const finalHash = fileHash(final);
  const manifest = {
    version: 1, engine: plan.engine, quality: plan.quality, size: plan.size, audioHash: plan.audioHash, finalHash,
    finalBytes: existsSync(final) ? statSync(final).size : 0, createdAt: new Date().toISOString(),
    segments: Object.fromEntries(plan.segments.map((s) => [s.shot, { hash: s.hash, file: s.file, frames: s.frames, scene: s.scene, boardHash: fileHash(join(projectDir, 'board.json')), lookHash: s.lookHash, engine: plan.engine, size: plan.size }])),
    transitions: Object.fromEntries(plan.transitions.map((t, i) => [String(i), { hash: t.hash, file: t.file, from: t.start, to: t.end }])),
  };
  atomicWrite(join(projectDir, 'render', 'final', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  progress?.({ step: 'final:qa', done: 0, total: 1 });
  const qa = await runQa(projectDir);
  let look = null;
  try { look = await lookcheckCommand(projectDir, 'final'); } catch (e) { look = { warnings: [`lookcheck skipped: ${e.message}`] }; }
  const md = ['# Final QA', '', qa.md.trim(), '', '## Look check', '', ...(look.warnings.length ? look.warnings.map((w) => `- ${typeof w === 'string' ? w : w.message ?? JSON.stringify(w)}`) : ['- no look warnings']), '', `Final: ${relative(projectDir, final)} (${manifest.finalBytes} bytes)`, ''].join('\n');
  atomicWrite(join(projectDir, 'final-qa.md'), md);
  progress?.({ step: 'final:qa', done: 1, total: 1 });
  if (!qa.ok) throw new Error(`final QA failed; see ${join(projectDir, 'final-qa.md')}`);
  return { ...plan, manifest: join(projectDir, 'render', 'final', 'manifest.json'), qa: qa.ok, lookWarnings: look.warnings.length, finalBytes: manifest.finalBytes };
}
