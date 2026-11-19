// Per-stage hashes, statuses and approvals. State is a small, schema-validated JSON file (v2: raw-byte hashes).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT } from '../env.js';
import { fileHash, outputHash, readJson, sha256, writeJsonArtifact } from './artifacts.js';
import { FableonError, ERROR_CODES } from './errors.js';
import { STAGES, stageByName } from './stages.js';
import { modelForStage, modelId } from './model-config.js';

export const STATE_VERSION = 2;
const statePath = (projectDir) => join(projectDir, '.fableon', 'state.json');
export const emptyState = () => ({ version: STATE_VERSION, stages: {} });
export const loadState = (projectDir) => {
  if (!existsSync(statePath(projectDir))) return emptyState();
  const raw = JSON.parse(readFileSync(statePath(projectDir), 'utf8'));
  if (raw.version === STATE_VERSION) return raw;
  const next = migrateState(projectDir, raw);
  writeJsonArtifact(projectDir, 'state', '.fableon/state.json', next, 'state');
  return next;
};
export const saveState = (projectDir, state) => writeJsonArtifact(projectDir, 'state', '.fableon/state.json', state, 'state');

export const projectKeyValue = (project, key) => {
  let v = project;
  for (const part of String(key).split('.')) v = v?.[part];
  return v;
};

function inputFiles(projectDir, stage) {
  const out = [];
  for (const pattern of stage.inputs ?? []) {
    if (pattern.endsWith('/*')) {
      const dir = join(projectDir, pattern.slice(0, -2));
      if (existsSync(dir)) for (const f of readdirSync(dir).sort()) {
        if (f.startsWith('.')) continue;
        out.push(join(dir, f));
      }
    } else out.push(join(projectDir, pattern));
  }
  for (const rel of stage.extraInputs ?? []) out.push(join(ROOT, rel));
  return out;
}

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

const hashParts = (stage, model, input) => canonical({ name: stage.name, version: stage.version, project: model.keys, model: model.id, prompt: stage.prompt ?? '', input });

/** v1 hash, kept only for migration: text decoding, matching every state file written before Phase 4. */
export function computeHashV1(projectDir, project, stage, modelIdOverride = null) {
  const model = stage.name === 'voice' ? { provider: 'local', model: 'kokoro' } : modelForStage(project, stage.name);
  const id = modelIdOverride ?? modelId(model);
  const keys = Object.fromEntries((stage.projectKeys ?? []).map((k) => [k, projectKeyValue(project, k)]));
  const input = inputFiles(projectDir, stage).sort().map((p) => [basename(p), existsSync(p) ? readFileSync(p, 'utf8') : '\0missing\0']);
  return sha256(hashParts(stage, { keys, id }, input));
}

/** v2 hash: raw bytes + in-process memoised file hashes; safe for voice.wav, mix.wav and images. */
export function computeHash(projectDir, project, stage, modelIdOverride = null) {
  const model = stage.name === 'voice' ? { provider: 'local', model: 'kokoro' } : modelForStage(project, stage.name);
  const id = modelIdOverride ?? modelId(model);
  const keys = Object.fromEntries((stage.projectKeys ?? []).map((k) => [k, projectKeyValue(project, k)]));
  const input = inputFiles(projectDir, stage).sort().map((p) => [basename(p), fileHash(p) ?? '\0missing\0']);
  return sha256(hashParts(stage, { keys, id }, input));
}

/** Convert a v1 state in memory: carry status/approval only when the stored v1 hash still matches. */
export function migrateState(projectDir, raw) {
  const stages = {};
  const projectPath = join(projectDir, 'project.json');
  const project = existsSync(projectPath) ? JSON.parse(readFileSync(projectPath, 'utf8')) : null;
  for (const [name, st] of Object.entries(raw.stages ?? {})) {
    const stage = stageByName(name);
    const next = { ...st };
    if (project && stage) {
      const v1 = computeHashV1(projectDir, project, stage);
      const v2 = computeHash(projectDir, project, stage);
      if (next.hash === v1) next.hash = v2;
      if (next.approvedHash === v1) next.approvedHash = v2;
    }
    stages[name] = next;
  }
  return { version: STATE_VERSION, stages };
}

export function stageOutputHash(projectDir, stage) {
  return outputHash(projectDir, stage.outputs ?? []);
}
export function outputsExist(projectDir, stage) {
  return (stage.outputs ?? []).every((r) => existsSync(join(projectDir, r)));
}

export function statusOf(projectDir, project, stage, state = loadState(projectDir), hashFn = computeHash) {
  const st = state.stages?.[stage.name] ?? null;
  const missing = !outputsExist(projectDir, stage);
  const hash = hashFn(projectDir, project, stage);
  const outHash = stageOutputHash(projectDir, stage);
  let status;
  if (!st && stage.name === 'brief' && existsSync(join(projectDir, 'brief.md')) && readFileSync(join(projectDir, 'brief.md'), 'utf8').includes('<!-- fableon:brief-template -->')) status = 'missing';
  else if (!st && missing) status = 'missing';
  else if (missing) status = st?.status === 'failed' ? 'failed' : 'missing';
  else if (st?.status === 'running') status = 'running';
  else if (st?.status === 'failed' && st.hash === hash && st.outputHash === outHash) status = 'failed';
  else if (!st?.outputHash) status = 'edited';
  else if (st.outputHash !== outHash) status = 'edited';
  else if (st.hash !== hash) status = 'stale';
  else if (st.approvedHash === hash) status = 'approved';
  else status = 'fresh';
  return { ...stage, hash, outHash, status, approved: !!st?.approvedHash && st.approvedHash === hash && st.outputHash === outHash, state: st };
}

export function allStatuses(projectDir, project, state = loadState(projectDir), hashFn = computeHash) {
  return STAGES.map((s) => statusOf(projectDir, project, s, state, hashFn));
}

export function approve(projectDir, project, name) {
  const stage = stageByName(name);
  if (!stage) throw new FableonError(ERROR_CODES.BAD_REQUEST, `unknown stage "${name}" (choose ${STAGES.map((s) => s.name).join(', ')})`, { stage: name });
  const state = loadState(projectDir);
  const s = statusOf(projectDir, project, stage, state);
  if (!outputsExist(projectDir, stage)) throw new FableonError(ERROR_CODES.NOT_FOUND, `${name} has no output to approve`, { stage: name });
  state.stages[name] = { ...(state.stages[name] ?? {}), hash: s.hash, outputHash: s.outHash, approvedHash: s.hash, status: 'approved', lastRun: state.stages[name]?.lastRun ?? new Date().toISOString(), usage: state.stages[name]?.usage ?? { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: null } };
  saveState(projectDir, state);
  return s;
}

export function recordStage(projectDir, project, name, { status = 'fresh', usage = null, error = null } = {}) {
  const stage = stageByName(name);
  const state = loadState(projectDir);
  const hash = computeHash(projectDir, project, stage);
  const outHash = stageOutputHash(projectDir, stage);
  const prev = state.stages[name] ?? {};
  state.stages[name] = {
    ...prev, hash, outputHash: outHash, status,
    ...(usage ? { usage } : {}),
    ...(error !== null ? { error } : {}),
    lastRun: status === 'running' ? prev.lastRun ?? null : new Date().toISOString(),
    ...(status === 'running' ? { startedAt: new Date().toISOString() } : { finishedAt: new Date().toISOString() }),
  };
  saveState(projectDir, state);
  return state.stages[name];
}

/** True when this stage's current output files are the ones the user approved, even if inputs have since changed. */
export function isApprovedLocked(projectDir, project, name, state = loadState(projectDir)) {
  const stage = stageByName(name);
  const st = state.stages?.[name];
  if (!stage || !st?.approvedHash) return false;
  return st.outputHash === stageOutputHash(projectDir, stage);
}

/** Approved stage outputs are read-only unless the user explicitly forces a non-autopilot run. */
export function assertWritable(projectDir, project, name, { autopilot = false, force = false } = {}) {
  if (!isApprovedLocked(projectDir, project, name)) return;
  if (autopilot) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, `${name} output is approved and read-only in autopilot; review it and rerun without --autopilot`, { stage: name });
  if (!force) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, `${name} output is approved; review the new inputs and rerun with --force to replace it, or approve the new output`, { stage: name });
}

export function markScriptRevised(projectDir, { force = false } = {}) {
  const project = readJson(join(projectDir, 'project.json'), 'project');
  if (isApprovedLocked(projectDir, project, 'script') && !force) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'script output is approved and read-only; rerun with --force without autopilot to revise it', { stage: 'script' });
  const stage = stageByName('script');
  const state = loadState(projectDir);
  const hash = computeHash(projectDir, project, stage);
  state.stages.script = { ...(state.stages.script ?? {}), hash, outputHash: stageOutputHash(projectDir, stage), status: 'fresh', approvedHash: null, lastRun: new Date().toISOString() };
  saveState(projectDir, state);
}

export function pronunciationTodos(projectDir) {
  const p = join(projectDir, 'script.json');
  const pr = join(projectDir, 'pronunciations.json');
  if (!existsSync(p)) return [];
  const script = readJson(p, 'script');
  const known = existsSync(pr) ? readJson(pr, 'pronunciations') : {};
  return (script.names ?? []).filter((n) => !known[n.word] || n.suggested).map((n) => n.word);
}

export function statusTable(projectDir) {
  const project = readJson(join(projectDir, 'project.json'), 'project');
  const state = loadState(projectDir);
  const rows = allStatuses(projectDir, project, state).map((s) => {
    const u = s.state?.usage ?? {};
    return { stage: s.name, status: s.status, approved: s.approved ? 'yes' : 'no', lastRun: s.state?.lastRun ?? '-', tokens: `${u.promptTokens ?? 0}/${u.completionTokens ?? 0}`, cost: u.costUsd == null ? '-' : `$${Number(u.costUsd).toFixed(4)}` };
  });
  const reviewPath = join(projectDir, 'script.review.json');
  const craft = existsSync(reviewPath) ? readJson(reviewPath).lines?.filter((l) => l.craft === 'weak').map((l) => ({ n: l.n, note: l.note })) ?? [] : [];
  return { rows, todos: pronunciationTodos(projectDir), craft, state };
}
