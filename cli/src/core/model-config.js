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
  const p = project.models?.default ?? d;
  const s = project.models?.[stage] ?? {};
  return {
    provider: s.provider ?? p.provider ?? d.provider,
    model: s.model ?? p.model ?? d.model ?? null,
    baseUrl: s.baseUrl ?? p.baseUrl ?? repo.providers?.[s.provider ?? p.provider]?.baseUrl ?? null,
    keyEnv: s.keyEnv ?? p.keyEnv ?? repo.providers?.[s.provider ?? p.provider]?.keyEnv ?? null,
    temperature: s.temperature ?? p.temperature ?? d.temperature ?? 0.7,
    maxTokens: s.maxTokens ?? p.maxTokens ?? d.maxTokens ?? 4096,
    timeoutMs: repo.timeoutMs ?? 120000,
    maxRepairs: repo.maxRepairs ?? 2,
    prices: repo.prices?.[s.model ?? p.model ?? d.model] ?? null,
  };
}

export const modelId = (m) => `${m.provider}:${m.model ?? ''}`;
