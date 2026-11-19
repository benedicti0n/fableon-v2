// Script stage: structured, fact-cited narration; deterministic style/grammar checks; SCRIPT.md renderer.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.js';
import { validationErrors, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { buildCatalogCard } from '../catalog-card.js';
import { isApprovedLocked, markScriptRevised } from '../core/state.js';
import { FableonError, ERROR_CODES } from '../core/errors.js';
import { SCRIPT, SCRIPT_HI, REVISE } from './prompts.js';
import { voiceRate } from '../voice/rate.js';
import { countWords, normalizedText, normalizedTokens, normalizeWord } from '../../../shared/words.mjs';

export const WPS = 3.75; // measured on the fixture: 451 words / 120.1 s
export const normalizerLog = new WeakMap();

const logNormalizer = (data, kind, line, detail = '') => {
  let log = normalizerLog.get(data);
  if (!log) { log = { count: 0, lines: [] }; normalizerLog.set(data, log); }
  log.count++;
  log.lines.push(`${kind}${line !== undefined ? ` line ${line}` : ''}${detail ? `: ${detail}` : ''}`);
};
const BEAT_ORDER = ['hook', 'setting', 'action', 'snap', 'deadpan', 'explain', 'consequence', 'twist'];
const LEGACY_ONLY = new Set(['action', 'snap', 'explain', 'consequence', 'twist']);
const FORMULA_BEATS = new Set(['hook', 'setting', 'escalation', 'mystery', 'pivot', 'analogy', 'payoff']);
const FORMULA_ORDER = ['hook', 'setting', 'escalation', 'mystery', 'pivot', 'analogy', 'payoff'];
export const DEFAULT_PIVOTS = { en: ['You see,'], hi: ['दरअसल,', 'असल में,'] };
const SETUP_START = /^(once\b|long ago\b|many years ago\b|in a\b|in the\b|there (was|were)\b|this is (the|a) story\b|एक (समय|गाँव|राज्य|दिन)\b|बहुत (पहले|समय)\b|यह कहानी\b|किसी (गाँव|राज्य)\b)/i;
const DIALOGUE = /["“”„«»]([^"“”„«»]{2,80})["“”„«»]/u;

/** Map a legacy beat to the reference formula beat for display and migration. */
export function formulaBeat(beat) {
  if (beat === 'hook' || beat === 'setting') return beat;
  if (beat === 'action' || beat === 'snap' || beat === 'deadpan' || beat === 'consequence') return 'escalation';
  if (beat === 'explain') return 'analogy';
  if (beat === 'twist') return 'payoff';
  return beat;
}

export function formulaPivots(project) {
  const language = project.language ?? 'en';
  const configured = project.script?.pivots?.[language];
  return configured?.length ? configured : DEFAULT_PIVOTS[language] ?? DEFAULT_PIVOTS.en;
}

export function formulaLineTarget(seconds) {
  return Math.max(10, Math.min(14, Math.round(Number(seconds) / 7)));
}
const NOT_NAMES = new Set(['He', 'She', 'It', 'They', 'We', 'You', 'His', 'Her', 'Their', 'The', 'A', 'An', 'And', 'But', 'Then', 'So', 'When', 'While', 'After', 'Before', 'If', 'Because', 'That', 'This', 'These', 'Those', 'Luckily', 'Unluckily']);
const words = (s) => normalizedTokens(s);
const normal = (s) => normalizedText(s);
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

export function hindiLineTarget(seconds) { return formulaLineTarget(seconds); }

export function hindiWordBudget(n, targetWords) {
  const hook = Math.min(16, Math.max(6, Math.round(targetWords / n) + 2));
  const rest = Math.max(0, Math.round(targetWords) - hook);
  const base = Math.floor(rest / Math.max(1, n - 1)), extra = rest - base * Math.max(1, n - 1);
  return [hook, ...Array.from({ length: n - 1 }, (_, i) => base + (i < extra ? 1 : 0))];
}

/** Reference formula plan: hook, 1-2 setting, 3-6 escalation, mystery, pivot, analogy, 1-2 payoff. */
export function formulaBeatPlan(n) {
  const total = Math.max(10, Math.min(14, Number(n) || 10));
  const fixed = 6; // hook + mystery + pivot + analogy + two payoff lines
  const rest = total - fixed;
  const setting = rest >= 5 ? 2 : 1;
  const escalation = Math.max(3, rest - setting);
  return ['hook', ...Array(setting).fill('setting'), ...Array(escalation).fill('escalation'), 'mystery', 'pivot', 'analogy', 'payoff', 'payoff'].slice(0, total);
}

export const hindiBeatPlan = formulaBeatPlan;

export function deliveryErrors(line) {
  const d = line.delivery;
  if (!d) return [];
  const errs = [];
  const spoken = new Set(normalizedTokens(line.text));
  for (const p of d.pauses ?? []) if (!spoken.has(normalizeWord(p.after))) errs.push(`/lines/${line.n}/delivery/pauses "${p.after}" is not a word in the line`);
  for (const w of d.emphasis ?? []) if (!spoken.has(normalizeWord(w))) errs.push(`/lines/${line.n}/delivery/emphasis "${w}" is not a word in the line`);
  return errs;
}

function lookErrors(line, catalog, characterIds) {
  const errs = [];
  const look = line.look ?? {};
  const set = catalog.sets.find((s) => s.name === look.set);
  if (!set) errs.push(`/lines/${line.n}/look/set "${look.set}" is not in the catalog`);
  if (look.mark && set) {
    const ok = set.marks.some((m) => m.name === look.mark || `${set.name}.${m.name}` === look.mark);
    if (!ok) errs.push(`/lines/${line.n}/look/mark "${look.mark}" is not a mark on set "${set.name}"`);
  }
  if (look.pose && !catalog.poses.some((p) => p.name === look.pose)) errs.push(`/lines/${line.n}/look/pose "${look.pose}" is not in the catalog`);
  if (look.expr && !catalog.expressions.some((p) => p.name === look.expr)) errs.push(`/lines/${line.n}/look/expr "${look.expr}" is not in the catalog`);
  if (look.prop && !catalog.props.some((p) => p.name === look.prop)) errs.push(`/lines/${line.n}/look/prop "${look.prop}" is not in the catalog`);
  for (const who of look.who ?? []) if (!characterIds.has(who)) errs.push(`/lines/${line.n}/look/who "${who}" is not declared`);
  return errs;
}

function hindiCraftErrors(data, project, facts) {
  const errs = [];
  const targetLines = hindiLineTarget(project.seconds);
  if (Math.abs(data.lines.length - targetLines) > Math.max(3, targetLines * 0.2)) {
    errs.push(`/lines has ${data.lines.length} lines; target about ${Math.round(targetLines)} (${Math.max(1, Math.floor(targetLines * 0.8))}-${Math.ceil(targetLines * 1.2)})`);
  }
  for (const l of data.lines) {
    if (!l.gloss || !String(l.gloss).trim()) errs.push(`/lines/${l.n}/gloss is required for Hindi`);
    if (!l.delivery) errs.push(`/lines/${l.n}/delivery is required for Hindi`);
    if (!l.delivery?.tone) errs.push(`/lines/${l.n}/delivery/tone is required for Hindi`);
    if (['hook', 'deadpan', 'explain', 'twist'].includes(l.beat)) {
      const d = l.delivery ?? {};
      if (!(d.pauseBefore > 0) && !(d.emphasis ?? []).length) errs.push(`/lines/${l.n} ${l.beat} needs a pause or emphasis`);
    }
  }
  const deadpan = data.lines.filter((l) => l.beat === 'deadpan');
  if (deadpan.length !== 2 || deadpan[1].n !== deadpan[0].n + 1) errs.push('/lines deadpan must be exactly two consecutive lines (good news, then bad news)');
  if (data.lines.filter((l) => l.beat === 'explain').length !== 1) errs.push('/lines must have exactly one explain line');
  const used = new Set();
  for (let i = 0; i < data.lines.length;) {
    const beat = data.lines[i].beat;
    if (!['action', 'snap', 'consequence'].includes(beat)) { i++; continue; }
    const run = [];
    while (i < data.lines.length && data.lines[i].beat === beat) run.push(data.lines[i++]);
    const ids = [...new Set(run.flatMap((l) => l.facts ?? []))];
    const addsNew = ids.some((id) => !used.has(id));
    if (!addsNew) errs.push(`/lines/${run[0].n}-${run[run.length - 1].n} repeats only already-used facts; add a new fact or move the content`);
    for (const id of ids) used.add(id);
  }
  const verified = new Set((facts.facts ?? []).filter((f) => f.verified).map((f) => f.id));
  for (const l of data.lines) for (const id of l.facts ?? []) if (!verified.has(id)) errs.push(`/lines/${l.n} cites ${id}, which is missing or unverified`);
  return errs;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Deterministic reference-formula checks for new-style scripts (old beat vocabulary keeps the legacy checks). */
export function formulaErrors(data, project) {
  const errs = [];
  const lines = data.lines ?? [];
  if (!lines.length) return ['/lines is empty'];
  const hook = lines[0];
  if (hook.beat !== 'hook') errs.push('/lines/0/beat must be hook');
  if (lines.filter((l) => l.beat === 'hook').length !== 1) errs.push(`/lines has ${lines.filter((l) => l.beat === 'hook').length} hook lines; use exactly 1`);
  const hookWords = words(hook.text).length;
  if (hookWords > 16) errs.push(`/lines/0 hook is longer than 16 words (${hookWords}); cut at least ${hookWords - 16} word(s)`);
  if (SETUP_START.test(String(hook.text).trim())) errs.push('/lines/0 hook starts with setup; state the paradox immediately');
  if (!data.hookAdvisory || typeof data.hookAdvisory.paradoxAsFact !== 'boolean' || !String(data.hookAdvisory.note ?? '').trim()) errs.push('/hookAdvisory must judge whether the hook is a paradox stated as fact');
  const setting = lines.filter((l) => l.beat === 'setting');
  if (setting.length < 1 || setting.length > 2) errs.push(`/lines has ${setting.length} setting lines; use 1-2`);
  const escalation = lines.filter((l) => l.beat === 'escalation' || l.beat === 'deadpan');
  if (escalation.length < 3 || escalation.length > 6) errs.push(`/lines has ${escalation.length} escalation lines; use 3-6`);
  if (!escalation.some((l) => { const m = DIALOGUE.exec(l.text ?? ''); return m && words(m[1]).length >= 2 && words(m[1]).length <= 10; })) errs.push('/lines escalation needs at least one short quoted in-character dialogue line');
  const mystery = lines.filter((l) => l.beat === 'mystery');
  if (mystery.length !== 1) errs.push(`/lines has ${mystery.length} mystery lines; use exactly 1`);
  if (mystery.length === 1 && !/[?？]\s*["“”'’]?\s*$/.test(mystery[0].text ?? '')) errs.push('/lines mystery must end with a question mark');
  const pivot = lines.filter((l) => l.beat === 'pivot');
  if (pivot.length !== 1) errs.push(`/lines has ${pivot.length} pivot lines; use exactly 1`);
  else {
    const text = String(pivot[0].text ?? '').trim().replace(/^["“”'‘’]+/, '');
    const phrases = formulaPivots(project);
    if (!phrases.some((p) => text.startsWith(p))) errs.push(`/lines pivot must start with ${phrases.map((p) => `"${p}"`).join(' or ')}`);
  }
  if (lines.filter((l) => l.beat === 'analogy').length !== 1) errs.push(`/lines has ${lines.filter((l) => l.beat === 'analogy').length} analogy lines; use exactly 1`);
  const payoff = lines.filter((l) => l.beat === 'payoff');
  if (payoff.length < 1 || payoff.length > 2) errs.push(`/lines has ${payoff.length} payoff lines; use 1-2`);
  if (lines[lines.length - 1].beat !== 'payoff') errs.push('/lines last line must be payoff');
  let last = -1;
  for (const l of lines) {
    if (LEGACY_ONLY.has(l.beat)) { errs.push(`/lines/${l.n}/beat ${l.beat} is a legacy beat; use the formula beats`); continue; }
    const mapped = formulaBeat(l.beat);
    const bi = FORMULA_ORDER.indexOf(mapped);
    if (bi < 0) errs.push(`/lines/${l.n}/beat ${l.beat} is not a formula beat`);
    else { if (bi < last) errs.push(`/lines/${l.n}/beat ${l.beat} is out of formula order`); last = Math.max(last, bi); }
  }
  const sentenceLengths = lines.flatMap((l) => String(l.text ?? '').split(/[.!?।]+/).map((s) => s.trim()).filter(Boolean)).map((s) => words(s).length);
  const med = median(sentenceLengths);
  const band = project.language === 'hi' ? [8, 14] : [10, 16];
  if (med < band[0] || med > band[1]) errs.push(`median sentence length ${med} is outside the language band ${band[0]}-${band[1]} (sentence lengths: ${sentenceLengths.join(', ')}); split long sentences on ideas or full stops`);
  for (const l of lines) {
    if (!l.look?.who?.length) errs.push(`/lines/${l.n}/look needs at least one declared character (who)`);
    if (!l.look?.pose) errs.push(`/lines/${l.n}/look needs a catalog pose for a literal action`);
    if (!String(l.look?.note ?? '').trim()) errs.push(`/lines/${l.n}/look note is required`);
    if (project.language === 'hi') {
      if (!l.gloss || !String(l.gloss).trim()) errs.push(`/lines/${l.n}/gloss is required for Hindi`);
      if (!l.delivery?.tone) errs.push(`/lines/${l.n}/delivery/tone is required for Hindi`);
    }
  }
  return errs;
}

function normalizeLook(line, catalog) {
  const look = line.look;
  if (!look) return;
  if (look.set && !catalog.sets.some((s) => s.name === look.set)) {
    const parts = String(look.set).trim().split(/[\s.]+/);
    if (catalog.sets.some((s) => s.name === parts[0])) {
      look.set = parts[0];
      if (!look.mark && parts[1]) look.mark = parts.slice(1).join('.');
    }
  }
  if (look.expr && !catalog.expressions.some((e) => e.name === look.expr)) {
    if (catalog.poses.some((p) => p.name === look.expr) && !look.pose) look.pose = look.expr;
    delete look.expr;
  }
  if (look.pose && !catalog.poses.some((p) => p.name === look.pose)) delete look.pose;
  if (look.prop && !catalog.props.some((p) => p.name === look.prop)) delete look.prop;
  if (look.mark && !catalog.sets.find((x) => x.name === look.set)?.marks.some((m) => m.name === look.mark || `${look.set}.${m.name}` === look.mark)) delete look.mark;
}

function splitHindiLongLines(data) {
  const out = [];
  for (const l of data.lines) {
    const words = l.text.trim().split(/\s+/);
    if (words.length <= 22) { out.push(l); continue; }
    const sentences = l.text.split(/(?<=[।.!?])\s+/).filter(Boolean);
    const clauses = sentences.length > 1 ? sentences : l.text.split(/(?<=[:;])\s+/).filter(Boolean);
    const parts = [];
    if (clauses.length > 1) {
      let cur = '';
      for (const clause of clauses) {
        if (cur && (cur + ' ' + clause).split(/\s+/).length > 22) { parts.push(cur); cur = clause; }
        else cur = cur ? `${cur} ${clause}` : clause;
      }
      if (cur) parts.push(cur);
      for (let i = 0; i + 1 < parts.length; i++) {
        const m = /(\S+[:;])$/.exec(parts[i]);
        if (m) { parts[i] = parts[i].slice(0, -m[1].length).trim(); parts[i + 1] = `${m[1]} ${parts[i + 1]}`; }
      }
    }
    const glossParts = parts.length > 1 ? String(l.gloss ?? '').split(/(?<=[.!?])\s+/).filter(Boolean) : [];
    if (parts.length <= 1 || glossParts.length !== parts.length) {
      logNormalizer(data, 'split skipped (gloss mismatch)', l.n, `${words.length} words`);
      out.push(l);
      continue;
    }
    logNormalizer(data, 'split', l.n, `${parts.length} parts`);
    parts.forEach((text, i) => out.push({
      ...l,
      text,
      gloss: glossParts[i],
      delivery: { ...(l.delivery ?? {}), ...(i ? { pauseBefore: 0.2, pauses: [], emphasis: [] } : {}) },
    }));
  }
  data.lines = out;
}

function cleanHindiDelivery(data) {
  for (const l of data.lines) {
    if (!l.delivery) continue;
    const spoken = new Set(normalizedTokens(l.text));
    l.delivery.pauses = (l.delivery.pauses ?? []).filter((p) => spoken.has(normalizeWord(p.after)));
    l.delivery.emphasis = (l.delivery.emphasis ?? []).filter((w) => spoken.has(normalizeWord(w)));
  }
}

const TONE_ALIAS = {
  neutral: 'matter-of-fact', stern: 'tense', shock: 'awe', pained: 'tense', nervous: 'tense',
  smile: 'warm', sad: 'whisper', angry: 'tense', determined: 'matter-of-fact', sleepy: 'whisper', smirk: 'deadpan', calm: 'warm',
};
export function normalizeHindiScript(data, catalog, { split = true } = {}) {
  for (const l of data.lines) {
    if (!l.delivery?.tone) continue;
    const allowed = new Set(['deadpan', 'mock-serious', 'matter-of-fact', 'warm', 'excited', 'tense', 'awe', 'whisper']);
    if (!allowed.has(l.delivery.tone) && TONE_ALIAS[l.delivery.tone]) {
      logNormalizer(data, 'tone alias', l.n, `${l.delivery.tone} -> ${TONE_ALIAS[l.delivery.tone]}`);
      l.delivery.tone = TONE_ALIAS[l.delivery.tone];
    }
  }
  for (const n of data.names ?? []) { if (n.phonemes === undefined) n.phonemes = null; if (n.suggested === undefined) n.suggested = true; }
  for (const l of data.lines) normalizeLook(l, catalog);
  const escalations = data.lines.filter((l) => l.beat === 'escalation');
  if (escalations.length > 6) {
    for (const l of escalations.slice(6)) { l.beat = 'action'; logNormalizer(data, 'escalation overflow', l.n); }
  }
  // A setting line that only reacts can inherit the fact of the previous/next factual line.
  for (let i = 0; i < data.lines.length; i++) {
    const l = data.lines[i];
    if (['setting', 'action', 'snap', 'consequence'].includes(l.beat) && !(l.facts ?? []).length) {
      const donor = [...data.lines.slice(0, i)].reverse().find((x) => (x.facts ?? []).length) ?? data.lines.slice(i + 1).find((x) => (x.facts ?? []).length);
      if (donor) { l.facts = [...donor.facts]; logNormalizer(data, 'fact fill', l.n); }
    }
  }
  // Merge consecutive action/snap/consequence lines that cite exactly the same facts (repeated content).
  const merged = [];
  for (const l of data.lines) {
    const prev = merged[merged.length - 1];
    const factKey = (x) => JSON.stringify([...(x.facts ?? [])].sort());
    if (prev && !/[।.!?]$/.test(prev.text.trim()) && ['action', 'snap', 'consequence'].includes(l.beat) && prev.beat === l.beat && factKey(prev) === factKey(l) && (l.facts ?? []).length) {
      prev.text = `${prev.text.trim().replace(/[।.!?]+$/, '')}। ${l.text.trim()}`;
      prev.gloss = `${prev.gloss.trim()} ${l.gloss.trim()}`;
      logNormalizer(data, 'merge', l.n, `joined into line ${prev.n}`);
      prev.delivery = {
        ...prev.delivery,
        pauseBefore: Math.max(prev.delivery?.pauseBefore ?? 0, l.delivery?.pauseBefore ?? 0),
        pauses: [...(prev.delivery?.pauses ?? []), ...(l.delivery?.pauses ?? [])],
        emphasis: [...new Set([...(prev.delivery?.emphasis ?? []), ...(l.delivery?.emphasis ?? [])])],
      };
    } else merged.push({ ...l });
  }
  merged.forEach((l, i) => { l.n = i; });
  data.lines = merged;
  if (split) splitHindiLongLines(data);
  cleanHindiDelivery(data);
  data.lines.forEach((l, i) => { l.n = i; });
}

export function plannedPauseSeconds(data) {
  let total = 0, beat = null;
  for (const l of data.lines ?? []) {
    total += Number(l.delivery?.pauseBefore ?? 0);
    for (const p of l.delivery?.pauses ?? []) total += Number(p.s ?? 0);
    if (beat !== null && l.beat !== beat) total += 0.26;
    beat = l.beat;
  }
  return total;
}

export function validateScript(data, { project, facts, catalog, sourceTexts = [] }) {
  const formulaIncoming = data.lines?.some((l) => ['escalation', 'mystery', 'pivot', 'analogy', 'payoff'].includes(l.beat));
  if (project.language === 'hi') normalizeHindiScript(data, catalog, { split: !formulaIncoming });
  for (const l of data.lines ?? []) normalizeLook(l, catalog);
  const errs = validationErrors('script', data);
  if (errs.length) return errs;
  const vr = voiceRate(project);
  const deliveredRate = vr.source === 'delivered' ? vr.wordsPerSecond : null;
  const rate = vr.wordsPerSecond;
  const pauses = plannedPauseSeconds(data);
  const target = deliveredRate ? project.seconds * deliveredRate : Math.max(1, project.seconds - pauses) * rate, total = data.lines.reduce((n, l) => n + countWords(l.text), 0);
  const tol = project.language === 'hi' ? 0.15 : 0.07;
  const lo = Math.ceil(target * (1 - tol)), hi = Math.floor(target * (1 + tol));
  const basis = deliveredRate ? `delivered rate target ${target.toFixed(1)} = ${project.seconds} s × ${deliveredRate} words/s` : `pause-aware target ${target.toFixed(1)} = (${project.seconds} - ${pauses.toFixed(2)} s pauses) × ${rate}`;
  if (total < lo || total > hi) errs.push(`/lines total ${total} words is outside ${lo}-${hi} (${basis}); ${total < lo ? `add about ${Math.ceil(target - total)} words` : `cut about ${Math.ceil(total - target)} words`}`);
  const formula = data.lines.some((l) => ['escalation', 'mystery', 'pivot', 'analogy', 'payoff'].includes(l.beat));
  if (!formula) {
    if (data.lines[0].beat !== 'hook') errs.push('/lines/0/beat must be hook');
    if (data.lines[data.lines.length - 1].beat !== 'twist') errs.push('/lines last beat must be twist');
    const maxHook = project.language === 'hi' ? 20 : 16;
    if (words(data.lines[0].text).length > maxHook) errs.push(`/lines/0 hook is longer than ${maxHook} words (${words(data.lines[0].text).length}); cut at least ${words(data.lines[0].text).length - maxHook} word(s)`);
  }
  const factBeats = formula ? ['setting', 'escalation', 'pivot', 'analogy'] : ['setting', 'action', 'snap', 'consequence'];
  let last = -1;
  for (const l of data.lines) {
    if (l.n !== data.lines.indexOf(l)) errs.push(`/lines/${l.n} n must be 0-based and ordered`);
    const maxLine = 22;
    if (l.n > 0 && words(l.text).length > maxLine) errs.push(`/lines/${l.n}/text is longer than ${maxLine} words (${words(l.text).length}); cut at least ${words(l.text).length - maxLine} word(s)`);
    if (!formula) {
      const bi = BEAT_ORDER.indexOf(l.beat);
      if (bi < 0) errs.push(`/lines/${l.n}/beat is invalid`);
      else { if (bi < last) errs.push(`/lines/${l.n}/beat ${l.beat} is out of formula order`); last = Math.max(last, bi); }
    }
    if (factBeats.includes(l.beat) && !(l.facts ?? []).length) errs.push(`/lines/${l.n} needs at least one verified fact`);
    for (const id of l.facts ?? []) if (!factMap(facts).get(id)?.verified) errs.push(`/lines/${l.n} cites ${id}, which is missing or unverified`);
    errs.push(...deliveryErrors(l));
    const chars = new Set(data.characters.map((c) => c.id));
    errs.push(...lookErrors(l, catalog, chars));
  }
  if (formula) errs.push(...formulaErrors(data, project));
  if (project.language === 'hi' && !formula) errs.push(...hindiCraftErrors(data, project, facts));
  const listed = new Set((data.names ?? []).map((n) => normalizeWord(n.word)));
  const declared = new Set([...(data.characters ?? []), ...(data.mentions ?? [])].map((c) => normalizeWord(c.name)));
  for (const n of data.names ?? []) if (!declared.has(normalizeWord(n.word))) errs.push(`/names "${n.word}" must be in characters or mentions`);
  if (project.language !== 'hi') {
    for (const l of data.lines) for (const n of capitalizedNames(l.text)) if (!listed.has(normalizeWord(n))) errs.push(`/lines/${l.n} name "${n}" is not listed in names`);
  }
  const source = normal(sourceTexts.join(' '));
  for (const l of data.lines) {
    const w = words(l.text);
    for (let i = 0; i + 8 <= w.length; i++) if (source.includes(normal(w.slice(i, i + 8).join(' ')))) { errs.push(`/lines/${l.n} copies an 8-word run from a source`); break; }
  }
  return [...new Set(errs)];
}

function renderScript(project, data, facts) {
  const verified = (facts.facts ?? []).filter((f) => f.verified);
  const n = data.lines.reduce((k, l) => k + countWords(l.text), 0);
  const lines = [
    `# "${data.title}" — a Fableon short`,
    `Format: ~${Math.round(data.seconds)} s vertical short, ${project.language === 'hi' ? 'Hindi narration' : 'one steady narrator'}, our own wording.`,
    `Topic: ${project.topic}`,
    '',
    '## Facts (verified against the recorded sources)',
    ...verified.map((f, i) => `${i + 1}. ${f.claim} (${f.sources.map((s) => s.source).join(', ')})`),
    '',
    `## Script (voice, ~${n} words)`,
    ...data.lines.map((l) => l.text),
    '',
    '## Look/beat notes (for the shot plan, not spoken)',
    ...data.lines.map((l) => `- ${l.beat}: ${l.look.set}${l.look.mark ? ` (${l.look.mark})` : ''}; ${l.look.who.join(', ') || 'scenery'}${l.look.pose ? `; pose ${l.look.pose}` : ''}${l.look.expr ? `; expr ${l.look.expr}` : ''}${l.look.prop ? `; prop ${l.look.prop}` : ''} — ${l.look.note}${l.gloss ? ` | gloss: ${l.gloss}` : ''}`),
    '',
    '## Sources',
    ...verified.flatMap((f) => f.sources.map((s) => `- ${s.source}: ${s.quote}`)),
    '',
  ];
  return lines.join('\n');
}

export async function runScript({ projectDir, project, router, progress = null }) {
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
  const isHi = project.language === 'hi';
  const vr = voiceRate(project);
  const deliveredRate = vr.source === 'delivered' ? vr.wordsPerSecond : null;
  const rate = vr.wordsPerSecond;
  const lineTarget = formulaLineTarget(project.seconds);
  const lineLo = Math.max(8, lineTarget - 1);
  const lineHi = Math.min(14, lineTarget + 1);
  const beatPlan = formulaBeatPlan(lineTarget);
  const beatChanges = beatPlan.filter((b, i) => i && b !== beatPlan[i - 1]).length;
  const pauseEstimate = isHi ? lineTarget * 0.15 + beatChanges * 0.15 : 0;
  const target = deliveredRate ? project.seconds * deliveredRate : Math.max(1, project.seconds - pauseEstimate) * rate;
  const wordsTarget = Math.round(target);
  const wordsLo = Math.ceil(target * 0.93), wordsHi = Math.floor(target * 1.07);
  const pivots = formulaPivots(project);
  const pivotList = pivots.map((p) => `"${p}"`).join(isHi ? ' or ' : ' / ');
  const wordBudget = hindiWordBudget(lineTarget, wordsTarget);
  const budgetList = wordBudget.map((w, i) => `${i}:${w}`).join(', ');
  const planList = beatPlan.map((b, i) => `${i}:${b}`).join(', ');
  const instruction = isHi
    ? `Use exactly ${lineTarget} lines (${lineLo}-${lineHi} allowed) and about ${wordsTarget} words; hard range ${wordsLo}-${wordsHi}; about ${(target / lineTarget).toFixed(1)} words per line. Exact plan, one beat per line: ${planList}. Per-line word budget: ${budgetList}; stay within 2 words of each budget. Count words before returning. Exactly one mystery line ends with "?" before the pivot; the pivot line starts with ${pivotList}; the payoff is the last 1-2 lines. Optional deadpan pair: two consecutive escalation lines, good news then genuinely bad news, both beat escalation with tone deadpan. At least one escalation line must contain an actual quoted in-character sentence in quotation marks (for example the brahmin says \"मेरे पास कोई विकल्प नहीं।\"), not indirect speech. Every line needs gloss, delivery and a literal look with set, who, pose and note.`
    : `Use exactly ${lineTarget} lines (${lineLo}-${lineHi} allowed) and about ${wordsTarget} words; hard range ${wordsLo}-${wordsHi}. Exact plan, one beat per line: ${planList}. Per-line word budget: ${budgetList}; stay within 2 words of each budget. Count words before returning. Exactly one mystery line ends with "?" before the pivot; the pivot line starts with ${pivotList}; the payoff is the last 1-2 lines. Every look needs set, who, pose and a literal note.`;
  const repairHint = `Keep the reference formula: hook line 0 10-16 words with no setup; 1-2 setting lines; 3-6 escalation lines with one short quoted in-character dialogue inside an escalation line (actual quotation marks); exactly one mystery line ending in "?" before the pivot; the pivot line starts with ${pivotList}; exactly one analogy; the payoff is the last 1-2 lines. Median sentence length ${isHi ? '8-14' : '10-16'} words: split any long sentence into two short ones. Every look needs at least one who and a catalog pose. Every setting/escalation/pivot/analogy line cites a verified fact. Include hookAdvisory.${isHi ? ' Every line needs a gloss and delivery; every pause/emphasis word must exist in its line.' : ''} Use the exact plan ${planList} and word budget ${budgetList}. Keep about ${lineTarget} lines (${lineLo}-${lineHi}) and ${wordsLo}-${wordsHi} words.`;
  progress?.({ step: 'script:model', done: 0, total: 1 });
  const { data, usage } = await router.callJson('script', [
    { role: 'system', content: isHi ? SCRIPT_HI : SCRIPT },
    { role: 'user', content: `STABLE CATALOG (sets, marks, poses, expressions and props are the only stageable ones):\n${card}\n\nDATA:\n<brief>\n${brief}\n</brief>\n<verified_facts>\n${verified.map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nTarget: ${project.seconds} seconds at ${rate} words/second = about ${wordsTarget} words (valid ${wordsLo}-${wordsHi}). ${instruction} Return json only.` },
  ], { validate: (d) => validateScript(d, { project, facts, catalog, sourceTexts }), repairHint });
  progress?.({ step: 'script:model', done: 1, total: 1 });
  data.wps = rate;
  writeJsonArtifact(projectDir, 'script', 'script.json', data, 'script');
  writeTextArtifact(projectDir, 'script', 'SCRIPT.md', renderScript(project, data, facts));
  return { usage, normalizer: normalizerLog.get(data) ?? null };
}

/** Rewrite selected script lines with director notes; every other line object stays unchanged. */
export async function reviseScriptLines({ projectDir, project, router, lines = [], notes = '', force = false }) {
  if (isApprovedLocked(projectDir, project, 'script') && !force) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'script output is approved and read-only; pass --force without autopilot to rewrite lines', { stage: 'script' });
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(projectDir, 'research', 'facts.json'), 'utf8'));
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const selected = [...new Set((lines ?? []).map(Number).filter((n) => Number.isInteger(n)))];
  if (!selected.length) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'script-lines needs at least one line number', { lines });
  const known = new Set((script.lines ?? []).map((l) => l.n));
  const missing = selected.filter((n) => !known.has(n));
  if (missing.length) throw new FableonError(ERROR_CODES.BAD_REQUEST, `script-lines has unknown line(s): ${missing.join(', ')}`, { lines: missing });
  const failN = new Set(selected);
  const sourceTexts = (() => {
    const dir = join(projectDir, 'research', 'sources');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /\.(md|txt|html?)$/i.test(f)).map((f) => readFileSync(join(dir, f), 'utf8'));
  })();
  const full = script.lines.map((l) => ({ n: l.n, beat: l.beat, text: l.text, gloss: l.gloss, facts: l.facts, delivery: l.delivery, look: l.look }));
  const selectedData = full.filter((l) => failN.has(l.n));
  const { data, usage } = await router.callJson('script', [
    { role: 'system', content: REVISE },
    { role: 'user', content: `Rewrite only these line numbers: ${selected.join(', ')}.\nDirector notes: ${String(notes || '(none)')}\n\nDATA:\n<selected_lines>\n${JSON.stringify(selectedData, null, 2)}\n</selected_lines>\n<full_script>\n${JSON.stringify(full, null, 2)}\n</full_script>\n<verified_facts>\n${(facts.facts ?? []).filter((f) => f.verified).map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nCatalog sets: ${catalog.sets.map((s) => s.name).join(', ')}. Return json only.` },
  ], {
    mockKey: 'script-lines',
    validate: (d) => {
      const errs = [];
      if (!Array.isArray(d.lines)) return ['/lines must be an array'];
      for (const l of d.lines) if (!failN.has(l.n)) errs.push(`/lines/${l.n} was not requested for revision`);
      if (new Set(d.lines.map((l) => l.n)).size !== d.lines.length) errs.push('/lines has duplicate n values');
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
    markScriptRevised(projectDir, { force });
  }
  return { usage, changed, lines: selected, notes: String(notes || '') };
}

/** Rewrite only the failing lines; every other line stays byte-identical. */
export async function reviseScript({ projectDir, project, router, failures }) {
  if (isApprovedLocked(projectDir, project, 'script')) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'script output is approved and read-only; the factcheck revision loop will not modify it', { stage: 'script' });
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
  const full = script.lines.map((l) => ({ n: l.n, beat: l.beat, text: l.text, gloss: l.gloss, facts: l.facts, delivery: l.delivery, look: l.look }));
  const { data, usage } = await router.callJson('script', [
    { role: 'system', content: REVISE },
    { role: 'user', content: `DATA:\n<failing_lines>\n${JSON.stringify(failing, null, 2)}\n</failing_lines>\n<full_script>\n${JSON.stringify(full, null, 2)}\n</full_script>\n<review>\n${JSON.stringify(failures, null, 2)}\n</review>\n<verified_facts>\n${(facts.facts ?? []).filter((f) => f.verified).map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nCatalog sets: ${catalog.sets.map((s) => s.name).join(', ')}. Return json only.` },
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
  return { usage, changed, normalizer: normalizerLog.get(revised) ?? null };
}
