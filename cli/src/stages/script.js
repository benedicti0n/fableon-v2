// Script stage: structured, fact-cited narration; deterministic style/grammar checks; SCRIPT.md renderer.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.js';
import { validationErrors, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { buildCatalogCard } from '../catalog-card.js';
import { markScriptRevised } from '../core/state.js';
import { SCRIPT, REVISE } from './prompts.js';

export const WPS = 3.75; // measured on the fixture: 451 words / 120.1 s
const BEAT_ORDER = ['hook', 'setting', 'action', 'snap', 'deadpan', 'explain', 'consequence', 'twist'];
const NOT_NAMES = new Set(['He', 'She', 'It', 'They', 'We', 'You', 'His', 'Her', 'Their', 'The', 'A', 'An', 'And', 'But', 'Then', 'So', 'When', 'While', 'After', 'Before', 'If', 'Because', 'That', 'This', 'These', 'Those', 'Luckily', 'Unluckily']);
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const normal = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const factMap = (facts) => new Map((facts.facts ?? []).map((f) => [f.id, f]));

function capitalizedNames(text) {
  const names = new Set();
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const toks = sentence.split(/\s+/).filter(Boolean);
    for (let i = 1; i < toks.length; i++) {
      const w = toks[i].replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, '');
      if (/^[A-Z][a-z]+(?:'s)?$/.test(w) && w !== 'I' && !NOT_NAMES.has(w)) names.add(w.replace(/'s$/, ''));
    }
  }
  return names;
}

export function validateScript(data, { project, facts, catalog, sourceTexts = [] }) {
  const errs = validationErrors('script', data);
  if (errs.length) return errs;
  const target = project.seconds * WPS, total = data.lines.reduce((n, l) => n + words(l.text).length, 0);
  const lo = Math.ceil(target * 0.93), hi = Math.floor(target * 1.07);
  if (total < lo || total > hi) errs.push(`/lines total ${total} words is outside ${lo}-${hi} (target ${target.toFixed(1)} ±7 %); ${total < lo ? `add about ${Math.ceil(target - total)} words` : `cut about ${Math.ceil(total - target)} words`}`);
  if (data.lines[0].beat !== 'hook') errs.push('/lines/0/beat must be hook');
  if (data.lines[data.lines.length - 1].beat !== 'twist') errs.push('/lines last beat must be twist');
  if (words(data.lines[0].text).length > 16) errs.push(`/lines/0 hook is longer than 16 words (${words(data.lines[0].text).length}); cut at least ${words(data.lines[0].text).length - 16} word(s)`);
  let last = -1;
  for (const l of data.lines) {
    if (l.n !== data.lines.indexOf(l)) errs.push(`/lines/${l.n} n must be 0-based and ordered`);
    if (words(l.text).length > 22) errs.push(`/lines/${l.n}/text is longer than 22 words (${words(l.text).length}); cut at least ${words(l.text).length - 22} word(s)`);
    const bi = BEAT_ORDER.indexOf(l.beat);
    if (bi < 0) errs.push(`/lines/${l.n}/beat is invalid`);
    else { if (bi < last) errs.push(`/lines/${l.n}/beat ${l.beat} is out of formula order`); last = Math.max(last, bi); }
    if (['setting', 'action', 'snap', 'consequence'].includes(l.beat) && !(l.facts ?? []).length) errs.push(`/lines/${l.n} needs at least one verified fact`);
    for (const id of l.facts ?? []) if (!factMap(facts).get(id)?.verified) errs.push(`/lines/${l.n} cites ${id}, which is missing or unverified`);
    if (!catalog.sets.some((s) => s.name === l.look?.set)) errs.push(`/lines/${l.n}/look/set "${l.look?.set}" is not in the catalog`);
    const chars = new Set(data.characters.map((c) => c.id));
    for (const who of l.look?.who ?? []) if (!chars.has(who)) errs.push(`/lines/${l.n}/look/who "${who}" is not declared`);
  }
  const listed = new Set(data.names.map((n) => n.word));
  for (const l of data.lines) for (const n of capitalizedNames(l.text)) if (!listed.has(n)) errs.push(`/lines/${l.n} name "${n}" is not listed in names`);
  const source = normal(sourceTexts.join(' '));
  for (const l of data.lines) {
    const w = words(l.text);
    for (let i = 0; i + 8 <= w.length; i++) if (source.includes(normal(w.slice(i, i + 8).join(' ')))) { errs.push(`/lines/${l.n} copies an 8-word run from a source`); break; }
  }
  return [...new Set(errs)];
}

function renderScript(project, data, facts) {
  const verified = (facts.facts ?? []).filter((f) => f.verified);
  const n = data.lines.reduce((k, l) => k + words(l.text).length, 0);
  const lines = [
    `# "${data.title}" — a Fableon short`,
    `Format: ~${Math.round(data.seconds)} s vertical short, one steady narrator, our own wording.`,
    `Topic: ${project.topic}`,
    '',
    '## Facts (verified against the recorded sources)',
    ...verified.map((f, i) => `${i + 1}. ${f.claim} (${f.sources.map((s) => s.source).join(', ')})`),
    '',
    `## Script (voice, ~${n} words)`,
    ...data.lines.map((l) => l.text),
    '',
    '## Look/beat notes (for the shot plan, not spoken)',
    ...data.lines.map((l) => `- ${l.beat}: ${l.look.set}; ${l.look.who.join(', ') || 'scenery'} — ${l.look.note}`),
    '',
    '## Sources',
    ...verified.flatMap((f) => f.sources.map((s) => `- ${s.source}: ${s.quote}`)),
    '',
  ];
  return lines.join('\n');
}

export async function runScript({ projectDir, project, router }) {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(projectDir, 'research', 'facts.json'), 'utf8'));
  const brief = readFileSync(join(projectDir, 'brief.md'), 'utf8');
  const card = buildCatalogCard().text;
  const sourceTexts = (() => {
    const dir = join(projectDir, 'research', 'sources');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /\.(md|txt|html?)$/i.test(f)).map((f) => readFileSync(join(dir, f), 'utf8'));
  })();
  const verified = (facts.facts ?? []).filter((f) => f.verified);
  const target = project.seconds * WPS;
  const { data, usage } = await router.callJson('script', [
    { role: 'system', content: SCRIPT },
    { role: 'user', content: `STABLE CATALOG (sets and names are the only stageable ones):\n${card}\n\nDATA:\n<brief>\n${brief}\n</brief>\n<verified_facts>\n${verified.map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nTarget: ${project.seconds} seconds at ${WPS} words/second = about ${Math.round(target)} words. Hard minimum ${Math.ceil(target * 0.93)} words. Use exactly 17 lines: hook 12-15 words, lines 1-15 19-21 words each, twist 18-21 words. Return json only.` },
  ], { validate: (d) => validateScript(d, { project, facts, catalog, sourceTexts }), repairHint: 'Return exactly 17 lines with beats 0 hook, 1 setting, 2 setting, 3 action, 4 action, 5 action, 6 action, 7 snap, 8 deadpan, 9 deadpan, 10 explain, 11 explain, 12 explain, 13 consequence, 14 consequence, 15 consequence, 16 twist. Lines 1-15 must each be 19-21 words, the hook 12-15, the twist 18-21. Count words by splitting on spaces. If the total is too low, add words to lines 1-15 until each is 19-21 words; if a line is too long, shorten only that line.' });
  writeJsonArtifact(projectDir, 'script', 'script.json', data, 'script');
  writeTextArtifact(projectDir, 'script', 'SCRIPT.md', renderScript(project, data, facts));
  return { usage };
}

/** Rewrite only the failing lines; every other line stays byte-identical. */
export async function reviseScript({ projectDir, project, router, failures }) {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(projectDir, 'research', 'facts.json'), 'utf8'));
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const sourceTexts = (() => {
    const dir = join(projectDir, 'research', 'sources');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /\.(md|txt|html?)$/i.test(f)).map((f) => readFileSync(join(dir, f), 'utf8'));
  })();
  const failN = new Set(failures.map((f) => f.n));
  const failing = script.lines.filter((l) => failN.has(l.n));
  const { data, usage } = await router.callJson('script', [
    { role: 'system', content: REVISE },
    { role: 'user', content: `DATA:\n<failing_lines>\n${JSON.stringify(failing, null, 2)}\n</failing_lines>\n<review>\n${JSON.stringify(failures, null, 2)}\n</review>\n<verified_facts>\n${(facts.facts ?? []).filter((f) => f.verified).map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nCatalog sets: ${catalog.sets.map((s) => s.name).join(', ')}. Return json only.` },
  ], {
    validate: (d) => {
      const errs = [];
      if (!Array.isArray(d.lines)) return ['/lines must be an array'];
      for (const l of d.lines) if (!failN.has(l.n)) errs.push(`/lines/${l.n} was not requested for revision`);
      if (errs.length) return errs;
      const next = { ...script, lines: script.lines.map((l) => failN.has(l.n) ? { ...l, ...d.lines.find((x) => x.n === l.n) } : l) };
      return validateScript(next, { project, facts, catalog, sourceTexts });
    },
  });
  const before = script.lines.filter((l) => failN.has(l.n));
  const revised = { ...script, lines: script.lines.map((l) => failN.has(l.n) ? { ...l, ...data.lines.find((x) => x.n === l.n) } : l) };
  const after = revised.lines.filter((l) => failN.has(l.n));
  const changed = before.some((l, i) => JSON.stringify(l) !== JSON.stringify(after[i]));
  if (changed) {
    writeJsonArtifact(projectDir, 'script', 'script.json', revised, 'script');
    writeTextArtifact(projectDir, 'script', 'SCRIPT.md', renderScript(project, revised, facts));
    markScriptRevised(projectDir);
  }
  return { usage, changed };
}
