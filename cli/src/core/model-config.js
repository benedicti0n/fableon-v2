// Resolve per-stage model settings without making a network call (used by hashing/status).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.js';

export function repoModels() {
  try { return JSON.parse(readFileSync(join(ROOT, 'models.json'), 'utf8')); }
  catch { return { default: { provider: 'deepseek', model: null }, timeoutMs: 120000, maxRepairs: 2, prices: {} }; }
}

export function modelForStage(project, stage, repo = repoModels()) {
  const d = repo.default ?? { provider: 'deepseek', model: null };
  const sd = repo.stageDefaults?.[stage] ?? {};
  const p = project.models?.default ?? d;
  const s = project.models?.[stage] ?? {};
  const provider = s.provider ?? p.provider ?? sd.provider ?? d.provider;
  const model = s.model ?? p.model ?? sd.model ?? d.model ?? null;
  return {
    provider,
    model,
    baseUrl: s.baseUrl ?? p.baseUrl ?? repo.providers?.[provider]?.baseUrl ?? null,
    keyEnv: s.keyEnv ?? p.keyEnv ?? repo.providers?.[provider]?.keyEnv ?? null,
    temperature: s.temperature ?? p.temperature ?? sd.temperature ?? d.temperature ?? 0.7,
    maxTokens: s.maxTokens ?? p.maxTokens ?? d.maxTokens ?? 4096,
    thinking: s.thinking ?? sd.thinking ?? null,
    reasoningEffort: s.reasoningEffort ?? sd.reasoningEffort ?? null,
    timeoutMs: repo.timeoutMs ?? 120000,
    maxRepairs: repo.maxRepairs ?? 2,
    prices: repo.prices?.[model] ?? null,
  };
}

export const modelId = (m) => `${m.provider}:${m.model ?? ''}`;
