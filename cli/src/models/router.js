// Provider-neutral model router: DeepSeek/OpenAI-compatible/mock, JSON repair, cache, retries, usage and budgets.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { ROOT, loadDotEnv } from '../env.js';
import { atomicWrite, readJson, writeJsonArtifact } from '../core/artifacts.js';
import { modelForStage, modelId, repoModels } from '../core/model-config.js';

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
  }

  stageUsage(stage) {
    if (!this.usage[stage]) this.usage[stage] = { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: null };
    return this.usage[stage];
  }

  config(stage) { return modelForStage(this.project, stage, this.repo); }

  modelName(stage) {
    const c = this.config(stage);
    if (c.provider === 'mock') return c.model ?? 'mock-v1';
    if (!c.model) throw new Error(`${stage}: no model configured (set project.models.${stage}.model or the provider env model)`);
    return c.model;
  }

  baseUrl(stage) {
    const c = this.config(stage);
    if (c.baseUrl) return c.baseUrl.replace(/\/$/, '');
    if (c.provider === 'deepseek') return (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    return '';
  }

  key(stage) {
    const c = this.config(stage);
    const name = c.keyEnv ?? (c.provider === 'deepseek' ? 'DEEPSEEK_API_KEY' : '');
    return name ? process.env[name] ?? '' : '';
  }

  async models(stage = 'brief') {
    const c = this.config(stage), base = this.baseUrl(stage), key = this.key(stage);
    if (c.provider === 'mock') return ['mock-v1'];
    if (!key) throw new Error(`${c.provider}: ${c.keyEnv ?? 'API key'} is missing`);
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: this.signal ?? undefined });
    if (!res.ok) throw new Error(`${c.provider} GET /models failed: HTTP ${res.status}`);
    const j = await res.json();
    return (j.data ?? j.models ?? []).map((m) => m.id ?? m.name).filter(Boolean);
  }

  async resolveModel(stage) {
    const c = this.config(stage);
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

  async request(stage, model, messages, params) {
    const c = this.config(stage);
    const base = this.baseUrl(stage), key = this.key(stage);
    if (c.provider === 'mock') return { content: await this.mockContent(params.mockKey ?? stage), finishReason: 'stop', usage: {} };
    if (!key) throw new Error(`${c.provider}: ${c.keyEnv ?? 'API key'} is missing (set it in the environment or .env)`);
    let lastErr;
    for (let attempt = 0; attempt <= 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error('model request timeout')), c.timeoutMs);
      const abort = () => ctrl.abort(new Error('cancelled'));
      this.signal?.addEventListener('abort', abort, { once: true });
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages, temperature: params.temperature, max_tokens: params.maxTokens, ...(params.thinking ? { thinking: { type: params.thinking } } : {}), ...(params.reasoningEffort ? { reasoning_effort: params.reasoningEffort } : {}), ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}), stream: false }),
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
    const { stage, provider, model, requestHash, cached, ms, promptTokens, completionTokens, cacheHitTokens, cacheMissTokens, reasoningTokens, reasoningContent, costUsd, finishReason, attempt, ok } = entry;
    atomicAppend(p, JSON.stringify({ ts: new Date().toISOString(), stage, provider, model, requestHash, cached, ms, promptTokens, completionTokens, ...(cacheHitTokens != null ? { cacheHitTokens } : {}), ...(cacheMissTokens != null ? { cacheMissTokens } : {}), ...(reasoningTokens != null ? { reasoningTokens } : {}), ...(reasoningContent != null ? { reasoningContent } : {}), costUsd: costUsd ?? null, finishReason, attempt, ok }) + '\n');
  }

  cost(model, usage) {
    const price = this.repo.prices?.[model];
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

  async chat(stage, messages, params = {}) {
    this.budgetCheck(stage);
    const c = this.config(stage);
    const model = await this.resolveModel(stage);
    const base = this.baseUrl(stage);
    const p = { temperature: c.temperature, maxTokens: c.maxTokens, jsonMode: params.jsonMode ?? true, thinking: c.thinking, reasoningEffort: c.reasoningEffort, mockKey: params.mockKey ?? null };
    const hash = this.requestHash(c.provider, base, model, messages, p);
    const cacheFile = this.cachePath(hash);
    const t0 = Date.now();
    if (!this.noCache && existsSync(cacheFile)) {
      const hit = readJson(cacheFile);
      const u = this.stageUsage(stage); u.cached++;
      this.logCall({ stage, provider: c.provider, model, requestHash: hash, cached: true, ms: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, finishReason: 'cached', attempt: 0, ok: true });
      return { content: hit.content, usage: hit.usage ?? {}, cached: true, finishReason: 'cached' };
    }
    this.callsByStage[stage] = (this.callsByStage[stage] ?? 0) + 1;
    const r = await this.request(stage, model, messages, p);
    const u = this.stageUsage(stage); u.calls++;
    const pu = r.usage?.prompt_tokens ?? 0, cu = r.usage?.completion_tokens ?? 0;
    u.promptTokens += pu; u.completionTokens += cu;
    this.tokensRun += pu + cu;
    const cost = this.cost(model, r.usage);
    if (cost !== null) u.costUsd = (u.costUsd ?? 0) + cost;
    if (r.finishReason === 'length') throw new Error(`model output truncated (finish_reason=length, completion tokens=${cu}); raise maxTokens`);
    if (r.content) writeJsonArtifactAtomic(cacheFile, JSON.stringify({ content: r.content, usage: r.usage ?? {} }, null, 2) + '\n');
    this.logCall({ stage, provider: c.provider, model, requestHash: hash, cached: false, ms: Date.now() - t0, promptTokens: pu, completionTokens: cu, cacheHitTokens: r.usage?.prompt_cache_hit_tokens ?? r.usage?.prompt_tokens_details?.cached_tokens, cacheMissTokens: r.usage?.prompt_cache_miss_tokens, reasoningTokens: r.usage?.completion_tokens_details?.reasoning_tokens, reasoningContent: r.hasReasoning, costUsd: cost, finishReason: r.finishReason, attempt: r.attempts ?? 1, ok: true });
    return { content: r.content, usage: r.usage ?? {}, cached: false, finishReason: r.finishReason };
  }

  async callJson(stage, messages, { validate = null, mockKey = null } = {}) {
    const c = this.config(stage);
    const msgs = messages.map((m) => ({ ...m }));
    if (!msgs.some((m) => m.role === 'system' && /json/i.test(m.content))) msgs.unshift({ role: 'system', content: 'Return one valid json object only.' });
    let lastErrors = [];
    for (let repair = 0; repair <= (c.maxRepairs ?? 2); repair++) {
      const r = await this.chat(stage, msgs, { jsonMode: true, mockKey });
      let data;
      try {
        data = parseJsonObject(r.content);
      } catch (e) {
        lastErrors = [e.message];
        msgs.push({ role: 'assistant', content: r.content.slice(0, 4000) }, { role: 'user', content: `That was not valid json. Return one json object only. Error: ${e.message}` });
        continue;
      }
      const errors = validate ? await validate(data) : [];
      if (!errors.length) return { data, usage: r.usage ?? {}, cached: r.cached };
      lastErrors = errors.slice(0, 20);
      msgs.push({ role: 'assistant', content: r.content.slice(0, 6000) }, { role: 'user', content: `Fix these validation errors and return the complete corrected json object only:\n- ${lastErrors.join('\n- ')}` });
    }
    throw new Error(`${stage}: model output failed validation after repairs:\n${lastErrors.join('\n')}`);
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
