// Provider-neutral model router: DeepSeek/OpenAI-compatible/mock, JSON repair, cache, retries, usage and budgets.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { ROOT, loadDotEnv } from '../env.js';
import { atomicWrite, readJson, writeJsonArtifact } from '../core/artifacts.js';
import { catalogModel, catalogPrice, fallbackConfigsForStage, fallbackForStage, modelForStage, modelId, repoModels } from '../core/model-config.js';
import { PROVIDERS } from './providers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.floor(Math.random() * 120);

export class ModelRouter {
  constructor(projectDir, project, { noCache = false, signal = null, onEvent = null, logCalls = true } = {}) {
    loadDotEnv();
    this.projectDir = projectDir;
    this.project = project;
    this.repo = repoModels();
    this.noCache = noCache;
    this.signal = signal;
    this.onEvent = onEvent;
    this.logCalls = logCalls;
    this.usage = {};
    this.callsByStage = {};
    this.tokensRun = 0;
    this.mockCounts = {};
    this.fallbacks = [];
  }

  stageUsage(stage) {
    if (!this.usage[stage]) this.usage[stage] = { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: null };
    return this.usage[stage];
  }

  config(stage) { return modelForStage(this.project, stage, this.repo); }

  fallback(stage) { return fallbackForStage(this.project, stage, this.repo); }

  modelName(stage, config = null) {
    const c = config ?? this.config(stage);
    if (c.provider === 'mock') return c.model ?? 'mock-v1';
    if (!c.model) throw new Error(`${stage}: no model configured (set project.models.${stage}.model or the provider env model)`);
    return c.model;
  }

  baseUrl(stage, config = null) {
    const c = config ?? this.config(stage);
    if (c.baseUrl) return c.baseUrl.replace(/\/$/, '');
    if (c.provider === 'deepseek') return (process.env.DEEPSEEK_BASE_URL || PROVIDERS.deepseek.baseUrl).replace(/\/$/, '');
    return (PROVIDERS[c.provider]?.baseUrl ?? '').replace(/\/$/, '');
  }

  key(stage, config = null) {
    const c = config ?? this.config(stage);
    const name = c.keyEnv ?? PROVIDERS[c.provider]?.keyEnv ?? '';
    return name ? process.env[name] ?? '' : '';
  }

  async models(stage = 'brief') {
    const c = this.config(stage), base = this.baseUrl(stage), key = this.key(stage);
    if (c.provider === 'mock') return ['mock-v1'];
    if (PROVIDERS[c.provider]?.models) return [...PROVIDERS[c.provider].models];
    if (!PROVIDERS[c.provider]?.modelsPath) return [];
    if (!key) throw new Error(`${c.provider}: ${c.keyEnv ?? 'API key'} is missing`);
    const headers = { ...(PROVIDERS[c.provider]?.headers ?? {}) };
    if (c.provider === 'sarvam') headers['api-subscription-key'] = key; else headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${base}${PROVIDERS[c.provider].modelsPath}`, { headers, signal: this.signal ?? undefined });
    if (!res.ok) throw new Error(`${c.provider} GET ${PROVIDERS[c.provider].modelsPath} failed: HTTP ${res.status}`);
    const j = await res.json();
    return (j.data ?? j.models ?? []).map((m) => m.id ?? m.name).filter(Boolean).map((id) => PROVIDERS[c.provider]?.stripModelsPrefix ? String(id).replace(/^models\//, '') : id);
  }

  async resolveModel(stage, config = null) {
    const c = config ?? this.config(stage);
    if (c.provider === 'mock') return c.model ?? 'mock-v1';
    if (c.model) return c.model;
    if (c.provider === 'deepseek' && process.env.DEEPSEEK_MODEL) return process.env.DEEPSEEK_MODEL;
    const ids = await this.models(stage);
    if (!ids.length) throw new Error(`${c.provider}: no models returned by /models`);
    return ids[0];
  }

  async mockContent(stage) {
    const dir = process.env.FABLEON_MOCK_DIR || join(ROOT, 'tests', 'fixtures', 'llm');
    const file = join(dir, 'responses.json');
    if (!existsSync(file)) throw new Error(`mock provider: ${file} is missing (set FABLEON_MOCK_DIR)`);
    const all = JSON.parse(readFileSync(file, 'utf8'));
    const list = all[stage] ?? all.default ?? [];
    const i = this.mockCounts[stage] ?? 0;
    this.mockCounts[stage] = i + 1;
    const item = list[Math.min(i, list.length - 1)];
    if (item === undefined) throw new Error(`mock provider: no recorded response for stage ${stage}`);
    return typeof item === 'string' ? item : JSON.stringify(item);
  }

  async request(stage, model, messages, params, config = null) {
    const c = config ?? this.config(stage);
    const base = this.baseUrl(stage, c), key = this.key(stage, c);
    if (c.provider === 'mock') return { content: await this.mockContent(params.mockKey ?? stage), finishReason: 'stop', usage: {} };
    if (!key) throw new Error(`${c.provider}: ${c.keyEnv ?? 'API key'} is missing (set it in the environment or .env)`);
    let lastErr;
    for (let attempt = 0; attempt <= 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error('model request timeout')), c.timeoutMs);
      const abort = () => ctrl.abort(new Error('cancelled'));
      this.signal?.addEventListener('abort', abort, { once: true });
      try {
        const headers = { 'content-type': 'application/json', ...(PROVIDERS[c.provider]?.headers ?? {}) };
        if (c.provider === 'sarvam') headers['api-subscription-key'] = key; else headers.Authorization = `Bearer ${key}`;
        const res = await fetch(`${base}${PROVIDERS[c.provider]?.chatPath ?? '/chat/completions'}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, messages, temperature: params.temperature, ...(c.provider === 'openai' ? { max_completion_tokens: params.maxTokens } : { max_tokens: params.maxTokens }), ...(c.provider === 'openrouter' && PROVIDERS.openrouter.providerPreferences ? { provider: PROVIDERS.openrouter.providerPreferences } : {}), ...(c.provider === 'deepseek' && params.thinking ? { thinking: { type: params.thinking } } : {}), ...(params.reasoningEffort && c.provider !== 'sarvam' ? { reasoning_effort: params.reasoningEffort } : {}), ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}), stream: false }),
          signal: ctrl.signal,
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const j = await res.json();
        const choice = j.choices?.[0];
        return { content: choice?.message?.content ?? '', finishReason: choice?.finish_reason ?? 'stop', usage: j.usage ?? {}, hasReasoning: !!choice?.message?.reasoning_content, attempts: attempt + 1 };
      } catch (e) {
        lastErr = e;
        const retriable = /HTTP (429|5\d\d)|timeout|network|fetch failed/i.test(e.message) && !this.signal?.aborted;
        if (!retriable || attempt === 3) throw e;
        await sleep(250 * 2 ** attempt + jitter());
      } finally { clearTimeout(timer); this.signal?.removeEventListener('abort', abort); }
    }
    throw lastErr;
  }

  cachePath(hash) { return join(this.projectDir, '.fableon', 'cache', `${hash}.json`); }
  requestHash(provider, base, model, messages, params) {
    return createHash('sha256').update(JSON.stringify({ provider, base, model, messages, params })).digest('hex');
  }
  logCall(entry) {
    if (!this.logCalls) return;
    const p = join(this.projectDir, 'logs', 'calls.jsonl');
    mkdirSync(join(this.projectDir, 'logs'), { recursive: true });
    const { stage, provider, model, requestHash, cached, ms, promptTokens, completionTokens, cacheHitTokens, cacheMissTokens, reasoningTokens, reasoningContent, costUsd, finishReason, attempt, ok, fallback, fallbackFrom } = entry;
    atomicAppend(p, JSON.stringify({ ts: new Date().toISOString(), stage, provider, model, requestHash, cached, ms, promptTokens, completionTokens, ...(cacheHitTokens != null ? { cacheHitTokens } : {}), ...(cacheMissTokens != null ? { cacheMissTokens } : {}), ...(reasoningTokens != null ? { reasoningTokens } : {}), ...(reasoningContent != null ? { reasoningContent } : {}), costUsd: costUsd ?? null, finishReason, attempt, ok, ...(fallback ? { fallback: true } : {}), ...(fallbackFrom ? { fallbackFrom } : {}) }) + '\n');
  }

  recordFallback(stage, from, to, reason) {
    const rec = { ts: new Date().toISOString(), stage, from: modelId(from), to: modelId(to), reason: String(reason ?? 'validation failed').slice(0, 300) };
    this.fallbacks.push(rec);
    this.stageUsage(stage).fallbacks = (this.stageUsage(stage).fallbacks ?? 0) + 1;
    return rec;
  }

  cost(model, usage) {
    const price = this.repo.prices?.[model] ?? catalogPrice(model);
    if (!price || !usage) return null;
    const hit = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
    const miss = usage.prompt_cache_miss_tokens ?? Math.max(0, (usage.prompt_tokens ?? 0) - hit);
    return (hit * (price.cacheInput ?? price.input ?? 0) + miss * (price.input ?? 0) + (usage.completion_tokens ?? 0) * (price.output ?? 0)) / 1_000_000;
  }

  budgetCheck(stage) {
    const b = this.project.budget ?? {};
    if (b.maxCallsPerStage && (this.callsByStage[stage] ?? 0) >= b.maxCallsPerStage) throw new Error(`budget: maxCallsPerStage ${b.maxCallsPerStage} reached for ${stage}`);
    if (b.maxTokensPerRun && this.tokensRun >= b.maxTokensPerRun) throw new Error(`budget: maxTokensPerRun ${b.maxTokensPerRun} reached`);
  }

  supportsJson(c, model) {
    if (c.jsonMode !== null && c.jsonMode !== undefined) return !!c.jsonMode;
    if (c.provider === 'sarvam') return false; // Bulbul's chat API documents prompt-based JSON, not response_format
    if (c.provider === 'openrouter') {
      const m = catalogModel(model);
      return m ? (m.supported_parameters ?? []).some((x) => x === 'response_format' || x === 'structured_outputs') : true;
    }
    return true;
  }

  async chat(stage, messages, params = {}) {
    this.budgetCheck(stage);
    const c = params.config ?? this.config(stage);
    const model = await this.resolveModel(stage, c);
    const base = this.baseUrl(stage, c);
    const jsonMode = params.jsonMode === undefined || params.jsonMode === null ? this.supportsJson(c, model) : params.jsonMode !== false;
    const p = { temperature: params.temperature ?? c.temperature, maxTokens: c.maxTokens, jsonMode, thinking: c.thinking, reasoningEffort: c.reasoningEffort, mockKey: params.mockKey ?? null };
    const hash = this.requestHash(c.provider, base, model, messages, p);
    const cacheFile = this.cachePath(hash);
    const t0 = Date.now();
    if (!this.noCache && existsSync(cacheFile)) {
      const hit = readJson(cacheFile);
      const u = this.stageUsage(stage); u.cached++;
      this.logCall({ stage, provider: c.provider, model, requestHash: hash, cached: true, ms: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, finishReason: 'cached', attempt: 0, ok: true, fallback: params.fallback === true, fallbackFrom: params.fallbackFrom ?? null });
      return { content: hit.content, usage: hit.usage ?? {}, cached: true, finishReason: 'cached' };
    }
    this.callsByStage[stage] = (this.callsByStage[stage] ?? 0) + 1;
    const r = await this.request(stage, model, messages, p, c);
    const u = this.stageUsage(stage); u.calls++;
    const pu = r.usage?.prompt_tokens ?? 0, cu = r.usage?.completion_tokens ?? 0;
    u.promptTokens += pu; u.completionTokens += cu;
    this.tokensRun += pu + cu;
    const cost = this.cost(model, r.usage);
    if (cost !== null) u.costUsd = (u.costUsd ?? 0) + cost;
    if (r.finishReason === 'length') throw new Error(`model output truncated (finish_reason=length, completion tokens=${cu}); raise maxTokens`);
    if (r.content) writeJsonArtifactAtomic(cacheFile, JSON.stringify({ content: r.content, usage: r.usage ?? {} }, null, 2) + '\n');
    this.logCall({ stage, provider: c.provider, model, requestHash: hash, cached: false, ms: Date.now() - t0, promptTokens: pu, completionTokens: cu, cacheHitTokens: r.usage?.prompt_cache_hit_tokens ?? r.usage?.prompt_tokens_details?.cached_tokens, cacheMissTokens: r.usage?.prompt_cache_miss_tokens, reasoningTokens: r.usage?.completion_tokens_details?.reasoning_tokens, reasoningContent: r.hasReasoning, costUsd: cost, finishReason: r.finishReason, attempt: r.attempts ?? 1, ok: true, fallback: params.fallback === true, fallbackFrom: params.fallbackFrom ?? null });
    return { content: r.content, usage: r.usage ?? {}, cached: false, finishReason: r.finishReason };
  }

  async callJson(stage, messages, { validate = null, mockKey = null, repairHint = null, temperature = null } = {}) {
    const primary = this.config(stage);
    const fbs = fallbackConfigsForStage(this.project, stage, this.repo).filter((f) => modelId(f) !== modelId(primary));
    const msgs = messages.map((m) => ({ ...m }));
    if (!msgs.some((m) => m.role === 'system' && /json/i.test(m.content))) msgs.unshift({ role: 'system', content: 'Return one valid json object only.' });
    let lastErrors = [], lastFailure = null;
    const passes = [{ config: primary, fallback: false }, ...fbs.map((config) => ({ config, fallback: true }))];
    for (const pass of passes) {
      if (pass.fallback) this.recordFallback(stage, primary, pass.config, lastFailure?.message ?? lastErrors[0] ?? 'validation failed');
      for (let repair = 0; repair <= (pass.config.maxRepairs ?? 2); repair++) {
        let r;
        try {
          r = await this.chat(stage, msgs, { mockKey, temperature, config: pass.config, fallback: pass.fallback, fallbackFrom: pass.fallback ? primary.model : null });
        } catch (e) {
          lastFailure = e;
          lastErrors = [e.message];
          break;
        }
        let data;
        try {
          data = parseJsonObject(r.content);
        } catch (e) {
          lastErrors = [e.message];
          msgs.push({ role: 'assistant', content: r.content.slice(0, 4000) }, { role: 'user', content: `That was not valid json. Return one json object only. Error: ${e.message}` });
          continue;
        }
        const errors = validate ? await validate(data) : [];
        if (!errors.length) return { data, usage: r.usage ?? {}, cached: r.cached, model: pass.config.model, fallback: pass.fallback };
        lastErrors = errors.slice(0, 20);
        msgs.push({ role: 'assistant', content: r.content.slice(0, 6000) }, { role: 'user', content: `Fix every validation error and return the complete corrected json object only. Keep the lines that are already valid. Count words before returning.\n- ${lastErrors.join('\n- ')}${repairHint ? `\n${repairHint}` : ''}` });
      }
    }
    throw new Error(`${stage}: model output failed validation after repairs${fbs.length ? ' on the primary model and its fallbacks' : ''}:\n${lastErrors.join('\n')}`);
  }
}

function atomicAppend(p, text) {
  // One line at a time keeps the usage log append-only and crash-safe enough for local runs.
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, text);
}
function writeJsonArtifactAtomic(p, text) { mkdirSync(dirname(p), { recursive: true }); atomicWrite(p, text); }
function parseJsonObject(content) {
  const s = String(content ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('no json object in response');
  return JSON.parse(s.slice(i, j + 1));
}
