// Sarvam Bulbul TTS: one request per beat block (whole sentences, never phrase fragments), native 48 kHz, deterministic
// sentence gaps filled with room tone, at most three dramatic pauses, silence compression, cache and billing.
// Bulbul has no SSML; punctuation shapes the internal phrasing and the provider pace parameter sets the tempo.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDotEnv } from '../env.js';
import { atomicWrite } from '../core/artifacts.js';
import { decodePcm } from './elevenlabs.js';
import { restoreWords } from './pronounce.js';
import { wavFromPcm } from './wav.js';

export const SARVAM_BASE = 'https://api.sarvam.ai';
export const SARVAM_V4 = 'bulbul:v4-flash';
export const SARVAM_V3 = 'bulbul:v3';
export const NACHIKET = 'nachiket_hi_devotional';
export const SARVAM_SR = 48000;
export const SARVAM_PRICE_INR_PER_1K = { [SARVAM_V4]: 2, [SARVAM_V3]: 3 };
const INR_PER_USD = 88;
const charCount = (s) => Array.from(String(s)).length;
const hashOf = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cacheFile = (dir, h) => join(dir, '.fableon', 'voice-cache', `sarvam-${h}.json`);

const AUX_POST = new Set(['हुए', 'है', 'हैं', 'था', 'थी', 'थे', 'गया', 'गई', 'गए', 'दिए', 'दी', 'दिया', 'लिए', 'का', 'की', 'के', 'को', 'में', 'से', 'ने', 'पर']);
const DET_INT = new Set(['कोई', 'बहुत', 'एक', 'हर', 'यह', 'वह', 'इस', 'उस']);

const logCall = (dir, entry) => {
  const p = join(dir, 'logs', 'calls.jsonl'); mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(entry) + '\n', { flag: 'a' });
};

const cleanWord = (s) => String(s).replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, '');
const firstWord = (s) => cleanWord(String(s).trim().split(/\s+/)[0] ?? '');
const lastWord = (s) => cleanWord(String(s).trim().split(/\s+/).at(-1) ?? '');
const samples = (pcm) => new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));

/** Fill sentence gaps with deterministic pink noise at -60 dBFS; never digital zero. */
function pinkNoise(seconds, sr, levelDb = -60) {
  const n = Math.max(1, Math.round(seconds * sr));
  const out = Buffer.alloc(n * 2);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let state = 0x12345678;
  const rnd = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0xffffffff * 2 - 1; };
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const white = rnd();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  let sum = 0;
  for (const v of x) sum += v * v;
  const rms = Math.sqrt(sum / n) || 1;
  const gain = (10 ** (levelDb / 20) * 32768) / rms;
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * gain))), i * 2);
  return out;
}

/** Trim provider lead/tail silence so the caller controls sentence gaps. */
export function trimSilence(pcm, sr, lead = 0.02, tail = 0.02) {
  const s = samples(pcm);
  const frame = Math.max(1, Math.round(0.01 * sr));
  const threshold = 32768 * 10 ** (-45 / 20);
  const n = Math.floor(s.length / frame);
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * frame; j < (i + 1) * frame; j++) sum += s[j] * s[j];
    if (Math.sqrt(sum / frame) >= threshold) { if (first < 0) first = i; last = i; }
  }
  if (first < 0) return pcm;
  const a = Math.max(0, first * frame - Math.round(lead * sr));
  const b = Math.min(s.length, (last + 1) * frame + Math.round(tail * sr));
  return pcm.subarray(a * 2, b * 2);
}

/** Remove all but maxPause seconds from each internal quiet run; overlap 10 ms at the splice. */
export function compressSilence(pcm, sr, maxPause = 0.08) {
  const frame = Math.max(1, Math.round(0.01 * sr));
  const maxSamples = Math.max(1, Math.round(maxPause * sr));
  let out = Buffer.from(pcm);
  for (let pass = 0; pass < 4; pass++) {
    const s = samples(out);
    const n = Math.floor(s.length / frame);
    const quiet = new Uint8Array(n);
    const threshold = Math.round(32768 * 10 ** (-45 / 20));
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = i * frame; j < (i + 1) * frame; j++) sum += s[j] * s[j];
      quiet[i] = Math.sqrt(sum / frame) < threshold ? 1 : 0;
    }
    const runs = [];
    let start = null;
    for (let i = 0; i < n; i++) { if (quiet[i] && start === null) start = i; else if (!quiet[i] && start !== null) { runs.push([start, i]); start = null; } }
    if (start !== null) runs.push([start, n]);
    let changed = false;
    for (const [a, b] of runs.reverse()) {
      if (a === 0 || b === n) continue;
      const s = samples(out);
      const aS = a * frame, bS = b * frame;
      if (bS - aS <= maxSamples) continue;
      const cutStart = aS + maxSamples, cutEnd = bS, m = Math.min(Math.round(0.010 * sr), cutStart, cutEnd, s.length - cutEnd);
      if (m <= 0) continue;
      const join = new Int16Array(cutStart + (s.length - cutEnd) - m);
      for (let i = 0; i < cutStart - m; i++) join[i] = s[i];
      for (let i = 0; i < m; i++) {
        const t = (i + 1) / (m + 1);
        join[cutStart - m + i] = Math.round(s[cutStart - m + i] * (1 - t) + s[cutEnd + i] * t);
      }
      for (let i = m; i < s.length - cutEnd; i++) join[cutStart - m + i] = s[cutEnd + i];
      out = Buffer.from(join.buffer, join.byteOffset, join.byteLength);
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

/** Overlap-add 15 ms at every join so sentence gaps do not click. */
function concatCrossfade(parts, sr, ms = 15) {
  const n = Math.round((ms / 1000) * sr);
  let out = parts[0] ?? Buffer.alloc(0);
  for (const part of parts.slice(1)) {
    if (!out.length) { out = part; continue; }
    const m = Math.min(n, Math.floor(out.length / 2), Math.floor(part.length / 2));
    if (!m) { out = Buffer.concat([out, part]); continue; }
    const a = samples(out), b = samples(part);
    const merged = Buffer.alloc((a.length + b.length - m) * 2);
    const dst = samples(merged);
    for (let i = 0; i < a.length - m; i++) dst[i] = a[i];
    for (let i = 0; i < m; i++) {
      const t = (i + 1) / (m + 1);
      dst[a.length - m + i] = Math.round(a[a.length - m + i] * (1 - t) + b[i] * t);
    }
    for (let i = m; i < b.length; i++) dst[a.length - m + i] = b[i];
    out = merged;
  }
  return out;
}

/** Add a -60 dBFS noise floor to every sample so no run is digital zero. */
export function addRoomFloor(pcm, sr) {
  const noise = pinkNoise(pcm.length / 2 / sr, sr, -60);
  const s = samples(pcm), n = samples(noise);
  const out = Buffer.alloc(pcm.length);
  const d = samples(out);
  for (let i = 0; i < s.length; i++) d[i] = Math.max(-32768, Math.min(32767, s[i] + (n[i] ?? 0)));
  return out;
}

function gapSeconds(unit, next, marked, lastDramaticAt, offset) {
  const lastLine = unit.lines.at(-1), nextLine = next.lines[0];
  const prevLast = lastWord(lastLine.text), nextFirst = firstWord(nextLine.text);
  if (AUX_POST.has(nextFirst) || DET_INT.has(prevLast)) return 0.06;
  const joinsTurn = next.lines.some((l) => /^लेकिन/.test(String(l.text).trim()));
  const dramatic = marked && (unit.beat === 'hook' || joinsTurn || next.beat === 'twist' || next.beat === 'payoff');
  if (dramatic && offset - lastDramaticAt >= 4) return 0.6;
  const prev = String(lastLine.text).trim();
  if (/[?]$/.test(prev)) return 0.3;
  return prev.length >= 80 ? 0.25 : 0.2;
}

export async function synthesizeSarvam({ projectDir, project, blocks = null, lines = null, marked = false, pace = null }) {
  loadDotEnv();
  const voice = project.voice ?? {};
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error('sarvam: SARVAM_API_KEY is missing (set it in .env)');
  const model = voice.model ?? SARVAM_V4;
  const speaker = voice.voiceId || NACHIKET;
  const language = voice.language ?? project.language ?? 'hi';
  const languageCode = language === 'hi' ? 'hi-IN' : 'en-IN';
  const basePace = Number(pace ?? voice.pace ?? voice.settings?.pace ?? 1);
  const sr = Number(voice.sampleRate ?? SARVAM_SR);
  const maxChars = Number(voice.maxCharsPerRun ?? 2500);
  const units = blocks?.length ? blocks : (lines ?? []).map((l) => ({ beat: l.beat ?? null, lines: [{ ...l }] }));
  let spent = 0;
  const words = [], warnings = [], calls = [], parts = [], gaps = [];
  let offset = 0, lastDramaticAt = -99;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const text = unit.lines.map((l) => String(l.text).trim()).filter(Boolean).join(' ');
    if (!text) continue;
    const chars = charCount(text);
    if (spent + chars > maxChars * Math.max(1, units.length)) throw new Error(`sarvam budget: maxCharsPerRun ${maxChars} would be exceeded`);
    const lineChars = unit.lines.map((l) => charCount(l.text));
    const totalLineChars = lineChars.reduce((n, c) => n + c, 0) || 1;
    const rawLinePace = marked
      ? unit.lines.reduce((n, l) => n + (Number(l.delivery?.pace ?? 1) * charCount(l.text)), 0) / totalLineChars
      : 1;
    // Keep the director's relative pace, but halve its deviation so line joins do not jump.
    const linePace = 1 + (rawLinePace - 1) * 0.5;
    const unitPace = Math.max(0.5, Math.min(2.0, +(basePace * linePace).toFixed(3)));
    const settings = { pace: unitPace, speech_sample_rate: sr, output_audio_codec: 'wav' };
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
      record = { audioBase64: audio, chars, costInr: inr, costUsd: inr / INR_PER_USD, model, speaker, languageCode, outputFormat: 'wav', sampleRate: sr };
      atomicWrite(file, JSON.stringify(record) + '\n');
      logCall(projectDir, { ts: new Date().toISOString(), stage: 'voice', provider: 'sarvam', model, voiceId: speaker, requestHash: h, cached: false, characters: chars, costUsd: record.costUsd, costInr: inr, ok: true });
    }
    spent += hit ? 0 : record.chars ?? 0;
    calls.push({ hash: h, cached: hit, chars: hit ? 0 : record.chars ?? 0, costUsd: hit ? 0 : record.costUsd ?? 0, costInr: hit ? 0 : record.costInr ?? 0 });
    let pcm = trimSilence(await decodePcm(record.audioBase64, projectDir, calls.length, sr), sr);
    pcm = compressSilence(pcm, sr, voice.maxInternalPause ?? 0.10);
    if (parts.length) {
      const gap = gapSeconds(units[i - 1], unit, marked, lastDramaticAt, offset);
      parts.push(pinkNoise(gap, sr, -60));
      gaps.push({ before: unit.lines[0]?.n ?? i, seconds: +gap.toFixed(3), dramatic: gap >= 0.45 });
      if (gap >= 0.45) lastDramaticAt = offset;
      offset += gap;
    }
    const duration = pcm.length / (2 * sr);
    let lineStart = offset;
    for (let li = 0; li < unit.lines.length; li++) {
      const line = unit.lines[li];
      const lineDur = duration * (lineChars[li] / totalLineChars);
      const ws = String(line.text).split(/\s+/).filter(Boolean).map((w) => w.replace(/[।,.;!?]+$/g, ''));
      const totalChars = ws.reduce((n, w) => n + Array.from(w).length, 0) || 1;
      let cursor = 0;
      for (const w of ws) {
        const share = (Array.from(w).length / totalChars) * lineDur;
        words.push({ w, a: +(lineStart + cursor).toFixed(3), b: +(lineStart + cursor + share).toFixed(3), line: line.n });
        cursor += share;
      }
      lineStart += lineDur;
    }
    parts.push(pcm);
    offset += duration;
  }
  const restored = restoreWords(words, units.flatMap((u) => u.lines));
  words.length = 0; words.push(...restored);
  const wav = wavFromPcm(addRoomFloor(concatCrossfade(parts, sr), sr), sr);
  atomicWrite(join(projectDir, 'voice.wav'), wav);
  const total = wav.length > 44 ? (wav.length - 44) / (2 * sr) : offset;
  return {
    words, warnings, characters: spent,
    costUsd: +calls.reduce((n, c) => n + c.costUsd, 0).toFixed(6),
    costInr: +calls.reduce((n, c) => n + (c.costInr ?? 0), 0).toFixed(4),
    cached: calls.length > 0 && calls.every((c) => c.cached),
    calls, model, voiceId: speaker, duration: total, mode: marked ? 'marked' : 'plain', sampleRate: sr, gaps,
  };
}
