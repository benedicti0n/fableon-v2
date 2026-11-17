// Resolve per-stage model settings without making a network call (used by hashing/status).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.js';
import { PROVIDERS } from '../models/providers.js';

export function repoModels() {
  try { return JSON.parse(readFileSync(join(ROOT, 'models.json'), 'utf8')); }
  catch { return { default: { provider: 'deepseek', model: null }, timeoutMs: 120000, maxRepairs: 2, prices: {} }; }
}

let catalogCache = null;
export function modelCatalog() {
  if (catalogCache) return catalogCache;
  try { catalogCache = JSON.parse(readFileSync(join(ROOT, 'models.catalog.json'), 'utf8')); }
  catch { catalogCache = { models: [] }; }
  return catalogCache;
}

export function catalogModel(model) {
  return (modelCatalog().models ?? []).find((m) => m.id === model) ?? null;
}

export function catalogPrice(model) {
  const m = catalogModel(model);
  if (!m?.price) return null;
  const p = m.price;
  if (typeof p.input !== 'number' || typeof p.output !== 'number') return null;
  return { input: p.input, output: p.output, cacheInput: p.cacheInput ?? null, currency: 'USD', unit: 'per 1M tokens', source: 'openrouter', date: m.catalogDate ?? modelCatalog().date ?? null };
}

const fallbacksOf = (sd) => (sd.fallbacks ?? (sd.fallback ? [sd.fallback] : [])).filter(Boolean);
const primaryOf = (sd) => sd.primary ?? sd;
const baseFor = (provider, override, p, sd, d, repo) => ({
  provider,
  model: override.model ?? p.model ?? sd.model ?? d.model ?? null,
  baseUrl: override.baseUrl ?? p.baseUrl ?? PROVIDERS[provider]?.baseUrl ?? repo.providers?.[provider]?.baseUrl ?? null,
  keyEnv: override.keyEnv ?? p.keyEnv ?? PROVIDERS[provider]?.keyEnv ?? repo.providers?.[provider]?.keyEnv ?? null,
  temperature: override.temperature ?? p.temperature ?? sd.temperature ?? d.temperature ?? 0.7,
  maxTokens: override.maxTokens ?? p.maxTokens ?? sd.maxTokens ?? d.maxTokens ?? 4096,
  thinking: override.thinking ?? sd.thinking ?? null,
  reasoningEffort: override.reasoningEffort ?? sd.reasoningEffort ?? null,
  timeoutMs: repo.timeoutMs ?? 120000,
  maxRepairs: override.maxRepairs ?? sd.maxRepairs ?? repo.maxRepairs ?? 2,
  jsonMode: override.jsonMode ?? sd.jsonMode ?? null,
});

export function modelForStage(project, stage, repo = repoModels()) {
  const d = repo.default ?? { provider: 'deepseek', model: null };
  const raw = repo.stageDefaults?.[stage] ?? {};
  const sd = primaryOf(raw);
  const p = project.models?.default ?? d;
  const s = project.models?.[stage] ?? {};
  const primary = s.primary ?? s;
  const provider = primary.provider ?? p.provider ?? sd.provider ?? d.provider;
  const cfg = baseFor(provider, primary, p, sd, d, repo);
  cfg.prices = repo.prices?.[cfg.model] ?? catalogPrice(cfg.model) ?? null;
  return cfg;
}

/** All explicit fallbacks for a stage (models.json or project.models.<stage>.fallback / .fallbacks). */
export function fallbackConfigsForStage(project, stage, repo = repoModels()) {
  const raw = repo.stageDefaults?.[stage] ?? {};
  const s = project.models?.[stage] ?? {};
  const base = modelForStage(project, stage, repo);
  if (base.provider === 'mock') return [];
  const explicitModel = !!(s.model || project.models?.default?.model || s.primary?.model);
  const list = s.fallbacks ?? (s.fallback ? [s.fallback] : fallbacksOf(raw));
  if (explicitModel && !s.fallback && !s.fallbacks) return [];
  return list.map((fb) => {
    const provider = fb.provider ?? base.provider;
    const model = fb.model ?? base.model ?? null;
    return {
      ...base,
      provider,
      model,
      baseUrl: fb.baseUrl ?? PROVIDERS[provider]?.baseUrl ?? repo.providers?.[provider]?.baseUrl ?? base.baseUrl,
      keyEnv: fb.keyEnv ?? PROVIDERS[provider]?.keyEnv ?? repo.providers?.[provider]?.keyEnv ?? base.keyEnv,
      temperature: fb.temperature ?? base.temperature,
      maxTokens: fb.maxTokens ?? base.maxTokens,
      thinking: fb.thinking ?? null,
      reasoningEffort: fb.reasoningEffort ?? null,
      jsonMode: fb.jsonMode ?? base.jsonMode ?? null,
      prices: repo.prices?.[model] ?? catalogPrice(model) ?? null,
    };
  }).filter((c) => c.provider !== 'mock');
}

/** The first explicit per-stage fallback, kept for callers that need one config. */
export function fallbackForStage(project, stage, repo = repoModels()) {
  return fallbackConfigsForStage(project, stage, repo)[0] ?? null;
}

export const modelId = (m) => `${m.provider}:${m.model ?? ''}:${m.thinking ?? ''}:${m.reasoningEffort ?? ''}:${m.temperature ?? ''}:${m.maxTokens ?? ''}`;
