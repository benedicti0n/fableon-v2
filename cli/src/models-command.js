// `fableon models`: discover ids and verify JSON/tool support without exposing secrets.
import { loadDotEnv } from './env.js';
import { ModelRouter } from './models/router.js';

export async function modelsCommand(mode, provider, opts = {}) {
  loadDotEnv();
  const p = { provider, model: opts.model ?? null, baseUrl: opts.baseUrl ?? null, keyEnv: opts.keyEnv ?? null, temperature: 0.2, maxTokens: 64 };
  const project = { models: { default: p } };
  const router = new ModelRouter(process.cwd(), project, { noCache: true });
  if (mode === 'list') {
    const ids = await router.models('brief');
    for (const id of ids) console.log(id);
    return { ids };
  }
  if (mode === 'check') {
    const keyName = p.keyEnv ?? (provider === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'API_KEY');
    console.log(`provider: ${provider}`);
    console.log(`key: ${process.env[keyName] ? 'SET' : 'MISSING'} (${keyName})`);
    if (!process.env[keyName] && provider !== 'mock') return { ok: false, key: false };
    const ids = await router.models('brief');
    console.log(`models: ${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ', …' : ''}`);
    const model = opts.model ?? ids[0];
    project.models.default.model = model;
    const r = await router.chat('brief', [{ role: 'system', content: 'Return one valid json object only.' }, { role: 'user', content: 'Return {"ok":true}.' }], { jsonMode: true });
    console.log(`json mode: OK (${r.content.slice(0, 80)})`);
    try {
      const res = await fetch(`${router.baseUrl('brief')}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${router.key('brief')}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Call ping.' }], tools: [{ type: 'function', function: { name: 'ping', strict: true, parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] } } }], tool_choice: 'auto', max_tokens: 32 }),
        signal: AbortSignal.timeout(30000),
      });
      const j = await res.json();
      console.log(`tool call: ${res.ok ? (j.choices?.[0]?.message?.tool_calls?.length ? 'OK (returned a tool call)' : 'HTTP OK (no tool call)') : `HTTP ${res.status}`}`);
    } catch (e) { console.log(`tool call: not available (${e.message.slice(0, 120)})`); }
    return { ok: true, model, ids };
  }
  throw new Error('models needs list or check');
}
