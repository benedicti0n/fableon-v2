// `fableon cast`: run the cast stage, optionally with director notes, and print the sheet/approval path.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from './env.js';
import { PipelineRunner } from './core/runner.js';
import { writeJsonArtifact } from './core/artifacts.js';
import { projectDir } from './project.js';

export async function castCommand(dirArg, opts = {}) {
  loadDotEnv();
  const dir = projectDir(dirArg);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  if (opts.notes) {
    const p = join(dir, 'cast.notes.json');
    const data = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { version: 1, notes: [] };
    data.notes.push({ ts: new Date().toISOString(), text: opts.notes });
    writeJsonArtifact(dir, 'cast', 'cast.notes.json', data, 'castNotes');
  }
  const runner = new PipelineRunner(dir, project, { to: 'cast', only: 'cast', force: !!opts.notes, autopilot: true });
  runner.on('log', ({ message }) => { if (/^(stage .* (start|done|failed)|cast )/.test(message)) console.log(message.replace(/^\S+ /, '')); });
  runner.on('skip', ({ stage, status }) => console.log(`skip ${stage} (${status})`));
  runner.on('failed', ({ stage, error }) => console.log(`FAILED ${stage}: ${error}`));
  await runner.run();
  console.log(`cast sheet: ${join(dir, 'cast', 'cast-sheet.jpg')}`);
  console.log(`review it, then: npx fableon approve --project ${dir} --stage cast`);
}
