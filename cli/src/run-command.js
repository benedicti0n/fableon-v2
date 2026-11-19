// `fableon run`: CLI adapter around PipelineRunner.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from './env.js';
import { PipelineRunner } from './core/runner.js';
import { withProjectLock } from './core/lock.js';

export async function runCommand(dir, opts) {
  loadDotEnv();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const ctrl = new AbortController();
  const runner = new PipelineRunner(dir, project, {
    to: opts.to ?? 'animatic', only: opts.only ?? null, force: !!opts.force,
    autopilot: opts.autopilot ? true : undefined, fit: opts.fit !== 'off', noCache: opts.cache === false, cachedOnly: !!opts.cachedOnly,
    signal: ctrl.signal,
  });
  const onInt = () => { ctrl.abort(); };
  process.once('SIGINT', onInt);
  runner.on('log', ({ message }) => { if (/^(stage .* (start|done|failed)|factcheck revise)/.test(message)) console.log(message); });
  runner.on('skip', ({ stage, status }) => console.log(`skip ${stage} (${status})`));
  runner.on('failed', ({ stage, error }) => console.log(`FAILED ${stage}: ${error}`));
  try {
    await withProjectLock(dir, 'run', () => runner.run());
    console.log(`run: done — ${join(dir, 'logs')} and ${join(dir, '.fableon/state.json')}`);
  } finally { process.removeListener('SIGINT', onInt); }
}
