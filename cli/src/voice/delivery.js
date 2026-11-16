// Delivery rendering for ElevenLabs: documented v3 audio tags/ellipses, v2 SSML breaks, per-tone settings.
import { normalizeWord } from '../../../shared/words.mjs';

export const TONE_TAGS = {
  deadpan: null,
  'mock-serious': '[sarcastic]',
  'matter-of-fact': null,
  warm: '[warmly]',
  excited: '[excited]',
  tense: '[nervously]',
  awe: '[softly, with wonder]',
  whisper: '[whispers]',
};

export const DEFAULT_TONES = {
  deadpan: { stability: 0.85, style: 0, speed: 1 },
  'mock-serious': { stability: 0.6, style: 0.15, speed: 1 },
  'matter-of-fact': { stability: 0.7, style: 0.05, speed: 1 },
  warm: { stability: 0.45, style: 0.1, speed: 1 },
  excited: { stability: 0.3, style: 0.35, speed: 1.05 },
  tense: { stability: 0.5, style: 0.2, speed: 1 },
  awe: { stability: 0.55, style: 0.15, speed: 0.95 },
  whisper: { stability: 0.7, style: 0.05, speed: 0.95 },
};

export const isV3 = (model) => /^eleven_(v3|v4)/.test(String(model));

export function toneSettings(voice, tone, { expressive = false } = {}) {
  const base = { ...(voice.settings ?? {}) };
  const tones = { ...DEFAULT_TONES, ...(voice.tones ?? {}) };
  const settings = tone && !isV3(voice.model ?? '') ? { ...base, ...(tones[tone] ?? {}) } : base;
  if (expressive) { settings.stability = 0.25; settings.style = 0.35; }
  return settings;
}

const wordTokens = (text) => [...String(text).matchAll(/\S+/g)].map((m) => ({ raw: m[0], norm: normalizeWord(m[0]), start: m.index, end: m.index + m[0].length }));

const pauseMark = (seconds, model) => (isV3(model) ? (seconds < 0.3 ? '...' : '[pause]') : `<break time="${Number(seconds).toFixed(2)}s" />`);
const emphasisMark = (model) => (isV3(model) ? '...' : '<break time="0.12s" />');

/** Render one script line with its delivery marks. Returns the request text and the spoken text (marks removed). */
export function renderDeliveryLine(line, model, { localPauses = false } = {}) {
  const d = line.delivery ?? {};
  const emphasis = new Set((d.emphasis ?? []).map(normalizeWord));
  const pauses = (d.pauses ?? []).map((p) => ({ after: normalizeWord(p.after), s: p.s }));
  const tokens = wordTokens(line.text);
  const parts = [];
  if (!localPauses && !isV3(model) && d.pauseBefore > 0) parts.push(pauseMark(d.pauseBefore, model));
  if (isV3(model)) {
    const tag = TONE_TAGS[d.tone];
    if (tag) parts.push(tag);
    if (!localPauses && d.pauseBefore > 0) parts.push(pauseMark(d.pauseBefore, model));
  }
  for (const t of tokens) {
    if (emphasis.has(t.norm)) parts.push(emphasisMark(model));
    parts.push(t.raw);
    if (!localPauses) for (const p of pauses) if (p.after === t.norm) parts.push(pauseMark(p.s, model));
  }
  const text = parts.join(' ');
  return { text, spokenText: stripDelivery(text) };
}

export function stripDelivery(text) {
  return String(text)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<break[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Render consecutive lines and return spoken ranges per line plus the full request text. */
export function renderDeliveryBlock(lines, model, opts = {}) {
  const out = [], ranges = [];
  let spoken = '';
  for (const line of lines) {
    const r = renderDeliveryLine(line, model, opts);
    if (spoken) spoken += ' ';
    const start = spoken.length;
    spoken += r.spokenText;
    ranges.push({ n: line.n, start, end: spoken.length });
    out.push(r.text);
  }
  return { text: out.join(' '), spokenText: spoken, lines: ranges };
}
