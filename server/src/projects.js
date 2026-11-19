// Project discovery and mutation shared by the API routes.
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ROOT } from '../../cli/src/env.js';
import { approve, loadState, saveState, stageOutputHash, statusTable, computeHash } from '../../cli/src/core/state.js';
import { stageByName } from '../../cli/src/core/stages.js';
import { readJson, writeJsonArtifact } from '../../cli/src/core/artifacts.js';
import { recordFactcheckOverride } from '../../cli/src/stages/factcheck.js';
import { newProject } from '../../cli/src/core/new-project.js';
import { FableonError, ERROR_CODES } from '../../cli/src/core/errors.js';

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;
const FIXTURES = join(ROOT, 'fixtures');

export function projectRoot(root = join(ROOT, 'work')) { return resolve(root); }

export function listProjects(rootDir) {
  const out = [];
  const scan = (base, readOnly) => {
    if (!existsSync(base)) return;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
      const dir = join(base, e.name);
      if (!existsSync(join(dir, 'project.json'))) continue;
      let project; try { project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')); } catch { continue; }
      out.push({ id: e.name, title: project.title ?? e.name, path: dir, readOnly, source: readOnly ? 'fixture' : 'work', updatedAt: statSync(join(dir, 'project.json')).mtime.toISOString() });
    }
  };
  scan(rootDir, false);
  scan(FIXTURES, true);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveProject(rootDir, id) {
  if (!ID.test(String(id))) throw new FableonError(ERROR_CODES.BAD_REQUEST, `bad project id "${id}"`, { id });
  for (const [base, readOnly, source] of [[rootDir, false, 'work'], [FIXTURES, true, 'fixture']]) {
    const dir = join(base, String(id));
    if (existsSync(join(dir, 'project.json'))) return { id: id, dir, project: JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')), readOnly, source };
  }
  throw new FableonError(ERROR_CODES.NOT_FOUND, `project ${id} was not found`, { project: id });
}

export function details(ctx) {
  const t = statusTable(ctx.dir);
  const stageRows = t.rows.map((r) => {
    const st = t.state.stages?.[r.stage] ?? null;
    return { ...r, usage: st?.usage ?? null, error: st?.error ?? null };
  });
  const usage = stageRows.reduce((a, r) => {
    const u = r.usage ?? {};
    return { calls: a.calls + (u.calls ?? 0), cached: a.cached + (u.cached ?? 0), promptTokens: a.promptTokens + (u.promptTokens ?? 0), completionTokens: a.completionTokens + (u.completionTokens ?? 0), costUsd: a.costUsd + (u.costUsd ?? 0) };
  }, { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 });
  return { id: ctx.id, readOnly: ctx.readOnly, source: ctx.source, project: ctx.project, stages: stageRows, todos: t.todos, craft: t.craft, usage };
}

export function createProject(rootDir, body = {}) {
  const topic = String(body.topic ?? '').trim();
  if (!topic) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'topic is required');
  const slug = String(body.id ?? topic).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
  const dir = join(projectRoot(rootDir), slug);
  if (existsSync(dir)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `project ${slug} already exists`, { id: slug });
  const created = newProject(dir, { topic, seconds: Number(body.seconds ?? 90), voice: typeof body.voice === 'string' ? body.voice : 'am_michael', language: body.language ?? 'en' });
  if (body.voice) {
    if (typeof body.voice === 'string' && ['sarvam', 'elevenlabs', 'kokoro'].includes(body.voice)) {
      created.project.voice = body.voice === 'sarvam'
        ? { provider: 'sarvam', model: 'bulbul:v4-flash', voiceId: 'nachiket_hi_devotional', language: 'hi', performance: true, pace: 1.1, fit: 'natural', maxCharsPerRun: 10000 }
        : body.voice === 'elevenlabs'
          ? { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: null, language: body.language ?? 'hi', settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 }, maxCharsPerRun: 10000 }
          : { engine: 'kokoro', voice: 'am_michael', speed: 1.35, language: 'en' };
    } else if (typeof body.voice === 'object') created.project.voice = body.voice;
    writeJsonArtifact(dir, 'api', 'project.json', created.project, 'project');
  }
  return resolveProject(rootDir, slug);
}

const PATCH_KEYS = new Set(['voice', 'models', 'autopilot', 'budget', 'look', 'published']);
export function patchProject(ctx, patch = {}) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  const next = { ...ctx.project };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!PATCH_KEYS.has(k)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `project key "${k}" is not editable through the API`, { key: k });
    next[k] = v && typeof v === 'object' && !Array.isArray(v) && ctx.project[k] && typeof ctx.project[k] === 'object' ? { ...ctx.project[k], ...v } : v;
  }
  writeJsonArtifact(ctx.dir, 'api', 'project.json', next, 'project');
  ctx.project = next;
  return details(ctx);
}

export function archiveProject(rootDir, ctx) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  const dest = join(projectRoot(rootDir), '.archive');
  const target = join(dest, `${ctx.id}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  renameSync(ctx.dir, target);
  return { id: ctx.id, archived: target };
}

export function approveStage(ctx, stage, override = null) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  if (stage === 'factcheck' && override) recordFactcheckOverride(ctx.dir, override);
  const s = approve(ctx.dir, ctx.project, stage);
  return { stage, hash: s.hash, status: 'approved' };
}

export function stageNotes(ctx, stage, text) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  if (!['cast', 'shotplan'].includes(stage)) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'notes are only supported for cast and shotplan', { stage });
  const rel = `${stage}.notes.json`;
  const file = join(ctx.dir, rel);
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { version: 1, notes: [] };
  if (!data.notes.some((n) => n.text === text)) data.notes.push({ ts: new Date().toISOString(), text });
  writeJsonArtifact(ctx.dir, stage, rel, data, stage === 'cast' ? 'cast-notes' : 'shotplan-notes');
  return { stage, notes: data.notes.length, file: rel };
}

export function markEdited(ctx, stage) {
  if (!stage) return;
  const s = stageByName(stage);
  if (!s) return;
  const state = loadState(ctx.dir);
  state.stages[stage] = { ...(state.stages[stage] ?? {}), hash: computeHash(ctx.dir, ctx.project, s), outputHash: stageOutputHash(ctx.dir, s), status: 'edited', approvedHash: null, lastRun: new Date().toISOString() };
  saveState(ctx.dir, state);
}
