// Test-only voice provider: a deterministic tone take with word timings. No provider request, no spend.
// It exists so the Playwright journey can exercise the real voice stage without a paid key or Kokoro model.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICE_SR, wavFromPcm } from './wav.js';

const splitWords = (line) => String(line.text ?? '').split(/\s+/).filter(Boolean);

export function synthesizeMock({ projectDir, project }) {
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const seconds = Math.max(1, Number(project.seconds ?? 20));
  const lines = (script.lines ?? []).map((l) => ({ n: l.n, words: splitWords(l) })).filter((l) => l.words.length);
  const totalChars = lines.reduce((n, l) => n + l.words.reduce((m, w) => m + Array.from(w).length, 0), 0) || 1;
  const lead = Math.min(0.4, seconds * 0.02);
  const usable = seconds - lead * 2;
  const words = [];
  let cursor = lead;
  for (const line of lines) {
    for (const word of line.words) {
      const share = (Array.from(word).length / totalChars) * usable;
      words.push({ w: word.replace(/[।,.;!?]+$/g, ''), a: +cursor.toFixed(3), b: +Math.min(seconds, cursor + share).toFixed(3), line: line.n });
      cursor += share;
    }
  }
  const samples = Math.round(seconds * VOICE_SR);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / VOICE_SR;
    const word = words.find((w) => t >= w.a && t < w.b);
    const amp = word ? 0.055 : 0.012;
    const sample = Math.round(Math.sin(2 * Math.PI * 196 * t) * amp * 32767);
    pcm.writeInt16LE(sample, i * 2);
  }
  writeFileSync(join(projectDir, 'voice.wav'), wavFromPcm(pcm));
  return { words, warnings: [], characters: 0, costUsd: 0, calls: [], cached: false, model: 'mock', voiceId: 'mock', usage: { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 } };
}
