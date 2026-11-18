// Performance stage: the voice director marks tone, relative pace, pauses and stress; deterministic limits gate it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validationErrors, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { PERFORMANCE } from './prompts.js';
import { normalizedTokens, normalizeWord } from '../../../shared/words.mjs';

export function performanceErrors(data, script, project) {
  const errs = validationErrors('performance', data);
  if (errs.length) return errs;
  const lines = new Map(script.lines.map((l) => [l.n, l]));
  const seen = new Set();
  let totalPause = 0;
  for (const p of data.lines) {
    if (!lines.has(p.n)) { errs.push(`/lines/${p.n} is not in the script`); continue; }
    if (seen.has(p.n)) errs.push(`/lines/${p.n} is duplicated`);
    seen.add(p.n);
    const spoken = new Set(normalizedTokens(lines.get(p.n).text));
    for (const x of p.pauses ?? []) { totalPause += x.s; if (!spoken.has(normalizeWord(x.after))) errs.push(`/lines/${p.n}/pauses "${x.after}" is not in the line`); }
    for (const w of p.stress ?? []) if (!spoken.has(normalizeWord(w))) errs.push(`/lines/${p.n}/stress "${w}" is not in the line`);
  }
  for (const n of lines.keys()) if (!seen.has(n)) errs.push(`/lines is missing ${n}`);
  if (totalPause > (project.seconds ?? 0) * 0.08 + 0.001) errs.push(`total pause ${totalPause.toFixed(2)} s exceeds 8% of ${project.seconds} s`);
  return errs;
}

export async function runPerformance({ projectDir, project, router }) {
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const { data } = await router.callJson('performance', [
    { role: 'system', content: PERFORMANCE },
    { role: 'user', content: `DATA:\n${JSON.stringify({ seconds: project.seconds, language: project.language, lines: script.lines.map((l) => ({ n: l.n, beat: l.beat, text: l.text, gloss: l.gloss, delivery: l.delivery })) }, null, 2)}\nMark every line. Return json only.` },
  ], { validate: (d) => performanceErrors(d, script, project), repairHint: 'Every line exactly once; pace 0.9-1.2; <=2 stress words; pauses 0.15-0.6 s and <=8% of the film.' });
  writeJsonArtifact(projectDir, 'performance', 'performance.json', data, 'performance');
  const md = ['# Performance direction', '', '| line | tone | pace | pauses | stress |', '|---|---|---:|---|---|', ...data.lines.map((l) => `| ${l.n} | ${l.tone} | ${l.pace.toFixed(2)} | ${(l.pauses ?? []).map((p) => `${p.after} ${p.s}s`).join(', ')} | ${(l.stress ?? []).join(', ')} |`), ''].join('\n');
  writeTextArtifact(projectDir, 'performance', 'performance.md', md);
  return { lines: data.lines.length, pauseSeconds: +data.lines.reduce((n, l) => n + (l.pauses ?? []).reduce((m, p) => m + p.s, 0), 0).toFixed(3), usage: router.stageUsage('performance') };
}
