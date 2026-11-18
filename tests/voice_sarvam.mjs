// Sarvam TTS: mock HTTP, phrase cache, characters/cost and local word fallback.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthesizeSarvam, trimSilence, compressSilence, addRoomFloor } from '../cli/src/voice/sarvam.js';
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
  const sr = 48000;
  const tone = (n) => { const b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i * 2); return b; };
  const zero = (n) => Buffer.alloc(n * 2);
  const padded = Buffer.concat([zero(sr * 0.4), tone(sr * 0.5), zero(sr * 0.5), tone(sr * 0.5), zero(sr * 0.4)]);
  const trimmed = trimSilence(padded, sr);
  ok('sarvam trims lead/tail', trimmed.length < padded.length && trimmed.length / 2 / sr < 1.6, `${trimmed.length / 2 / sr}s`);
  const compressed = compressSilence(trimmed, sr, 0.02);
  const s2 = new Int16Array(compressed.buffer, compressed.byteOffset, compressed.length / 2);
  let run = 0, maxRun = 0;
  for (const v of s2) { if (v === 0) { run++; maxRun = Math.max(maxRun, run); } else run = 0; }
  ok('sarvam compresses pauses', maxRun < sr * 0.05, `${(maxRun / sr).toFixed(3)}s zero run`);
  const floor = addRoomFloor(compressed, sr);
  const s3 = new Int16Array(floor.buffer, floor.byteOffset, floor.length / 2);
  let zr = 0, maxZr = 0;
  for (const v of s3) { if (v === 0) { zr++; maxZr = Math.max(maxZr, zr); } else zr = 0; }
  ok('sarvam room floor removes zero runs', maxZr < sr * 0.01, `${(maxZr / sr).toFixed(3)}s zero run`);
  return { ok: errors.length === 0, errors, checks };
}
