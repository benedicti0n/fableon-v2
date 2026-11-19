// Production queue and preset batching. One stage per job, gates wait for the user, non-gate stages auto-approve.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { ROOT } from '../../cli/src/env.js';
import { randomBytes } from 'node:crypto';
import { newProject } from '../../cli/src/core/new-project.js';
import { writeJsonArtifact, validationErrors, atomicWrite } from '../../cli/src/core/artifacts.js';
import { STAGES, stageByName, stageOrder } from '../../cli/src/core/stages.js';
import { approve, statusOf, loadState } from '../../cli/src/core/state.js';
import { collectUsage, summarize } from '../../cli/src/usage.js';

const json = (p, fallback = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const idFor = (name) => `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'short'}`;

export function listPresets(root) {
  const out = [];
  for (const [dir, builtIn] of [[join(ROOT, 'presets'), true], [join(root, '.fableon', 'presets'), false]]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const data = json(join(dir, f));
      if (!data) continue;
      out.push({ ...data, builtIn, file: join(dir, f) });
    }
  }
  return out.sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));
}

export function readPreset(root, id) {
  const p = listPresets(root).find((x) => x.id === id);
  if (!p) throw new Error(`preset ${id} was not found`);
  return p;
}

export function savePreset(root, data, { builtIn = false } = {}) {
  if (builtIn) throw new Error('built-in presets are read-only');
  const errs = validationErrors('preset', data);
  if (errs.length) throw new Error(`preset validation: ${errs.join('; ')}`);
  const file = join(root, '.fableon', 'presets', `${data.id}.json`);
  atomicWrite(file, JSON.stringify(data, null, 2) + '\n');
  return data;
}

export function deletePreset(root, id) {
  const file = join(root, '.fableon', 'presets', `${id}.json`);
  if (!existsSync(file)) return false;
  rmSync(file, { force: true });
  return true;
}

export function listLibrary(root) {
  const dir = join(root, 'library');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /\.(md|txt|html?)$/i.test(e.name)).map((e) => ({ name: e.name, size: statSync(join(dir, e.name)).size }));
}

function projectCost(projectDir) {
  try { const u = summarize(collectUsage(projectDir)); return +(u.deep.cost + u.eleven.cost).toFixed(4); } catch { return 0; }
}

export class ProductionQueue {
  constructor(root, jobs, hub, { interval = 1500 } = {}) {
    this.root = resolve(root);
    this.jobs = jobs;
    this.hub = hub;
    this.dir = join(this.root, '.fableon');
    this.file = join(this.dir, 'queue.json');
    this.items = [];
    this.paused = true;
    this.timer = null;
    this.interval = interval;
    this.load();
    this.startClock();
  }
  load() {
    const data = json(this.file, { version: 1, paused: true, items: [] });
    this.paused = data.paused !== false;
    this.items = (data.items ?? []).map((i) => i.status === 'running' ? { ...i, status: 'paused', jobId: null, note: 'server restarted' } : i);
  }
  save() { mkdirSync(this.dir, { recursive: true }); atomicWrite(this.file, JSON.stringify({ version: 1, paused: this.paused, items: this.items, updatedAt: new Date().toISOString() }, null, 2) + '\n'); }
  emit(item, message = null) { this.hub?.broadcast({ ts: new Date().toISOString(), type: 'queue', project: item?.project ?? null, item: item?.id ?? null, status: item?.status ?? null, message }); }
  startClock() { if (this.timer) return; this.timer = setInterval(() => this.tick().catch((e) => console.error('queue:', e.message)), this.interval); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  setPaused(v) { this.paused = !!v; this.save(); this.emit(null, this.paused ? 'paused' : 'started'); if (!this.paused) this.tick().catch(() => {}); }
  async pauseNow() {
    this.paused = true;
    const running = this.items.find((i) => i.status === 'running' && i.jobId);
    if (running) { try { await this.jobs.cancel(running.jobId); } catch { /* ended */ } running.status = 'paused'; running.jobId = null; running.note = 'paused now'; }
    this.save(); this.emit(running, 'paused now'); return running ?? null;
  }
  remove(id) { const i = this.items.find((x) => x.id === id); if (!i || i.status === 'running') return false; this.items = this.items.filter((x) => x.id !== id); this.save(); this.emit(i, 'removed'); return true; }
  reorder(ids) { const map = new Map(this.items.map((i) => [i.id, i])); const next = ids.map((id) => map.get(id)).filter(Boolean); for (const i of this.items) if (!ids.includes(i.id)) next.push(i); this.items = next; this.save(); return this.items; }
  retry(id) { const i = this.items.find((x) => x.id === id); if (!i) return null; i.status = 'queued'; i.jobId = null; i.note = null; this.save(); this.emit(i, 'retry'); return i; }
  list() { return { paused: this.paused, items: this.items }; }

  async createBatch({ presetId, topics = [], library = [], to = null }) {
    const preset = readPreset(this.root, presetId);
    if (preset.format !== 'short-vertical') throw new Error('only short-vertical presets are enabled in this phase');
    const lines = Array.isArray(topics) ? topics : String(topics).split('\n');
    const created = [];
    for (const raw of lines.map((x) => String(x).trim()).filter(Boolean)) {
      const [topicPart, secondsPart, filesPart] = raw.split('|').map((x) => x.trim());
      const seconds = Number(secondsPart) > 0 ? Number(secondsPart) : preset.seconds;
      const attached = [...new Set([...(preset.research?.library ?? []), ...(filesPart ? filesPart.split(',').map((x) => x.trim()).filter(Boolean) : []), ...(library ?? [])])];
      let id = idFor(topicPart);
      let dir = join(this.root, id);
      for (let n = 2; existsSync(dir); n++) { id = `${idFor(topicPart)}-${n}`; dir = join(this.root, id); }
      const made = newProject(dir, { topic: topicPart, seconds, voice: preset.voice?.voice ?? 'am_michael', language: preset.language ?? 'hi' });
      const project = { ...made.project, voice: preset.voice, models: preset.models ?? made.project.models, research: { web: !!preset.research?.web, maxSources: Number(preset.research?.maxSources ?? 8) } };
      writeJsonArtifact(dir, 'preset', 'project.json', project, 'project');
      for (const f of attached) {
        const src = join(this.root, 'library', basename(f));
        if (existsSync(src)) cpSync(src, join(dir, 'research', 'sources', basename(src)));
      }
      const item = {
        id: `q_${randomBytes(6).toString('hex')}`, project: id, projectDir: dir, presetId: preset.id, action: 'autopilot',
        to: to ?? (preset.publish?.enabled ? 'publish' : 'final'), status: 'queued', gates: preset.gates ?? [],
        budgetUsd: Number(preset.budgetUsd ?? 0), estimate: { lowUsd: +(Number(preset.budgetUsd ?? 0) * 0.55).toFixed(2), highUsd: +(Number(preset.budgetUsd ?? 0) * 1.1).toFixed(2) },
        spent: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), jobId: null, note: null,
      };
      this.items.push(item); created.push({ item, project });
      this.emit(item, 'queued');
    }
    this.save();
    return { preset, items: created, estimate: { lowUsd: +(created.reduce((n, x) => n + x.item.estimate.lowUsd, 0)).toFixed(2), highUsd: +(created.reduce((n, x) => n + x.item.estimate.highUsd, 0)).toFixed(2) } };
  }

  async tick() {
    if (this.paused) return;
    // Finish the job from a previous tick first.
    for (const item of this.items.filter((i) => i.status === 'running' && i.jobId)) {
      let job;
      try { job = this.jobs.get(item.jobId, false); } catch { item.status = 'failed'; item.note = 'job was lost'; item.jobId = null; this.save(); continue; }
      if (['done', 'failed', 'cancelled', 'interrupted'].includes(job.status)) {
        item.jobId = null;
        item.spent = projectCost(item.projectDir);
        if (job.status !== 'done') {
          item.status = job.status === 'interrupted' ? 'paused' : 'failed';
          item.note = job.error ?? `job ${job.status}`;
        } else if (item.budgetUsd > 0 && item.spent > item.budgetUsd) {
          item.status = 'failed'; item.note = `budget exceeded: $${item.spent} > $${item.budgetUsd}`;
        } else item.status = 'queued';
        item.updatedAt = new Date().toISOString();
        this.save(); this.emit(item, item.note ?? 'stage done');
      }
    }
    if (this.items.some((i) => i.status === 'running')) return;
    // Interactive or other jobs run first.
    if (this.jobs.list().some((j) => j.status === 'running' || j.status === 'queued')) return;
    const item = this.items.find((i) => i.status === 'queued');
    if (!item) return;
    const ctx = { id: item.project, dir: item.projectDir, project: json(join(item.projectDir, 'project.json')), readOnly: false };
    if (!ctx.project) { item.status = 'failed'; item.note = 'project.json is missing'; this.save(); return; }
    const to = stageOrder(item.to);
    if (to < 0) { item.status = 'failed'; item.note = `unknown target ${item.to}`; this.save(); return; }
    for (const stage of STAGES.slice(0, to + 1)) {
      const status = statusOf(item.projectDir, ctx.project, stage);
      if (status.status === 'approved') continue;
      if (status.status === 'fresh') {
        if ((item.gates ?? []).includes(stage.name)) {
          item.status = 'waiting'; item.note = `waiting for ${stage.name} approval`; item.updatedAt = new Date().toISOString();
          this.save(); this.emit(item, item.note); return;
        }
        try { approve(item.projectDir, ctx.project, stage.name, { by: 'autopilot' }); } catch (e) { item.status = 'failed'; item.note = e.message; this.save(); this.emit(item, item.note); return; }
        continue;
      }
      try {
        const job = this.jobs.create(ctx, 'run', { to: stage.name, only: stage.name, autopilot: true, force: true });
        item.status = 'running'; item.jobId = job.id; item.note = `running ${stage.name}`; item.updatedAt = new Date().toISOString();
        this.save(); this.emit(item, item.note);
      } catch (e) {
        item.status = 'failed'; item.note = e.message; item.updatedAt = new Date().toISOString(); this.save(); this.emit(item, item.note);
      }
      return;
    }
    item.status = 'done'; item.spent = projectCost(item.projectDir); item.updatedAt = new Date().toISOString(); this.save(); this.emit(item, 'done');
  }
}
