// `fableon board`: run the board stage, optionally with notes, and print the review paths.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from './env.js';
import { PipelineRunner } from './core/runner.js';
import { writeJsonArtifact } from './core/artifacts.js';
import { projectDir } from './project.js';
import { withProjectLock } from './core/lock.js';
import { resolve } from 'node:path';
import { renderCommand } from './pipeline.js';

export async function boardCommand(dirArg, opts = {}) { return withProjectLock(resolve(dirArg), 'board', () => boardCommandInner(dirArg, opts)); }

async function boardCommandInner(dirArg, opts = {}) {
  loadDotEnv();
  const dir = projectDir(dirArg);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  if (opts.notes) {
    const p = join(dir, 'board.notes.json');
    const data = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { version: 1, notes: [] };
    if (!data.notes.some((n) => n.text === opts.notes)) data.notes.push({ ts: new Date().toISOString(), text: opts.notes });
    writeJsonArtifact(dir, 'board', 'board.notes.json', data, 'board-notes');
  }
  const runner = new PipelineRunner(dir, project, { to: 'board', only: 'board', force: !!opts.notes || !!opts.shot, autopilot: true });
  runner.on('log', ({ message }) => { if (/^(stage .* (start|done|failed)|board )/.test(message)) console.log(message.replace(/^\S+ /, '')); });
  runner.on('skip', ({ stage, status }) => console.log(`skip ${stage} (${status})`));
  runner.on('failed', ({ stage, error }) => console.log(`FAILED ${stage}: ${error}`));
  await runner.run();
  if (opts.shot) await renderCommand(dir, { qualityName: 'preview', workers: 1, shots: opts.shot });
  console.log(`board: ${join(dir, 'board.json')} / review ${join(dir, 'board.review.json')}`);
  console.log(`review needsHuman before the animatic: ${join(dir, 'board.review.json')}`);
}
