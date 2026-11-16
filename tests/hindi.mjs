// Hindi script v2 craft-rule tests (deterministic checks, no provider calls).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { deliveryErrors, normalizeHindiScript, normalizerLog, plannedPauseSeconds, validateScript } from '../cli/src/stages/script.js';
import { quoteVerified } from '../cli/src/stages/research.js';

const texts = [
  'मौत को बहस में हराया गया।',
  'सावित्री ने खुद अपना पति चुना।',
  'सत्यवान साल भर में मरने वाला था।',
  'अच्छी खबर: यम ने वरदान दिया।',
  'बुरी खबर: उसने जान नहीं माँगी।',
  'यह कूपन जैसा था, शर्तें बाद में।',
  'यम ने बेटे दिए, बाप भूल गया।',
];
const beats = ['hook', 'setting', 'action', 'deadpan', 'deadpan', 'explain', 'twist'];
const factsLine = [[], ['F1'], ['F1'], [], [], [], []];

function makeScript() {
  const deliveryFor = (text, beat) => ({
    tone: beat === 'deadpan' ? 'deadpan' : beat === 'explain' ? 'warm' : beat === 'twist' ? 'mock-serious' : 'matter-of-fact',
    pauseBefore: 0.3,
    emphasis: [text.split(/\s+/)[0].replace(/[।,]/g, '')],
  });
  const lines = texts.map((text, n) => ({
    n, text, gloss: `English gloss ${n}`, beat: beats[n], facts: factsLine[n],
    delivery: deliveryFor(text, beats[n]),
    look: { set: 'village', mark: 'village.front', who: ['savitri'], pose: 'stand', expr: 'neutral', note: 'Savitri stands at the front mark.' },
  }));
  return { version: 2, title: 'परीक्षण', seconds: 20, wps: 3.75, characters: [{ id: 'savitri', name: 'सावित्री', role: 'princess', look: 'red sari' }], names: [{ word: 'सावित्री', phonemes: null, suggested: true }], lines };
}

export function runHindiTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const project = { seconds: 20, language: 'hi', voice: { rate: { wordsPerSecond: 2.7 } } };
  const facts = { facts: [{ id: 'F1', verified: true }, { id: 'F2', verified: true }] };
  const base = makeScript();
  const errs = validateScript(base, { project, facts, catalog, sourceTexts: [] });
  ok('hindi script valid', errs.length === 0, errs.join('; '));

  const withName = structuredClone(base); withName.names.push({ word: 'नारद', phonemes: null, suggested: true });
  ok('hindi name needs mention', validateScript(withName, { project, facts, catalog, sourceTexts: [] }).some((e) => /characters or mentions/.test(e)));
  withName.mentions = [{ id: 'narada', name: 'नारद', role: 'the sage who warns' }];
  ok('hindi mention resolves name', validateScript(withName, { project, facts, catalog, sourceTexts: [] }).length === 0, validateScript(withName, { project, facts, catalog, sourceTexts: [] }).join('; '));

  const noDelivery = structuredClone(base); delete noDelivery.lines[0].delivery;
  ok('hindi delivery required', validateScript(noDelivery, { project, facts, catalog, sourceTexts: [] }).some((e) => /delivery is required/.test(e)));

  const badDeadpan = structuredClone(base); badDeadpan.lines[4].beat = 'action'; badDeadpan.lines[4].facts = ['F2'];
  ok('hindi deadpan pair', validateScript(badDeadpan, { project, facts, catalog, sourceTexts: [] }).some((e) => /deadpan/.test(e)));

  const badWord = structuredClone(base); badWord.lines[0].delivery.emphasis = ['नहीं'];
  ok('hindi delivery word', deliveryErrors(badWord.lines[0]).some((e) => /not a word/.test(e)), JSON.stringify(deliveryErrors(badWord.lines[0])));

  const badLook = structuredClone(base); badLook.lines[1].look.set = 'moon';
  ok('hindi catalog look', validateScript(badLook, { project, facts, catalog, sourceTexts: [] }).some((e) => /look\/set/.test(e)));

  const repeated = structuredClone(base);
  repeated.lines[2].facts = ['F1'];
  repeated.lines[3].beat = 'snap'; repeated.lines[3].facts = ['F1'];
  repeated.lines[4].beat = 'snap'; repeated.lines[4].facts = ['F1'];
  ok('hindi repeated facts', validateScript(repeated, { project, facts, catalog, sourceTexts: [] }).some((e) => /repeats only already-used facts/.test(e)));

  const glued = { lines: [
    { n: 0, text: 'सत्यवान जंगल में लकड़ी काटने गया', gloss: 'Satyavan went to cut wood.', beat: 'action', facts: ['F1'], look: { set: 'village', who: [], note: '' } },
    { n: 1, text: 'काम करते-करते उसके सिर में दर्द हुआ', gloss: 'While working his head hurt.', beat: 'action', facts: ['F1'], look: { set: 'village', who: [], note: '' } },
  ] };
  normalizeHindiScript(glued, catalog);
  ok('normalizer merge punctuation', glued.lines.length === 1 && glued.lines[0].text.includes('गया। काम'), JSON.stringify(glued.lines));
  ok('normalizer gloss not duplicated', glued.lines[0].gloss === 'Satyavan went to cut wood. While working his head hurt.', glued.lines[0].gloss);
  ok('normalizer logged', normalizerLog.get(glued)?.count >= 1, JSON.stringify(normalizerLog.get(glued)));
  const long = { lines: [{ n: 0, text: 'एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस। दूसरा वाक्य यहाँ है।', gloss: 'First sentence here. Second sentence here.', beat: 'action', facts: ['F1'], look: { set: 'village', who: [], note: '' } }] };
  normalizeHindiScript(long, catalog);
  ok('normalizer split gloss', long.lines.length === 2 && long.lines[0].gloss !== long.lines[1].gloss, JSON.stringify(long.lines.map((l) => l.gloss)));
  const oneGloss = { lines: [{ n: 0, text: 'एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस।', gloss: 'Only one gloss.', beat: 'action', facts: ['F1'], look: { set: 'village', who: [], note: '' } }] };
  normalizeHindiScript(oneGloss, catalog);
  ok('normalizer does not duplicate one gloss', oneGloss.lines.length === 1 && oneGloss.lines[0].gloss === 'Only one gloss.', JSON.stringify(oneGloss.lines));
  ok('pause-aware pause sum', Math.abs(plannedPauseSeconds({ lines: [{ beat: 'hook', delivery: { pauseBefore: 0.4, pauses: [{ s: 0.2 }] } }, { beat: 'setting', delivery: {} }] }) - 0.86) < 1e-9, 'pause sum');
  ok('quote unique 25 chars', quoteVerified('Twice I shall not select.', 'He said, Twice I shall not select. Then he left.'));
  ok('quote 12 chars twice fails', !quoteVerified('Twice I shall', 'Twice I shall, twice I shall not.'));

  return { ok: errors.length === 0, errors, checks };
}
