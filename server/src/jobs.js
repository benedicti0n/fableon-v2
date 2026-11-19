// Child-process job queue: one heavy job at a time, one writer per project, NDJSON events, cancel and resume hints.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT } from '../../cli/src/env.js';
import { opArgv, opByName } from '../../cli/src/core/ops.js';
import { FableonError, ERROR_CODES } from '../../cli/src/core/errors.js';
import { isLocked, readLock } from '../../cli/src/core/lock.js';

const CLI_BIN = join(ROOT, 'cli', 'bin', 'fableon.js');
const RESUME = new Set(['render', 'final', 'animatic']);

export class JobManager {
  constructor(root, emit = () => {}) {
    this.root = root;
    this.dir = join(root, '.fableon-server');
    mkdirSync(this.dir, { recursive: true });
    this.file = join(this.dir, 'jobs.jsonl');
    this.emit = emit;
    this.jobs = new Map();
    this.children = new Map();
    this.activeHeavy = null;
    this.writers = new Set();
    this.ajv = new Ajv2020({ strict: false, allErrors: true });
    this.validators = new Map();
    this.load();
  }

  load() {
    if (!existsSync(this.file)) return;
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); if (j.id) this.jobs.set(j.id, j); } catch { /* skip a torn tail */ }
    }
    let changed = false;
    for (const j of this.jobs.values()) if (j.status === 'running') {
      j.status = 'interrupted'; j.finishedAt = new Date().toISOString(); j.progress = { ...(j.progress ?? {}), message: 'server restarted' };
      j.resumable = RESUME.has(j.op); changed = true; this.append(j);
    }
    if (changed) this.emit({ ts: new Date().toISOString(), type: 'job', status: 'interrupted', message: 'server restarted' });
  }

  append(j) { appendFileSync(this.file, JSON.stringify(j) + '\n'); }

  validator(op) {
    let v = this.validators.get(op.name);
    if (!v) { v = this.ajv.compile(op.argsSchema); this.validators.set(op.name, v); }
    return v;
  }

  list(project = null) { return [...this.jobs.values()].filter((j) => !project || j.project === project).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }

  get(id, tail = true) {
    const j = this.jobs.get(id);
    if (!j) throw new FableonError(ERROR_CODES.NOT_FOUND, `job ${id} was not found`, { job: id });
    if (!tail) return j;
    let logTail = '';
    try { const lines = readFileSync(j.logPath, 'utf8').trimEnd().split('\n'); logTail = lines.slice(-80).join('\n'); } catch { /* no log yet */ }
    return { ...j, logTail };
  }

  activeWriter(project) { return this.writers.has(project) || isLocked(project); }

  create(ctx, name, args = {}) {
    const op = opByName(name);
    if (!op) throw new FableonError(ERROR_CODES.NOT_FOUND, `unknown op "${name}"`, { op: name });
    if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
    const a = { ...(args ?? {}) };
    delete a.confirmBudget;
    if (!(op.argsSchema.properties ?? {}).project) delete a.project;
    const valid = this.validator(op);
    if (!valid(a)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `bad args for ${name}: ${this.ajv.errorsText(valid.errors)}`, { op: name, errors: valid.errors });
    if (this.activeWriter(ctx.dir)) {
      const lock = readLock(ctx.dir);
      throw new FableonError(ERROR_CODES.PROJECT_LOCKED, `${ctx.id} already has a writer`, { by: lock?.op ?? 'job', pid: lock?.pid ?? null });
    }
    const id = `job_${randomBytes(8).toString('hex')}`;
    const job = {
      id, project: ctx.id, projectDir: ctx.dir, op: name, args: a, status: 'queued', createdAt: new Date().toISOString(), startedAt: null, finishedAt: null,
      progress: { step: 'queued', done: 0, total: 0, etaMs: 0 }, error: null, heavy: !!op.heavy, cancellable: !!op.cancellable, resumable: RESUME.has(name),
      logPath: join(this.dir, `${id}.log`),
    };
    writeFileSync(job.logPath, '');
    this.jobs.set(id, job);
    this.append(job);
    this.emit({ ts: job.createdAt, type: 'job', job: id, project: ctx.id, op: name, status: 'queued', message: `${name} queued` });
    this.pump();
    return job;
  }

  pump() {
    const queued = [...this.jobs.values()].filter((j) => j.status === 'queued').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    // Light reads/writes can start while a heavy render runs, as long as no project has two writers.
    for (const j of queued.filter((x) => !x.heavy)) {
      if (!this.activeWriter(j.projectDir)) this.start(j);
    }
    if (this.activeHeavy) return;
    const heavy = queued.find((j) => j.heavy && !this.activeWriter(j.projectDir));
    if (heavy) this.start(heavy);
  }

  start(job) {
    if (job.status !== 'queued') return;
    if (job.heavy) this.activeHeavy = job;
    this.writers.add(job.projectDir);
    job.status = 'running'; job.startedAt = new Date().toISOString(); job.progress = { step: 'starting', done: 0, total: 0, etaMs: 0 };
    this.append(job);
    this.emit({ ts: job.startedAt, type: 'job', job: job.id, project: job.project, op: job.op, status: 'running', message: `${job.op} started` });
    const argv = [...opArgv(job.op, { ...job.args, project: job.projectDir }), '--events', 'ndjson'];
    const child = spawn(process.execPath, [CLI_BIN, ...argv], { cwd: ROOT, env: { ...process.env, FABLEON_JOB_ID: job.id }, stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.set(job.id, child);
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        const out = { ...ev, job: job.id, project: ev.project ?? job.project, op: ev.op ?? job.op };
        if (out.type === 'progress') job.progress = { step: out.step ?? job.progress.step, done: out.done ?? 0, total: out.total ?? 0, etaMs: out.etaMs ?? 0, message: out.message ?? job.progress.message };
        if (out.type === 'stage' && out.status) job.progress = { ...job.progress, stage: out.stage, message: out.message ?? job.progress.message };
        if (out.type === 'job' && ['done', 'failed', 'cancelled'].includes(out.status)) {
          job.status = out.status; job.error = out.error ?? null; job.finishedAt = new Date().toISOString();
        }
        this.emit(out);
      }
    });
    child.stderr.on('data', (d) => { try { appendFileSync(job.logPath, d); } catch { /* log is best effort */ } });
    child.on('close', (code, signal) => {
      this.children.delete(job.id);
      if (!['done', 'failed', 'cancelled'].includes(job.status)) {
        if (signal === 'SIGTERM' || code === 143) { job.status = 'cancelled'; job.error = null; }
        else if (code === 0) job.status = 'done';
        else { job.status = 'failed'; job.error = `exit ${code ?? signal}`; }
        job.finishedAt = new Date().toISOString();
      }
      if (job.status === 'failed' && !job.error) {
        try { const lines = readFileSync(job.logPath, 'utf8').trimEnd().split('\n'); job.error = lines.slice(-3).join(' ').slice(0, 500) || 'job failed'; } catch { job.error = 'job failed'; }
      }
      job.progress = { ...job.progress, step: job.status, done: job.progress.total || job.progress.done, etaMs: 0 };
      this.append(job);
      this.emit({ ts: job.finishedAt, type: 'job', job: job.id, project: job.project, op: job.op, status: job.status, error: job.error, message: `${job.op} ${job.status}` });
      this.emit({ ts: job.finishedAt, type: 'status', job: job.id, project: job.project, op: job.op, status: job.status === 'done' ? 'fresh' : job.status, message: 'job finished; refresh cached statuses' });
      if (this.activeHeavy?.id === job.id) this.activeHeavy = null;
      this.writers.delete(job.projectDir);
      this.pump();
    });
  }

  async close() {
    for (const child of this.children.values()) { try { child.kill('SIGTERM'); } catch { /* gone */ } }
    await new Promise((r) => setTimeout(r, 100));
    for (const child of this.children.values()) { try { child.kill('SIGKILL'); } catch { /* gone */ } }
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) throw new FableonError(ERROR_CODES.NOT_FOUND, `job ${id} was not found`, { job: id });
    if (['done', 'failed', 'cancelled', 'interrupted'].includes(job.status)) return job;
    if (job.status === 'queued') {
      job.status = 'cancelled'; job.finishedAt = new Date().toISOString(); this.append(job);
      this.emit({ ts: job.finishedAt, type: 'job', job: id, project: job.project, op: job.op, status: 'cancelled', message: 'cancelled before start' });
      return job;
    }
    const child = this.children.get(id);
    if (child) {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 10000).unref?.();
    }
    job.progress = { ...job.progress, message: 'cancelling' };
    return job;
  }
}
