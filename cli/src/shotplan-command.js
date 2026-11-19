// `fableon shotplan`: run the shot-plan stage, optionally with director notes, and print the review paths.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from './env.js';
import { PipelineRunner } from './core/runner.js';
import { writeJsonArtifact } from './core/artifacts.js';
import { projectDir } from './project.js';
import { withProjectLock } from './core/lock.js';
import { resolve } from 'node:path';

export async function shotplanCommand(dirArg, opts = {}) { return withProjectLock(resolve(dirArg), 'shotplan', () => shotplanCommandInner(dirArg, opts)); }

async function shotplanCommandInner(dirArg, opts = {}) {
  loadDotEnv();
  const dir = projectDir(dirArg);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  if (opts.notes) {
    const p = join(dir, 'shotplan.notes.json');
    const data = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { version: 1, notes: [] };
    if (!data.notes.some((n) => n.text === opts.notes)) data.notes.push({ ts: new Date().toISOString(), text: opts.notes });
    writeJsonArtifact(dir, 'shotplan', 'shotplan.notes.json', data, 'shotplan-notes');
  }
  const runner = new PipelineRunner(dir, project, { to: 'shotplan', only: 'shotplan', force: !!opts.notes, autopilot: true });
  runner.on('log', ({ message }) => { if (/^(stage .* (start|done|failed)|shotplan )/.test(message)) console.log(message.replace(/^\S+ /, '')); });
  runner.on('skip', ({ stage, status }) => console.log(`skip ${stage} (${status})`));
  runner.on('failed', ({ stage, error }) => console.log(`FAILED ${stage}: ${error}`));
  await runner.run();
  console.log(`shot plan: ${join(dir, 'shotplan.md')} / ${join(dir, 'shotplan.json')}`);
  console.log('review the plan and cast sheet, then approve both stages: npx fableon approve --stage shotplan; npx fableon approve --stage cast');
}
