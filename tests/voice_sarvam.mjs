// Sarvam TTS: mock HTTP, phrase cache, characters/cost and local word fallback.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthesizeSarvam } from '../cli/src/voice/sarvam.js';
import { wavFromPcm, VOICE_SR } from '../cli/src/voice/wav.js';

export async function runSarvamTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const oldFetch = globalThis.fetch;
  const dir = mkdtempSync(join(tmpdir(), 'fableon-sarvam-'));
  let calls = 0;
  try {
    const audio = wavFromPcm(Buffer.alloc(VOICE_SR)).toString('base64');
    globalThis.fetch = async (url, opts) => { calls++; const body = JSON.parse(opts.body); if (!body.speaker || body.speaker !== 'nachiket_hi_devotional') throw new Error('speaker missing'); return new Response(JSON.stringify({ audios: [audio] }), { status: 200 }); };
    const project = { language: 'hi', voice: { provider: 'sarvam', model: 'bulbul:v4-flash', voiceId: 'nachiket_hi_devotional', language: 'hi' } };
    const lines = [{ n: 0, text: 'एक राजकुमारी ने एक आदमी से शादी की।', delivery: { pauseBefore: 0.2 } }];
    const r = await synthesizeSarvam({ projectDir: dir, project, lines, pace: 1.1 });
    ok('sarvam request + characters', calls === 1 && r.characters > 0 && r.words.length === 8, JSON.stringify({ calls, r: { chars: r.characters, words: r.words.length } }));
    ok('sarvam INR cost', r.costInr > 0 && r.costUsd > 0 && Math.abs(r.costUsd - r.costInr / 88) < 1e-4, JSON.stringify({ inr: r.costInr, usd: r.costUsd }));
    const r2 = await synthesizeSarvam({ projectDir: dir, project, lines, pace: 1.1 });
    ok('sarvam phrase cache', calls === 1 && r2.cached === true && r2.costUsd === 0, JSON.stringify({ calls, cached: r2.cached }));
  } finally { globalThis.fetch = oldFetch; rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
