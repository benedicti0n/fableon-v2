// Core CLI commands: create, inspect and approve a project.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from '../env.js';
import { newProject } from '../core/new-project.js';
import { approve, statusTable } from '../core/state.js';

export async function newCommand(dir, opts) {
  loadDotEnv();
  const r = newProject(dir, { topic: opts.topic, seconds: Number(opts.seconds ?? 90), voice: opts.voice ?? 'am_michael' });
  console.log(`new: ${r.dir}`);
  console.log('  project.json, brief.md, research/sources/, pronunciations.json');
  console.log(`next: put sources in ${join(r.dir, 'research', 'sources')} then: fableon run --project ${r.dir} --to voice --autopilot`);
}

export function statusCommand(dirArg) {
  loadDotEnv();
  const { rows, todos } = statusTable(dirArg);
  console.log('stage         status      approved  last run                  tokens (p/c)    cost');
  console.log('------------  ----------  --------  ------------------------  --------------  ------');
  for (const r of rows) console.log(`${r.stage.padEnd(13)} ${r.status.padEnd(11)} ${r.approved.padEnd(9)} ${String(r.lastRun).padEnd(25)} ${r.tokens.padEnd(15)} ${r.cost}`);
  if (todos.length) console.log(`\npronunciation TODO (add to pronunciations.json): ${todos.join(', ')}`);
}

export async function approveCommand(dir, stage) {
  loadDotEnv();
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const s = approve(dir, project, stage);
  console.log(`approve: ${stage} ${s.hash.slice(0, 12)}`);
}
