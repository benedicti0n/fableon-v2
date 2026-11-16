// Per-stage hashes, statuses and approvals. State is a small, schema-validated JSON file.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT } from '../env.js';
import { outputHash, readJson, sha256, writeJsonArtifact } from './artifacts.js';
import { STAGES, stageByName, stageOrder } from './stages.js';
import { modelForStage, modelId } from './model-config.js';

const statePath = (projectDir) => join(projectDir, '.fableon', 'state.json');
export const emptyState = () => ({ version: 1, stages: {} });
export const loadState = (projectDir) => existsSync(statePath(projectDir)) ? readJson(statePath(projectDir), 'state') : emptyState();
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

/** Stage hash: stage name/version, relevant project keys, model, prompt and input file contents. */
export function computeHash(projectDir, project, stage, modelIdOverride = null) {
  const model = stage.name === 'voice' ? { provider: 'local', model: 'kokoro' } : modelForStage(project, stage.name);
  const id = modelIdOverride ?? modelId(model);
  const keys = Object.fromEntries((stage.projectKeys ?? []).map((k) => [k, projectKeyValue(project, k)]));
  const input = inputFiles(projectDir, stage).sort().map((p) => [basename(p), existsSync(p) ? readFileSync(p, 'utf8') : '\0missing\0']);
  return sha256(canonical({ name: stage.name, version: stage.version, project: keys, model: id, prompt: stage.prompt ?? '', input }));
}

export function stageOutputHash(projectDir, stage) {
  return outputHash(projectDir, stage.outputs ?? []);
}
export function outputsExist(projectDir, stage) {
  return (stage.outputs ?? []).every((r) => existsSync(join(projectDir, r)));
}

export function statusOf(projectDir, project, stage, state = loadState(projectDir)) {
  const st = state.stages?.[stage.name] ?? null;
  const missing = !outputsExist(projectDir, stage);
  const hash = computeHash(projectDir, project, stage);
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

export function allStatuses(projectDir, project, state = loadState(projectDir)) {
  return STAGES.map((s) => statusOf(projectDir, project, s, state));
}

export function approve(projectDir, project, name) {
  const stage = stageByName(name);
  if (!stage) throw new Error(`unknown stage "${name}" (choose ${STAGES.map((s) => s.name).join(', ')})`);
  const state = loadState(projectDir);
  const s = statusOf(projectDir, project, stage, state);
  if (!outputsExist(projectDir, stage)) throw new Error(`${name} has no output to approve`);
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

export function markScriptRevised(projectDir) {
  const project = readJson(join(projectDir, 'project.json'), 'project');
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
