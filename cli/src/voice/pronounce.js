// Pronunciation respelling: provider text uses sayAs; words.json keeps the original word.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeWord } from '../../../shared/words.mjs';

export function readPronunciations(projectDir) {
  const p = join(projectDir, 'pronunciations.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')) ?? {}; } catch { return {}; }
}

export function sayAsFor(word, pronunciations) {
  const entry = pronunciations?.[word] ?? pronunciations?.[normalizeWord(word)];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && typeof entry.sayAs === 'string') return entry.sayAs;
  return null;
}

/** Replace whole word tokens with sayAs, leaving whitespace and punctuation in place. */
export function spokenText(text, pronunciations) {
  if (!pronunciations || !Object.keys(pronunciations).length) return String(text);
  return String(text).split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part) || !part) return part;
    const m = /^([^\p{L}\p{M}\p{N}]*)(.*?)([^\p{L}\p{M}\p{N}]*)$/u.exec(part);
    if (!m) return part;
    return `${m[1]}${sayAsFor(m[2], pronunciations) ?? m[2]}${m[3]}`;
  }).join('');
}

/** Add originalText to block lines so word mapping can restore the script spelling after synthesis. */
export function withPronunciation(lines, pronunciations = null) {
  return lines.map((l) => ({ ...l, originalText: l.text, text: spokenText(l.text, pronunciations ?? {}) }));
}

/** Map synthesized words back to the original line tokens by line and occurrence. */
export function restoreWords(words, lines) {
  const byLine = new Map();
  for (const l of lines ?? []) if (!byLine.has(l.n)) byLine.set(l.n, String(l.originalText ?? l.text ?? '').split(/\s+/).filter(Boolean));
  const seen = new Map();
  return (words ?? []).map((w) => {
    const list = byLine.get(w.line);
    if (!list) return w;
    const i = seen.get(w.line) ?? 0;
    seen.set(w.line, i + 1);
    return list[i] ? { ...w, w: list[i].replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, '') } : w;
  });
}
