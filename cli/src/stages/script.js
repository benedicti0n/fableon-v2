// Script stage: structured, fact-cited narration; deterministic style/grammar checks; SCRIPT.md renderer.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.js';
import { validationErrors, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { buildCatalogCard } from '../catalog-card.js';
import { markScriptRevised } from '../core/state.js';
import { SCRIPT, SCRIPT_HI, REVISE } from './prompts.js';
import { countWords, normalizedText, normalizedTokens, normalizeWord } from '../../../shared/words.mjs';

export const WPS = 3.75; // measured on the fixture: 451 words / 120.1 s
const BEAT_ORDER = ['hook', 'setting', 'action', 'snap', 'deadpan', 'explain', 'consequence', 'twist'];
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

export function hindiLineTarget(seconds) { return Math.max(12, Math.round((seconds / 3.2) * 0.85)); }

export function hindiWordBudget(n, targetWords) {
  const hook = Math.min(16, Math.max(6, Math.round(targetWords / n) + 2));
  const rest = Math.max(0, Math.round(targetWords) - hook);
  const base = Math.floor(rest / Math.max(1, n - 1)), extra = rest - base * Math.max(1, n - 1);
  return [hook, ...Array.from({ length: n - 1 }, (_, i) => base + (i < extra ? 1 : 0))];
}

export function hindiBeatPlan(n, maxFacts = 14) {
  const fixed = 1 + 1 + 2 + 1 + 1; // hook + snap + deadpan pair + explain + twist
  const rest = Math.max(0, n - fixed);
  const factLines = Math.min(maxFacts, Math.max(3, rest - 6));
  const setting = Math.max(2, rest - factLines);
  const action = Math.max(2, Math.round(factLines * 0.5));
  const consequence = Math.max(1, factLines - action);
  const plan = ['hook', ...Array(setting).fill('setting'), ...Array(action).fill('action'), 'snap', 'deadpan', 'deadpan', 'explain', ...Array(consequence).fill('consequence'), 'twist'];
  while (plan.length < n) plan.splice(plan.length - 1, 0, 'setting');
  return plan.slice(0, n);
}

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
    } else {
      for (let i = 0; i < words.length; i += 12) parts.push(words.slice(i, i + 12).join(' '));
    }
    parts.forEach((text, i) => out.push({
      ...l,
      text,
      gloss: l.gloss,
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

function normalizeHindiScript(data, catalog) {
  for (const l of data.lines) normalizeLook(l, catalog);
  // A setting line that only reacts can inherit the fact of the previous/next factual line.
  for (let i = 0; i < data.lines.length; i++) {
    const l = data.lines[i];
    if (['setting', 'action', 'snap', 'consequence'].includes(l.beat) && !(l.facts ?? []).length) {
      const donor = [...data.lines.slice(0, i)].reverse().find((x) => (x.facts ?? []).length) ?? data.lines.slice(i + 1).find((x) => (x.facts ?? []).length);
      if (donor) l.facts = [...donor.facts];
    }
  }
  // Merge consecutive action/snap/consequence lines that cite exactly the same facts (repeated content).
  const merged = [];
  for (const l of data.lines) {
    const prev = merged[merged.length - 1];
    const factKey = (x) => JSON.stringify([...(x.facts ?? [])].sort());
    if (prev && ['action', 'snap', 'consequence'].includes(l.beat) && prev.beat === l.beat && factKey(prev) === factKey(l) && (l.facts ?? []).length) {
      prev.text = `${prev.text.replace(/[।.!?]+$/, '')} ${l.text}`;
      prev.gloss = `${prev.gloss} ${l.gloss}`;
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
  splitHindiLongLines(data);
  cleanHindiDelivery(data);
  data.lines.forEach((l, i) => { l.n = i; });
  // A name in the pronunciation list must map to a declared character; add a neutral mention entry if missing.
  const names = new Set((data.characters ?? []).map((c) => normalizeWord(c.name)));
  for (const [i, n] of (data.names ?? []).entries()) {
    if (!names.has(normalizeWord(n.word))) {
      data.characters.push({ id: `name${i + 1}`, name: n.word, role: 'mentioned', look: 'catalog' });
      names.add(normalizeWord(n.word));
    }
  }
}

export function validateScript(data, { project, facts, catalog, sourceTexts = [] }) {
  if (project.language === 'hi') normalizeHindiScript(data, catalog);
  for (const l of data.lines ?? []) normalizeLook(l, catalog);
  const errs = validationErrors('script', data);
  if (errs.length) return errs;
  const rate = project.voice?.rate?.wordsPerSecond ?? WPS;
  const target = project.seconds * rate, total = data.lines.reduce((n, l) => n + countWords(l.text), 0);
  const lo = Math.ceil(target * 0.93), hi = Math.floor(target * 1.07);
  if (total < lo || total > hi) errs.push(`/lines total ${total} words is outside ${lo}-${hi} (target ${target.toFixed(1)} ±7 %); ${total < lo ? `add about ${Math.ceil(target - total)} words` : `cut about ${Math.ceil(total - target)} words`}`);
  if (data.lines[0].beat !== 'hook') errs.push('/lines/0/beat must be hook');
  if (data.lines[data.lines.length - 1].beat !== 'twist') errs.push('/lines last beat must be twist');
  const maxHook = 16;
  if (words(data.lines[0].text).length > maxHook) errs.push(`/lines/0 hook is longer than ${maxHook} words (${words(data.lines[0].text).length}); cut at least ${words(data.lines[0].text).length - maxHook} word(s)`);
  let last = -1;
  for (const l of data.lines) {
    if (l.n !== data.lines.indexOf(l)) errs.push(`/lines/${l.n} n must be 0-based and ordered`);
    const maxLine = 22;
    if (l.n > 0 && words(l.text).length > maxLine) errs.push(`/lines/${l.n}/text is longer than ${maxLine} words (${words(l.text).length}); cut at least ${words(l.text).length - maxLine} word(s)`);
    const bi = BEAT_ORDER.indexOf(l.beat);
    if (bi < 0) errs.push(`/lines/${l.n}/beat is invalid`);
    else { if (bi < last) errs.push(`/lines/${l.n}/beat ${l.beat} is out of formula order`); last = Math.max(last, bi); }
    if (['setting', 'action', 'snap', 'consequence'].includes(l.beat) && !(l.facts ?? []).length) errs.push(`/lines/${l.n} needs at least one verified fact`);
    for (const id of l.facts ?? []) if (!factMap(facts).get(id)?.verified) errs.push(`/lines/${l.n} cites ${id}, which is missing or unverified`);
    errs.push(...deliveryErrors(l));
    const chars = new Set(data.characters.map((c) => c.id));
    errs.push(...lookErrors(l, catalog, chars));
  }
  if (project.language === 'hi') errs.push(...hindiCraftErrors(data, project, facts));
  const listed = new Set(data.names.map((n) => normalizeWord(n.word)));
  if (project.language === 'hi') {
    const chars = new Set(data.characters.map((c) => normalizeWord(c.name)));
    for (const n of data.names) if (!chars.has(normalizeWord(n.word))) errs.push(`/names "${n.word}" is not a declared character name`);
  } else {
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
  const isHi = project.language === 'hi';
  const rate = project.voice?.rate?.wordsPerSecond ?? WPS;
  const target = project.seconds * rate;
  const wordsTarget = Math.round(target);
  const wordsLo = Math.ceil(target * 0.93), wordsHi = Math.floor(target * 1.07);
  const lineTarget = isHi ? hindiLineTarget(project.seconds) : 17;
  const lineLo = isHi ? Math.max(1, Math.floor(lineTarget * 0.8)) : 17;
  const lineHi = isHi ? Math.ceil(lineTarget * 1.2) : 17;
  const beatPlan = isHi ? hindiBeatPlan(lineTarget, verified.length) : null;
  const wordBudget = isHi ? hindiWordBudget(lineTarget, wordsTarget) : null;
  const factSlots = isHi ? (() => {
    let f = 0;
    return beatPlan.map((b, i) => (['action', 'snap', 'consequence'].includes(b) ? `${i}:${verified[f++ % verified.length].id}` : null)).filter(Boolean);
  })() : [];
  const instruction = isHi
    ? `Use exactly ${lineTarget} lines (${lineLo}-${lineHi} allowed) and about ${wordsTarget} words; hard range ${wordsLo}-${wordsHi}; about ${(target / lineTarget).toFixed(1)} words per line. Count words before returning; never exceed ${wordsHi}. Beat order, one beat per line: ${beatPlan.join(', ')}. Every line needs gloss, delivery and structured look (set, optional mark, declared who, optional pose/expr/prop).`
    : `Use exactly 17 lines: hook 12-15 words, lines 1-15 19-21 words each, twist 18-21 words.`;
  const repairHint = isHi
    ? `Keep about ${lineTarget} lines (${lineLo}-${lineHi}) and ${wordsLo}-${wordsHi} words. Every line needs a gloss, delivery and catalog look; the hook, both deadpan lines, the single explain line and the twist need a pause or emphasis. Every pause/emphasis word must exist in its line.`
    : 'Return exactly 17 lines with beats 0 hook, 1 setting, 2 setting, 3 action, 4 action, 5 action, 6 action, 7 snap, 8 deadpan, 9 deadpan, 10 explain, 11 explain, 12 explain, 13 consequence, 14 consequence, 15 consequence, 16 twist. Lines 1-15 must each be 19-21 words, the hook 12-15, the twist 18-21. Count words by splitting on spaces. If the total is too low, add words to lines 1-15 until each is 19-21 words; if a line is too long, shorten only that line.';
  const { data, usage } = await router.callJson('script', [
    { role: 'system', content: isHi ? SCRIPT_HI : SCRIPT },
    { role: 'user', content: `STABLE CATALOG (sets, marks, poses, expressions and props are the only stageable ones):\n${card}\n\nDATA:\n<brief>\n${brief}\n</brief>\n<verified_facts>\n${verified.map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nTarget: ${project.seconds} seconds at ${rate} words/second = about ${wordsTarget} words (valid ${wordsLo}-${wordsHi}). ${instruction} Return json only.` },
  ], { validate: (d) => validateScript(d, { project, facts, catalog, sourceTexts }), repairHint });
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
  return { usage, changed };
}
