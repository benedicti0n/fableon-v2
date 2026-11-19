// Studio read models: timeline, peaks, safe list, estimate and pronunciation respelling.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { createServer } from '../server/src/server.js';
import { spokenText, restoreWords, withPronunciation } from '../cli/src/voice/pronounce.js';
import { renderDeliveryBlock } from '../cli/src/voice/delivery.js';

export async function runStudioTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const root = mkdtempSync(join(tmpdir(), 'fableon-studio-'));
  let app, port, token;
  try {
    cpSync(join(ROOT, 'fixtures', 'savitri-hi'), join(root, 'savitri-hi'), { recursive: true });
    token = 'studio-token';
    ({ app } = await createServer({ root, token, port: 0 }));
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = app.server.address().port;
    app.fableonAuthPort?.(port);
    const api = (path, opts = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.headers ?? {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const tl = await (await api('/api/projects/savitri-hi/timeline')).json();
    ok('timeline scenes and keys', tl.scenes?.length > 0 && tl.scenes[0].keys?.length > 0 && tl.fps === 30, JSON.stringify({ scenes: tl.scenes?.length, keys: tl.scenes?.[0]?.keys?.length }));
    ok('timeline script words', tl.script?.length > 0 && tl.script[0].words?.length > 0, JSON.stringify(tl.script?.[0]).slice(0, 180));
    ok('timeline needsHuman array', Array.isArray(tl.needsHuman), JSON.stringify(tl.needsHuman).slice(0, 120));
    const pk = await (await api('/api/projects/savitri-hi/peaks?path=voice.wav&buckets=20')).json();
    ok('peaks has 20 buckets', pk.peaks?.length === 20 && pk.duration > 0, JSON.stringify({ buckets: pk.peaks?.length, duration: pk.duration }));
    const pk2 = await (await api('/api/projects/savitri-hi/peaks?path=voice.wav&buckets=20')).json();
    ok('peaks cached by file hash', pk2.cached === true && pk2.hash === pk.hash, JSON.stringify({ cached: pk2.cached }));
    const list = await (await api('/api/projects/savitri-hi/list?dir=cast')).json();
    ok('list cast', list.files?.some((f) => f.path === 'cast/cast-sheet.jpg' && f.type === 'image/jpeg'), JSON.stringify(list.files?.slice(0, 2)));
    const est = await (await api('/api/projects/savitri-hi/estimate', { method: 'POST', body: { op: 'run', args: { to: 'voice' } } })).json();
    ok('voice estimate has characters and usd', est.characters > 0 && est.usd > 0 && est.provider === 'sarvam', JSON.stringify(est));
    const estRender = await (await api('/api/projects/savitri-hi/estimate', { method: 'POST', body: { op: 'animatic' } })).json();
    ok('render estimate has frames and seconds', estRender.frameCount > 0 && estRender.seconds > 0, JSON.stringify(estRender));
    const ops = await (await api('/api/ops/list')).json().catch(() => null);
    // The registry is exposed by the CLI, not an API route; check the op server route accepts script-lines in the schema instead.
    const bad = await api('/api/projects/savitri-hi/ops/script-lines', { method: 'POST', body: { lines: [] } });
    ok('script-lines rejects an empty line list', bad.status === 400, String(bad.status));
  } finally { try { await app?.close(); } catch { /* closed */ } rmSync(root, { recursive: true, force: true }); }

  const pron = { 'राम': { sayAs: 'राम्म' }, 'सीता': 'सीताा' };
  const spoken = spokenText('राम ने सीता से कहा।', pron);
  ok('sayAs replaces provider text', spoken.includes('राम्म') && spoken.includes('सीताा') && !spoken.includes('राम ने'), spoken);
  const lines = withPronunciation([{ n: 0, text: 'राम ने सीता से कहा।', beat: 'hook' }], pron);
  const rendered = renderDeliveryBlock(lines, 'eleven_v3');
  ok('provider request body uses sayAs', rendered.text.includes('राम्म') && rendered.spokenText.includes('सीताा'), rendered.text);
  const restored = restoreWords([{ w: 'राम्म', a: 0, b: 0.2, line: 0 }, { w: 'ने', a: 0.2, b: 0.3, line: 0 }, { w: 'सीताा', a: 0.3, b: 0.5, line: 0 }], lines);
  ok('words map back to the original spelling', restored[0].w === 'राम' && restored[2].w === 'सीता', JSON.stringify(restored.map((w) => w.w)));
  return { ok: errors.length === 0, errors, checks };
}
