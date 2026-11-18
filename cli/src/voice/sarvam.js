// Sarvam Bulbul TTS: phrase-by-phrase rendering (no SSML), local exact pauses, cache, billing and word fallback.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDotEnv, run } from '../env.js';
import { atomicWrite } from '../core/artifacts.js';
import { decodePcm } from './elevenlabs.js';
import { VOICE_SR, silencePcm, wavFromPcm } from './wav.js';

export const SARVAM_BASE = 'https://api.sarvam.ai';
export const SARVAM_V4 = 'bulbul:v4-flash';
export const SARVAM_V3 = 'bulbul:v3';
export const NACHIKET = 'nachiket_hi_devotional';
export const SARVAM_PRICE_INR_PER_1K = { [SARVAM_V4]: 2, [SARVAM_V3]: 3 };
const INR_PER_USD = 88;
const charCount = (s) => Array.from(String(s)).length;
const hashOf = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cacheFile = (dir, h) => join(dir, '.fableon', 'voice-cache', `sarvam-${h}.json`);

const logCall = (dir, entry) => {
  const p = join(dir, 'logs', 'calls.jsonl'); mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(entry) + '\n', { flag: 'a' });
};

const splitAtPauses = (line, marked) => {
  if (!marked) return [{ text: line.text, silence: 0 }];
  const d = line.delivery ?? {};
  const pauses = (d.pauses ?? []).map((p) => ({ after: p.after, s: Number(p.s) }));
  const words = String(line.text).split(/\s+/);
  const out = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    const hit = pauses.find((p) => p.after && w.replace(/[।,.;!?]+$/g, '') === p.after.replace(/[।,.;!?]+$/g, ''));
    if (hit) { out.push({ text: cur.join(' '), silence: Math.max(0.15, Math.min(0.6, hit.s)) }); cur = []; }
  }
  if (cur.length) out.push({ text: cur.join(' '), silence: 0 });
  if (d.pauseBefore > 0) out[0].before = Math.max(0.15, Math.min(0.6, d.pauseBefore));
  return out;
};

export async function synthesizeSarvam({ projectDir, project, lines, marked = false, pace = null }) {
  loadDotEnv();
  const voice = project.voice ?? {};
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error('sarvam: SARVAM_API_KEY is missing (set it in .env)');
  const model = voice.model ?? SARVAM_V4;
  const speaker = voice.voiceId || NACHIKET;
  const language = voice.language ?? project.language ?? 'hi';
  const languageCode = language === 'hi' ? 'hi-IN' : 'en-IN';
  const p = Number(pace ?? voice.pace ?? voice.settings?.pace ?? 1);
  const maxChars = Number(voice.maxCharsPerRun ?? 2500);
  let spent = 0;
  const words = [], warnings = [], calls = [], pcmParts = [];
  let offset = 0;
  for (const line of lines) {
    const segments = splitAtPauses(line, marked);
    if (segments[0]?.before) { pcmParts.push(silencePcm(segments[0].before)); offset += segments[0].before; }
    for (const seg of segments) {
      const text = String(seg.text).trim();
      if (!text) continue;
      const chars = charCount(text);
      if (spent + chars > maxChars * Math.max(1, lines.length)) throw new Error(`sarvam budget: maxCharsPerRun ${maxChars} would be exceeded`);
      const settings = { pace: p, speech_sample_rate: 24000, output_audio_codec: 'wav' };
      const h = hashOf({ provider: 'sarvam', model, speaker, languageCode, text, settings });
      const file = cacheFile(projectDir, h);
      const hit = existsSync(file);
      let record;
      if (hit) {
        record = JSON.parse(readFileSync(file, 'utf8'));
        logCall(projectDir, { ts: new Date().toISOString(), stage: 'voice', provider: 'sarvam', model, voiceId: speaker, requestHash: h, cached: true, characters: 0, costUsd: 0, ok: true });
      } else {
        const res = await fetch(`${SARVAM_BASE}/text-to-speech`, { method: 'POST', headers: { 'content-type': 'application/json', 'api-subscription-key': key }, body: JSON.stringify({ text, language_code: languageCode, model, speaker, ...settings }), signal: AbortSignal.timeout(120000) });
        const body = await res.text();
        if (!res.ok) throw new Error(`Sarvam TTS failed: HTTP ${res.status}: ${body.slice(0, 300)}`);
        const j = JSON.parse(body);
        const audio = j.audios?.[0];
        if (!audio) throw new Error('Sarvam TTS returned no audios[0]');
        const inr = (chars / 1000) * (SARVAM_PRICE_INR_PER_1K[model] ?? 3);
        record = { audioBase64: audio, chars, costInr: inr, costUsd: inr / INR_PER_USD, model, speaker, languageCode, outputFormat: 'wav' };
        atomicWrite(file, JSON.stringify(record) + '\n');
        logCall(projectDir, { ts: new Date().toISOString(), stage: 'voice', provider: 'sarvam', model, voiceId: speaker, requestHash: h, cached: false, characters: chars, costUsd: record.costUsd, costInr: inr, ok: true });
      }
      spent += record.chars ?? 0;
      calls.push({ hash: h, cached: hit, chars: hit ? 0 : record.chars ?? 0, costUsd: hit ? 0 : record.costUsd ?? 0, costInr: hit ? 0 : record.costInr ?? 0 });
      const pcm = await decodePcm(record.audioBase64, projectDir, calls.length);
      const duration = pcm.length / (2 * VOICE_SR);
      const lineWords = String(seg.text).split(/\s+/).filter(Boolean).map((w) => w.replace(/[।,.;!?]+$/g, ''));
      const totalChars = lineWords.reduce((n, w) => n + Array.from(w).length, 0) || 1;
      let cursor = 0;
      for (const w of lineWords) {
        const share = (Array.from(w).length / totalChars) * duration;
        words.push({ w, a: +(offset + cursor).toFixed(3), b: +(offset + cursor + share).toFixed(3), line: line.n });
        cursor += share;
      }
      pcmParts.push(pcm);
      offset += duration;
      if (seg.silence) { pcmParts.push(silencePcm(seg.silence)); offset += seg.silence; }
    }
  }
  const wav = wavFromPcm(Buffer.concat(pcmParts));
  atomicWrite(join(projectDir, 'voice.wav'), wav);
  const total = pcmParts.reduce((n, b) => n + b.length, 0) / (2 * VOICE_SR);
  return { words, warnings, characters: spent, costUsd: +calls.reduce((n, c) => n + c.costUsd, 0).toFixed(6), costInr: +calls.reduce((n, c) => n + (c.costInr ?? 0), 0).toFixed(4), cached: calls.length > 0 && calls.every((c) => c.cached), calls, model, voiceId: speaker, duration: total, mode: marked ? 'marked' : 'plain' };
}
