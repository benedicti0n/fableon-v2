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
    maxTokens: s.maxTokens ?? p.maxTokens ?? sd.maxTokens ?? d.maxTokens ?? 4096,
    thinking: s.thinking ?? sd.thinking ?? null,
    reasoningEffort: s.reasoningEffort ?? sd.reasoningEffort ?? null,
    timeoutMs: repo.timeoutMs ?? 120000,
    maxRepairs: s.maxRepairs ?? sd.maxRepairs ?? repo.maxRepairs ?? 2,
    prices: repo.prices?.[model] ?? null,
  };
}

/** The explicit per-stage fallback (models.json or project.models.<stage>.fallback), or null. */
export function fallbackForStage(project, stage, repo = repoModels()) {
  const sd = repo.stageDefaults?.[stage] ?? {};
  const s = project.models?.[stage] ?? {};
  const fb = s.fallback ?? sd.fallback;
  if (!fb) return null;
  const base = modelForStage(project, stage, repo);
  if (base.provider === 'mock') return null;
  // An explicit model choice is the user's call; only an explicit fallback may override it.
  const explicitModel = !!(s.model || project.models?.default?.model);
  if (explicitModel && !s.fallback) return null;
  const p = project.models?.default ?? repo.default ?? {};
  const provider = fb.provider ?? base.provider;
  const model = fb.model ?? base.model ?? null;
  return {
    provider,
    model,
    baseUrl: fb.baseUrl ?? p.baseUrl ?? repo.providers?.[provider]?.baseUrl ?? base.baseUrl,
    keyEnv: fb.keyEnv ?? p.keyEnv ?? repo.providers?.[provider]?.keyEnv ?? base.keyEnv,
    temperature: fb.temperature ?? base.temperature,
    maxTokens: fb.maxTokens ?? base.maxTokens,
    thinking: fb.thinking ?? null,
    reasoningEffort: fb.reasoningEffort ?? null,
    timeoutMs: base.timeoutMs,
    maxRepairs: base.maxRepairs,
    prices: repo.prices?.[model] ?? null,
  };
}

export const modelId = (m) => `${m.provider}:${m.model ?? ''}:${m.thinking ?? ''}:${m.reasoningEffort ?? ''}:${m.temperature ?? ''}:${m.maxTokens ?? ''}`;
