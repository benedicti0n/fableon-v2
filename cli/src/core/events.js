// One event shape for CLI NDJSON, the server and the tests. The CLI prints human text on stderr when events are on.
import { basename } from 'node:path';

export const EVENT_TYPES = new Set(['job', 'stage', 'progress', 'log', 'artifact', 'status', 'budget', 'error']);

let enabled = false;
let stream = null;
let currentJob = null;
let exitInstalled = false;

export function eventsEnabled() { return enabled; }
export function currentJobId() { return currentJob; }
export function setCurrentJob(id) { currentJob = id ?? null; }

/** Turn on NDJSON events on stdout and move all human console.log output to stderr. */
export function enableEvents(job = null) {
  if (enabled) { if (job) currentJob = job; return; }
  enabled = true;
  stream = process.stdout;
  currentJob = job ?? currentJob;
  const human = console.log.bind(console);
  console.log = (...args) => console.error(...args);
  console.info = (...args) => console.error(...args);
  // `write` stays synchronous so a cancelled child flushes its final event.
  if (!exitInstalled) {
    exitInstalled = true;
    process.once('exit', (code) => {
      if (!enabled) return;
      emit({ type: 'job', status: code === 0 ? 'done' : 'failed', message: code === 0 ? 'done' : `exit ${code}` });
    });
  }
  return human;
}

export function projectId(projectDir) {
  return projectDir ? basename(projectDir) : undefined;
}

export function event(type, fields = {}) {
  const e = { ts: new Date().toISOString(), type, ...fields };
  if (e.job === undefined && currentJob) e.job = currentJob;
  return e;
}

export function emit(fields) {
  if (!enabled) return null;
  const e = fields?.ts && fields?.type ? fields : event(fields?.type ?? 'log', fields);
  if (!EVENT_TYPES.has(e.type)) e.type = 'log';
  try { stream.write(JSON.stringify(e) + '\n'); } catch { /* a closed stdout must not break the job */ }
  return e;
}

export const emitJob = (status, fields = {}) => emit({ type: 'job', status, ...fields });
export const emitStage = (project, stage, fields = {}) => emit({ type: 'stage', project, stage, ...fields });
export const emitProgress = (project, stage, step, done, total, fields = {}) => emit({ type: 'progress', project, stage, step, done, total, ...fields });
export const emitLog = (project, message, fields = {}) => emit({ type: 'log', project, message, ...fields });
export const emitStatus = (project, stage, fields = {}) => emit({ type: 'status', project, stage, ...fields });
export const emitArtifact = (project, path, fields = {}) => emit({ type: 'artifact', project, path, ...fields });
export const emitBudget = (project, fields = {}) => emit({ type: 'budget', project, ...fields });
export const emitError = (project, err, fields = {}) => emit({ type: 'error', project, code: err?.code, message: err?.message, error: err?.toJSON?.() ?? { message: String(err) }, ...fields });

/** Strip --events <format> before Commander parses it; turn events on when the command asked for NDJSON. */
export function takeEventsFlag(argv) {
  const args = [];
  let want = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--events') { want = true; i++; continue; }
    if (argv[i].startsWith('--events=')) { want = true; continue; }
    args.push(argv[i]);
  }
  if (want) enableEvents();
  return { argv: args, events: want };
}
