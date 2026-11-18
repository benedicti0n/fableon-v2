// Measured look check: run look_qa.py on the current animatic or final and print the per-scene warnings.
// The glow share is measured on background pixels only: the coverage pass gives the actor/special mask for each sample.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findPython, RENDER_CJS, ROOT, run } from './env.js';

const sampleFrames = (board, qa) => {
  const frames = new Set();
  const shots = qa.shots ?? [];
  board.shots?.forEach((_, i) => {
    const ms = shots[i]; if (!ms) return;
    const a = Number(ms.a ?? 0), b = Number(ms.b ?? a + 1);
    const lo = a + 15, hi = Math.max(a + 16, b - 3);
    for (const q of [0.3, 0.55, 0.8]) frames.add(Math.round(lo + (hi - lo) * q));
  });
  return [...frames].sort((x, y) => x - y);
};

export async function lookcheckCommand(dirArg, videoArg = 'animatic') {
  const dir = resolve(dirArg);
  const video = videoArg === 'final' ? join(dir, 'final.mp4') : videoArg === 'animatic' ? join(dir, 'animatic.mp4') : resolve(videoArg);
  if (!existsSync(video)) throw new Error(`lookcheck: ${video} is missing`);
  if (!existsSync(join(dir, 'frames.json')) || !existsSync(join(dir, 'board.json')) || !existsSync(join(dir, 'qa_meta.json'))) {
    throw new Error('lookcheck needs frames.json, board.json and qa_meta.json (run: fableon frames --project <dir>)');
  }
  const py = findPython();
  if (!py) throw new Error('lookcheck needs Python/Pillow');
  const board = JSON.parse(readFileSync(join(dir, 'board.json'), 'utf8'));
  const qa = JSON.parse(readFileSync(join(dir, 'qa_meta.json'), 'utf8'));
  const frames = sampleFrames(board, qa);
  let masks = null;
  try {
    const tmp = join(dir, '.fableon', 'look-masks');
    mkdirSync(tmp, { recursive: true });
    const jobsFile = join(tmp, 'jobs.json'), outFile = join(tmp, 'coverage.json');
    writeFileSync(jobsFile, JSON.stringify(frames.map((frame) => ({ frame }))));
    await run(process.execPath, [RENDER_CJS, 'coverage', '--jobs', jobsFile, '--out', outFile, '--project', dir, '--size', '180x320', '--msaa', '0', '--png', tmp], { cwd: ROOT });
    const cov = JSON.parse(readFileSync(outFile, 'utf8'));
    masks = cov.map((r) => ({
      frame: r.frame,
      file: join(tmp, `${r.frame}.png`),
      actors: (r.items ?? []).filter((x) => x.kind === 'person' || x.kind === 'actor' || x.kind === 'special').map((x) => ({ color: x.color })),
    }));
    writeFileSync(join(dir, 'look-masks.json'), JSON.stringify(masks, null, 1));
  } catch (e) {
    console.warn(`lookcheck: character mask unavailable (${e.message}); glow share uses the whole frame`);
  }
  const args = [join(ROOT, 'tools', 'qa', 'look_qa.py'), dir, video];
  if (masks) args.push(join(dir, 'look-masks.json'));
  await run(py, args, { cwd: process.cwd() });
  const report = JSON.parse(readFileSync(join(dir, 'look-qa.json'), 'utf8'));
  return { report, warnings: report.warnings ?? [], file: join(dir, 'look-qa.md') };
}
