// Measured look check: run look_qa.py on the current animatic or final and print the per-scene warnings.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findPython, ROOT, run } from './env.js';

export async function lookcheckCommand(dirArg, videoArg = 'animatic') {
  const dir = resolve(dirArg);
  const video = videoArg === 'final' ? join(dir, 'final.mp4') : videoArg === 'animatic' ? join(dir, 'animatic.mp4') : resolve(videoArg);
  if (!existsSync(video)) throw new Error(`lookcheck: ${video} is missing`);
  if (!existsSync(join(dir, 'frames.json')) || !existsSync(join(dir, 'board.json')) || !existsSync(join(dir, 'qa_meta.json'))) {
    throw new Error('lookcheck needs frames.json, board.json and qa_meta.json (run: fableon frames --project <dir>)');
  }
  const py = findPython();
  if (!py) throw new Error('lookcheck needs Python/Pillow');
  await run(py, [join(ROOT, 'tools', 'qa', 'look_qa.py'), dir, video], { cwd: process.cwd() });
  const report = JSON.parse(readFileSync(join(dir, 'look-qa.json'), 'utf8'));
  return { report, warnings: report.warnings ?? [], file: join(dir, 'look-qa.md') };
}
