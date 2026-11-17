// Provider registry/router tests with a mocked fetch: auth, paths, JSON mode, privacy, retries and cost.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelRouter } from '../cli/src/models/router.js';
import { catalogPrice, modelForStage, fallbackConfigsForStage } from '../cli/src/core/model-config.js';

export async function runProviderTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-providers-'));
  const oldFetch = globalThis.fetch;
  const calls = [];
  const reply = (content = '{"ok":true}', status = 200, usage = { prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 }) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage }), { status, headers: { 'content-type': 'application/json' } });
  try {
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      if (String(url).includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), { status: 200 });
      return reply();
    };
    const project = (stage, cfg) => ({ models: { default: { provider: cfg.provider, model: cfg.model, ...(cfg.jsonMode != null ? { jsonMode: cfg.jsonMode } : {}) }, [stage]: { provider: cfg.provider, model: cfg.model, ...(cfg.jsonMode != null ? { jsonMode: cfg.jsonMode } : {}) } } });
    const ds = new ModelRouter(tmp, project('brief', { provider: 'deepseek', model: 'deepseek-flash' }), { noCache: true, logCalls: false });
    await ds.chat('brief', [{ role: 'user', content: 'Return json.' }], { jsonMode: true });
    const dsc = calls.at(-1);
    ok('deepseek url/auth', dsc.url === 'https://api.deepseek.com/chat/completions' && dsc.opts.headers.Authorization?.startsWith('Bearer '), dsc.url);
    ok('deepseek json mode', JSON.parse(dsc.opts.body).response_format?.type === 'json_object', dsc.opts.body);
    ok('deepseek cost', Math.abs((ds.cost('deepseek-flash', { prompt_tokens: 10, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6, completion_tokens: 5 }) ?? 0) - (4 * 0.006 + 6 * 0.3 + 5 * 1.2) / 1e6) < 1e-12, 'deepseek price');

    calls.length = 0;
    const or = new ModelRouter(tmp, project('brief', { provider: 'openrouter', model: 'mistralai/mistral-nemo' }), { noCache: true, logCalls: false });
    await or.chat('brief', [{ role: 'user', content: 'Return json.' }], { jsonMode: true });
    const oc = calls.at(-1);
    const ob = JSON.parse(oc.opts.body);
    ok('openrouter url', oc.url === 'https://openrouter.ai/api/v1/chat/completions', oc.url);
    ok('openrouter privacy', ob.provider?.data_collection === 'deny', JSON.stringify(ob.provider));
    ok('openrouter attribution', oc.opts.headers['HTTP-Referer'] === 'https://fableon.local' && oc.opts.headers['X-Title'] === 'Fableon', JSON.stringify(oc.opts.headers));
    ok('openrouter json mode', ob.response_format?.type === 'json_object', JSON.stringify(ob.response_format));
    const price = catalogPrice('mistralai/mistral-nemo');
    ok('openrouter catalog price', !!price && price.currency === 'USD', JSON.stringify(price));

    calls.length = 0;
    const plain = new ModelRouter(tmp, project('brief', { provider: 'openrouter', model: 'scaledown/extract', jsonMode: false }), { noCache: true, logCalls: false });
    await plain.chat('brief', [{ role: 'user', content: 'Return json.' }], {});
    ok('prompt-only json', !JSON.parse(calls.at(-1).opts.body).response_format, calls.at(-1).opts.body);

    calls.length = 0;
    const sv = new ModelRouter(tmp, project('brief', { provider: 'sarvam', model: 'sarvam-105b' }), { noCache: true, logCalls: false });
    const sres = await sv.callJson('brief', [{ role: 'system', content: 'Return json.' }, { role: 'user', content: 'Return {"ok":true}.' }]);
    const sc = calls.at(-1);
    ok('sarvam url/auth', sc.url === 'https://api.sarvam.ai/v1/chat/completions' && sc.opts.headers['api-subscription-key'] && !sc.opts.headers.Authorization, sc.url);
    ok('sarvam prompt-only json', !JSON.parse(sc.opts.body).response_format && sres.data.ok === true, sc.opts.body);

    calls.length = 0;
    let n = 0;
    globalThis.fetch = async (url, opts = {}) => { calls.push({ url, opts }); n++; if (n === 1) return new Response('busy', { status: 429 }); return reply(); };
    const retry = new ModelRouter(tmp, project('brief', { provider: 'deepseek', model: 'deepseek-flash' }), { noCache: true, logCalls: false });
    const rr = await retry.chat('brief', [{ role: 'user', content: 'Return json.' }], { jsonMode: true });
    ok('rate limit retry', calls.length === 2 && rr.content.includes('ok'), `${calls.length} calls`);

    calls.length = 0;
    globalThis.fetch = async () => new Response('bad request', { status: 400 });
    let err = '';
    try { await retry.chat('brief', [{ role: 'user', content: 'Return json.' }], { jsonMode: true }); } catch (e) { err = e.message; }
    ok('error body surfaced', /HTTP 400/.test(err), err);

    const repo = { default: { provider: 'deepseek', model: null }, stageDefaults: { script: { primary: { provider: 'deepseek', model: 'deepseek-flash' }, fallbacks: [{ provider: 'openrouter', model: 'mistralai/mistral-nemo' }, { provider: 'deepseek', model: 'deepseek-v4-pro' }] } }, maxRepairs: 0, prices: {} };
    const cfg = modelForStage({ models: {} }, 'script', repo);
    const fbs = fallbackConfigsForStage({ models: {} }, 'script', repo);
    ok('primary/fallbacks registry', cfg.provider === 'deepseek' && fbs.length === 2 && fbs[0].provider === 'openrouter' && fbs[1].provider === 'deepseek', JSON.stringify({ cfg, fbs }));
  } finally { globalThis.fetch = oldFetch; rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
