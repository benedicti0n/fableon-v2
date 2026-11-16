// Hindi script v2 craft-rule tests (deterministic checks, no provider calls).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { deliveryErrors, validateScript } from '../cli/src/stages/script.js';

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
  const project = { seconds: 20, language: 'hi', voice: { rate: { wordsPerSecond: 2.2 } } };
  const facts = { facts: [{ id: 'F1', verified: true }, { id: 'F2', verified: true }] };
  const base = makeScript();
  const errs = validateScript(base, { project, facts, catalog, sourceTexts: [] });
  ok('hindi script valid', errs.length === 0, errs.join('; '));

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

  return { ok: errors.length === 0, errors, checks };
}
