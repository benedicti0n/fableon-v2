// `fableon clean`: remove regenerable renders, old voice auditions/takes and preview stills, never fixtures,
// approved project outputs, final.mp4 or the current animatic.
import { existsSync, readdirSync, rmSync, statfsSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ROOT } from './env.js';
import { basename } from 'node:path';
import { emitStage } from './core/events.js';

const REMOVE = [
  /\/render\/(seg_\d+\.mp4|tail-[\d-]+\.mp4|animatic_noaudio\.mp4|animatic_full\.mp4|.*\.part\.mp4|jobs_\d+\.json|tail_jobs\.json|.*concat.*\.txt|animatic-full\.txt)$/,
  /\/voice\/(auditions|pace|fit-compare)\//,
  /\/\.fableon\/voice-tmp\//,
  /\/qa\/[^/]+\.(jpg|jpeg|png)$/,
  /\/animatic-qa\/[^/]+\.(jpg|jpeg|png)$/,
];
const KEEP = /\/(final|animatic)\.mp4$/;

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const rel = (p) => relative(ROOT, p).split(sep).join('/');
export const freeBytes = () => { try { const s = statfsSync(ROOT); return s.bavail * s.bsize; } catch { return null; } };

export function cleanProject(projectDir, { dryRun = true } = {}) {
  const files = walk(projectDir).filter((p) => REMOVE.some((re) => re.test(p)) && !KEEP.test(p));
  let bytes = 0;
  for (const f of files) bytes += statSync(f).size;
  if (!dryRun) for (const f of files) rmSync(f, { force: true });
  return { files: files.map(rel), bytes, dryRun };
}

export function cleanCommand(projectArg = null, { dryRun = true } = {}) {
  const dirs = projectArg ? [resolve(projectArg)] : (existsSync(join(ROOT, 'work')) ? readdirSync(join(ROOT, 'work'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(ROOT, 'work', e.name)) : []);
  const all = { files: [], bytes: 0, dryRun };
  for (const dir of dirs) {
    const project = basename(dir);
    emitStage(project, 'clean', { op: 'clean', status: 'running' });
    const r = cleanProject(dir, { dryRun });
    emitStage(project, 'clean', { op: 'clean', status: 'done', data: { files: r.files.length, bytes: r.bytes } });
    all.files.push(...r.files);
    all.bytes += r.bytes;
  }
  return all;
}
