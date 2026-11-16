// ElevenLabs text-to-speech with character timestamps. Synthesizes one request per BEAT block, stitches blocks with
// previous_text/next_text, caches every take by request hash and returns 24 kHz mono PCM words for words.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { loadDotEnv, run } from '../env.js';
import { atomicWrite, backupBeforeWrite, sha256 } from '../core/artifacts.js';
import { repoModels } from '../core/model-config.js';
import { normalizeWord } from '../../../shared/words.mjs';
import { silencePcm, VOICE_SR, wavFromPcm } from './wav.js';
import { isV3, renderDeliveryBlock } from './delivery.js';

export const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
export const DEFAULT_MODEL = 'eleven_multilingual_v2';
export const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah, a premade voice with verified Hindi in this account
export const BEAT_GAP = 0.26;

export const voicePricePer1k = (model) => repoModels().voicePrices?.elevenlabs?.[model] ?? 0.08;
const pricePer1k = voicePricePer1k;
const charCount = (s) => Array.from(String(s)).length;
const now = () => new Date().toISOString();

export function requestHash(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function voiceApiKey() {
  loadDotEnv();
  return process.env.ELEVENLABS_API_KEY ?? '';
}

function logCall(projectDir, entry) {
  const p = join(projectDir, 'logs', 'calls.jsonl');
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(entry) + '\n');
}

function cachePath(projectDir, hash) {
  return join(projectDir, '.fableon', 'voice-cache', `${hash}.json`);
}

/**
 * Request one block. Returns the decoded response plus billing/cache metadata. The cache key includes the provider,
 * model, voice, text, settings and stitching context, so an identical take is never billed twice.
 */
export async function requestSpeech({ projectDir, model, voiceId, text, settings, previousText, nextText, maxChars, spent, stage = 'voice' }) {
  const key = voiceApiKey();
  if (!key) throw new Error('elevenlabs: ELEVENLABS_API_KEY is missing (set it in the environment or .env)');
  const outputFormat = settings.outputFormat ?? 'mp3_44100_128';
  const body = {
    text,
    model_id: model,
    voice_settings: {
      stability: settings.stability ?? 0.5,
      similarity_boost: settings.similarity_boost ?? 0.75,
      style: settings.style ?? 0,
      use_speaker_boost: settings.use_speaker_boost ?? true,
      speed: Math.max(0.7, Math.min(1.2, settings.speed ?? 1)),
    },
    apply_text_normalization: settings.apply_text_normalization ?? 'auto',
    ...(model !== 'eleven_multilingual_v2' && settings.languageCode ? { language_code: settings.languageCode } : {}),
    ...(!/^eleven_(v3|v4)/.test(model) && previousText ? { previous_text: previousText.slice(-500) } : {}),
    ...(!/^eleven_(v3|v4)/.test(model) && nextText ? { next_text: nextText.slice(0, 500) } : {}),
  };
  const hash = requestHash({ provider: 'elevenlabs', model, voiceId, text, settings: body.voice_settings, outputFormat, previousText: body.previous_text ?? null, nextText: body.next_text ?? null });
  const cached = cachePath(projectDir, hash);
  if (existsSync(cached)) {
    const hit = JSON.parse(readFileSync(cached, 'utf8'));
    logCall(projectDir, { ts: now(), stage, provider: 'elevenlabs', model, voiceId, requestHash: hash, cached: true, ms: 0, characters: 0, costUsd: 0, ok: true });
    return { ...hit, hash, cached: true, chars: 0, costUsd: 0 };
  }
  const chars = charCount(text);
  if (spent + chars > maxChars) throw new Error(`voice budget: maxCharsPerRun ${maxChars} would be exceeded (${spent + chars} characters)`);
  const t0 = Date.now();
  const url = `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(settings.timeoutMs ?? 120000),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* status only */ }
    throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const j = await res.json();
  if (!j.audio_base64) throw new Error('ElevenLabs TTS returned no audio_base64');
  const costUsd = (chars / 1000) * pricePer1k(model);
  const record = { audioBase64: j.audio_base64, alignment: j.alignment ?? null, normalizedAlignment: j.normalized_alignment ?? null, chars, costUsd, model, voiceId, outputFormat };
  atomicWrite(cached, JSON.stringify(record) + '\n');
  logCall(projectDir, { ts: now(), stage, provider: 'elevenlabs', model, voiceId, requestHash: hash, cached: false, ms: Date.now() - t0, characters: chars, costUsd, ok: true });
  return { ...record, hash, cached: false, chars, costUsd };
}

function tokenSpans(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) { const norm = normalizeWord(m[0]); if (norm) out.push({ raw: m[0], norm, start: m.index, end: m.index + m[0].length }); }
  return out;
}

const cleanWord = (s) => String(s).replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, '') || String(s);

/**
 * Map a block's character alignment to words and script lines. Uses the original alignment when it exactly covers the
 * block text; otherwise the normalized alignment, matched by normalized word. Unmatched words are interpolated and
 * returned as warnings.
 */
export function wordsFromAlignment({ blockText, lines, alignment, blockStart = 0, blockDuration = 0 }) {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const warnings = [];
  const spans = [];
  for (let i = 0; i < chars.length;) {
    if (/\s/.test(chars[i])) { i++; continue; }
    const s = i;
    while (i < chars.length && !/\s/.test(chars[i])) i++;
    const e = i - 1;
    if (starts[s] === undefined || ends[e] === undefined) continue;
    const norm = normalizeWord(chars.slice(s, e + 1).join(''));
    if (norm) spans.push({ raw: chars.slice(s, e + 1).join(''), norm, a: starts[s], b: ends[e] });
  }
  const orig = tokenSpans(blockText).map((t) => {
    const line = lines.find((l) => t.start >= l.start && t.start < l.end)?.n ?? lines[lines.length - 1]?.n ?? 0;
    return { ...t, line, a: null, b: null };
  });
  if (spans.length === orig.length) {
    for (let i = 0; i < orig.length; i++) { orig[i].a = spans[i].a; orig[i].b = spans[i].b; }
  } else {
    let ai = 0;
    for (const w of orig) {
      let k = ai;
      while (k < spans.length && spans[k].norm !== w.norm) k++;
      if (k < spans.length) { w.a = spans[k].a; w.b = spans[k].b; ai = k + 1; }
    }
    warnings.push(`alignment had ${spans.length} tokens for ${orig.length} words; unmatched words were interpolated`);
  }
  const duration = blockDuration || Math.max(0, ...spans.map((s) => s.b));
  const grid = orig.map((w) => w.a).filter((x) => x !== null);
  for (let i = 0; i < orig.length; i++) {
    if (orig[i].a !== null) continue;
    let p = i - 1;
    while (p >= 0 && orig[p].a === null) p--;
    let n = i + 1;
    while (n < orig.length && orig[n].a === null) n++;
    const from = p >= 0 ? orig[p].b : 0;
    const to = n < orig.length ? orig[n].a : duration;
    const gap = Math.max(0, to - from);
    const count = n - p - 1;
    const idx = i - p - 1;
    orig[i].a = from + (gap * idx) / Math.max(1, count);
    orig[i].b = from + (gap * (idx + 1)) / Math.max(1, count);
    warnings.push(`line ${orig[i].line} word "${orig[i].raw}" interpolated (${orig[i].a.toFixed(2)}-${orig[i].b.toFixed(2)} s)`);
  }
  let prevB = 0;
  for (const w of orig) {
    const a = Math.max(prevB, w.a ?? 0) + blockStart;
    const b = Math.max(a + 0.01, (w.b ?? a) + blockStart);
    if (a !== (w.a ?? 0) + blockStart || b !== (w.b ?? a) + blockStart) warnings.push(`line ${w.line} word "${w.raw}" timing clamped for monotonicity`);
    prevB = b - blockStart;
    w.a = +a.toFixed(3);
    w.b = +b.toFixed(3);
  }
  return {
    words: orig.map((w) => ({ w: cleanWord(w.raw), a: w.a, b: w.b, line: w.line })),
    warnings,
    grid,
  };
}

function chooseAlignment(blockText, block) {
  const original = block.alignment?.characters?.join('') === blockText;
  return { alignment: original ? block.alignment : block.normalizedAlignment ?? block.alignment, normalized: !original && !!block.normalizedAlignment };
}

async function decodePcm(audioBase64, projectDir, index) {
  const dir = join(projectDir, '.fableon', 'voice-tmp');
  mkdirSync(dir, { recursive: true });
  const raw = join(dir, `block-${index}-${randomBytes(3).toString('hex')}.mp3`);
  const out = raw.replace(/\.mp3$/, '.raw');
  writeFileSync(raw, Buffer.from(audioBase64, 'base64'));
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(VOICE_SR), out]);
    return readFileSync(out);
  } finally {
    rmSync(raw, { force: true });
    rmSync(out, { force: true });
  }
}


/** Cuts requested by delivery marks: insert before word index `index` (0..words.length). */
export function pauseCuts(words, lines) {
  const cuts = [];
  for (const line of lines) {
    const d = line.delivery;
    if (!d) continue;
    const indexes = words.map((w, i) => (w.line === line.n ? i : -1)).filter((i) => i >= 0);
    if (!indexes.length) continue;
    if (d.pauseBefore > 0) cuts.push({ index: indexes[0], seconds: Number(d.pauseBefore), reason: `line ${line.n} pauseBefore` });
    for (const p of d.pauses ?? []) {
      const idx = indexes.find((i) => normalizeWord(words[i].w) === normalizeWord(p.after));
      if (idx !== undefined) cuts.push({ index: idx + 1, seconds: Number(p.s), reason: `line ${line.n} pause after "${p.after}"` });
      else cuts.push({ warning: `line ${line.n} pause word "${p.after}" not found`, seconds: 0 });
    }
  }
  return cuts;
}

/** Insert exact silence at word gaps, then shift word times. Never cuts inside a word. */
export function applyPauseCuts(pcm, words, cuts) {
  const warnings = cuts.filter((c) => c.warning).map((c) => c.warning);
  const byIndex = new Map();
  for (const c of cuts) if (!c.warning && c.seconds > 0) byIndex.set(c.index, Math.max(byIndex.get(c.index) ?? 0, c.seconds));
  const points = [...byIndex.entries()].map(([index, seconds]) => {
    let time;
    if (index <= 0) time = 0;
    else if (index >= words.length) time = pcm.length / (2 * VOICE_SR);
    else time = Math.max(words[index - 1].b, (words[index - 1].b + words[index].a) / 2);
    return { index, seconds, sample: Math.max(0, Math.min(pcm.length, Math.round(time * VOICE_SR) * 2)) };
  }).sort((a, b) => b.sample - a.sample);
  let out = pcm;
  for (const p of points) out = Buffer.concat([out.subarray(0, p.sample), silencePcm(p.seconds), out.subarray(p.sample)]);
  const asc = [...points].sort((a, b) => a.sample - b.sample);
  const shifted = words.map((w) => {
    const add = asc.filter((p) => p.sample <= Math.round(w.a * VOICE_SR) * 2).reduce((n, p) => n + p.seconds, 0);
    return { ...w, a: +(w.a + add).toFixed(3), b: +(w.b + add).toFixed(3) };
  });
  return { pcm: out, words: shifted, warnings };
}

/**
 * Synthesize all beat blocks, concatenate with beat pauses and write project/voice.wav. Returns words, billing,
 * warnings and the cache/API call details.
 */
export async function synthesizeElevenLabs({ projectDir, project, blocks }) {
  const voice = project.voice ?? {};
  const model = voice.model ?? DEFAULT_MODEL;
  const voiceId = voice.voiceId || DEFAULT_VOICE_ID;
  const settings = { ...(voice.settings ?? {}), languageCode: voice.language ?? project.language ?? 'en' };
  const maxChars = Number(voice.maxCharsPerRun ?? 10000);
  let spent = 0;
  const words = [], warnings = [], calls = [];
  let pcm = [];
  const allLines = blocks.flatMap((b) => b.lines);
  const single = isV3(model) ? renderDeliveryBlock(allLines, model, { localPauses: true }) : null;
  if (single && charCount(single.text) <= 5000) {
    const res = await requestSpeech({ projectDir, model, voiceId, text: single.text, settings, previousText: null, nextText: null, maxChars, spent });
    spent += res.chars;
    calls.push({ hash: res.hash, cached: res.cached, chars: res.chars, costUsd: res.costUsd });
    const blockPcm = await decodePcm(res.audioBase64, projectDir, 0);
    const { alignment } = chooseAlignment(single.spokenText, res);
    const mapped = wordsFromAlignment({ blockText: single.spokenText, lines: single.lines, alignment, blockStart: 0, blockDuration: blockPcm.length / (2 * VOICE_SR) });
    if (!mapped.words.length) throw new Error('ElevenLabs returned no character alignment');
    const inserted = applyPauseCuts(blockPcm, mapped.words, pauseCuts(mapped.words, allLines));
    pcm = [inserted.pcm];
    words.push(...inserted.words);
    warnings.push(...mapped.warnings, ...inserted.warnings);
    const wav = wavFromPcm(Buffer.concat(pcm));
    backupBeforeWrite(projectDir, 'voice', 'voice.wav', wav);
    atomicWrite(join(projectDir, 'voice.wav'), wav);
    return { words, warnings, calls, characters: res.chars, costUsd: res.costUsd, cached: res.cached, model, voiceId, mode: 'single' };
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.lines;
    const rendered = renderDeliveryBlock(lines, model);
    const text = rendered.text;
    const previousText = i > 0 ? renderDeliveryBlock(blocks[i - 1].lines, model).spokenText : null;
    const nextText = i + 1 < blocks.length ? renderDeliveryBlock(blocks[i + 1].lines, model).spokenText : null;
    const blockRes = await requestSpeech({ projectDir, model, voiceId, text, settings, previousText, nextText, maxChars, spent });
    spent += blockRes.chars;
    calls.push({ hash: blockRes.hash, cached: blockRes.cached, chars: blockRes.chars, costUsd: blockRes.costUsd });
    const pcmBlock = await decodePcm(blockRes.audioBase64, projectDir, i);
    const blockStart = pcm.reduce((n, b) => n + b.length, 0) / (2 * VOICE_SR);
    const { alignment } = chooseAlignment(rendered.spokenText, blockRes);
    const mapped = wordsFromAlignment({ blockText: rendered.spokenText, lines: rendered.lines, alignment, blockStart, blockDuration: pcmBlock.length / (2 * VOICE_SR) });
    if (!mapped.words.length) throw new Error(`ElevenLabs returned no character alignment for block ${i + 1}`);
    words.push(...mapped.words);
    warnings.push(...mapped.warnings.map((w) => `block ${i + 1}: ${w}`));
    pcm.push(pcmBlock);
    if (i + 1 < blocks.length) pcm.push(silencePcm(BEAT_GAP));
  }
  const wav = wavFromPcm(Buffer.concat(pcm));
  backupBeforeWrite(projectDir, 'voice', 'voice.wav', wav);
  atomicWrite(join(projectDir, 'voice.wav'), wav);
  return {
    words,
    warnings,
    calls,
    characters: calls.reduce((n, c) => n + c.chars, 0),
    costUsd: calls.reduce((n, c) => n + c.costUsd, 0),
    cached: calls.length > 0 && calls.every((c) => c.cached),
    model,
    voiceId,
  };
}

/** Live check: one short Hindi sentence, no project, no cache reuse. */
export async function checkElevenLabs({ voiceId = DEFAULT_VOICE_ID, model = DEFAULT_MODEL } = {}) {
  voiceId = voiceId || DEFAULT_VOICE_ID;
  const key = voiceApiKey();
  if (!key) return { ok: false, key: false };
  const text = 'नमस्ते, यह आवाज़ की जाँच है।';
  const settings = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1, languageCode: 'hi', outputFormat: 'mp3_44100_128' };
  const body = {
    text, model_id: model,
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
    apply_text_normalization: 'auto',
  };
  const url = `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'xi-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}`);
  const j = await res.json();
  const align = j.alignment ?? j.normalized_alignment;
  const chars = charCount(text);
  const { words } = wordsFromAlignment({ blockText: text, lines: [{ n: 0, start: 0, end: text.length }], alignment: align, blockStart: 0, blockDuration: 0 });
  return { ok: true, key: true, model, voiceId, characters: chars, costUsd: (chars / 1000) * pricePer1k(model), words: words.slice(0, 5), settings };
}
