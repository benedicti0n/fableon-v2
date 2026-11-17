// `fableon models`: discover ids and verify JSON/tool support without exposing secrets.
import { loadDotEnv } from './env.js';
import { ModelRouter } from './models/router.js';
import { PROVIDERS } from './models/providers.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.js';

export async function modelsCommand(mode, provider, opts = {}) {
  loadDotEnv();
  const p = { provider, model: opts.model ?? null, baseUrl: opts.baseUrl ?? null, keyEnv: opts.keyEnv ?? null, temperature: 0.2, maxTokens: 64 };
  const project = { models: { default: p } };
  const router = new ModelRouter(process.cwd(), project, { noCache: true, logCalls: false });
  if (mode === 'list') {
    const ids = await router.models('brief');
    for (const id of ids) console.log(id);
    return { ids };
  }
  if (mode === 'catalog') {
    if (provider !== 'openrouter') throw new Error('models catalog currently supports --provider openrouter');
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('openrouter: OPENROUTER_API_KEY is missing');
    const base = PROVIDERS.openrouter.baseUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}`, ...(PROVIDERS.openrouter.headers ?? {}), Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`openrouter GET /models failed: HTTP ${res.status}`);
    const j = await res.json();
    const date = new Date().toISOString().slice(0, 10);
    const models = (j.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt ?? 0) * 1e6;
      const completion = Number(m.pricing?.completion ?? 0) * 1e6;
      const cacheRead = m.pricing?.input_cache_read != null ? Number(m.pricing.input_cache_read) * 1e6 : null;
      return {
        id: m.id, name: m.name, context: m.context_length ?? null,
        maxOutput: m.top_provider?.max_completion_tokens ?? null,
        supported_parameters: m.supported_parameters ?? [],
        price: { input: prompt, output: completion, ...(cacheRead != null ? { cacheInput: cacheRead } : {}) },
        catalogDate: date,
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
    const catalog = { date, provider: 'openrouter', baseUrl: base, privacy: PROVIDERS.openrouter.providerPreferences, models };
    writeFileSync(join(ROOT, 'models.catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
    console.log(`catalog: ${models.length} models from OpenRouter, dated ${date}; wrote models.catalog.json`);
    console.log(`privacy: ${JSON.stringify(catalog.privacy)}`);
    const cheap = [...models].filter((m) => m.price.input > 0).sort((a, b) => a.price.input + a.price.output - (b.price.input + b.price.output)).slice(0, 8);
    for (const m of cheap) console.log(`  ${m.id}  in $${m.price.input.toFixed(3)}/M out $${m.price.output.toFixed(3)}/M  ctx ${m.context ?? '?'}  json ${m.supported_parameters.includes('response_format') || m.supported_parameters.includes('structured_outputs') ? 'yes' : 'prompt-only'}`);
    return { catalog };
  }
  if (mode === 'check') {
    const keyName = p.keyEnv ?? PROVIDERS[provider]?.keyEnv ?? 'API_KEY';
    console.log(`provider: ${provider}`);
    console.log(`key: ${process.env[keyName] ? 'SET' : 'MISSING'} (${keyName})`);
    if (!process.env[keyName] && provider !== 'mock') return { ok: false, key: false };
    const ids = await router.models('brief');
    console.log(`models: ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ', …' : ''}`);
    const model = opts.model ?? ids[0];
    project.models.default.model = model;
    const r = await router.chat('brief', [{ role: 'system', content: 'Return one valid json object only.' }, { role: 'user', content: 'Return {"ok":true}.' }], {});
    console.log(`json mode: OK (${r.content.slice(0, 80)})`);
    console.log(`usage fields: ${Object.keys(r.usage ?? {}).join(', ') || 'none'}`);
    try {
      const noJson = await fetch(`${router.baseUrl('brief')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${router.key('brief')}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Return one object with ok true.' }], response_format: { type: 'json_object' }, max_tokens: 32 }), signal: AbortSignal.timeout(30000) });
      const nj = await noJson.json();
      console.log(`json word required: ${noJson.ok ? 'NO (accepted without the word)' : `YES (HTTP ${noJson.status}: ${(nj.error?.message ?? '').slice(0, 100)})`}`);
    } catch (e) { console.log(`json word probe: not available (${e.message.slice(0, 80)})`); }
    if (provider === 'deepseek') try {
      const res = await fetch(`${router.baseUrl('brief')}/beta/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${router.key('brief')}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Call ping.' }], tools: [{ type: 'function', function: { name: 'ping', strict: true, parameters: { type: 'object', additionalProperties: false, properties: { x: { type: 'string' } }, required: ['x'] } } }], tool_choice: 'auto', max_tokens: 64, thinking: { type: 'disabled' } }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json();
      console.log(`strict tool call (beta): ${res.ok ? (j.choices?.[0]?.message?.tool_calls?.length ? 'OK (returned a tool call)' : 'HTTP OK (no tool call)') : `HTTP ${res.status}`}`);
    } catch (e) { console.log(`tool call: not available (${e.message.slice(0, 120)})`); }
    return { ok: true, model, ids };
  }
  throw new Error('models needs list or check');
}
