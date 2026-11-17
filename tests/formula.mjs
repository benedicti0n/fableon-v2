// Reference script formula: valid shape, deterministic checks and legacy beat mapping (no provider calls).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { formulaBeat, formulaErrors, formulaPivots, validateScript } from '../cli/src/stages/script.js';

const facts = { facts: [{ id: 'F1', verified: true }] };
const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
const texts = [
  'A queen married a man with one year left to live.',
  'Her father chose a rich prince, but she chose the doomed forest man instead.',
  'The wedding drums stopped when the sage counted the days on his fingers.',
  '"He will die in a year," the sage said, and the court laughed at the bride.',
  'She packed a small bag, a sharp question, and a promise to argue with death.',
  'Every evening she practiced her case while the forest hummed around her.',
  'But what can a mortal offer the god who owns every ending?',
  'You see, death must honor a promise, even when the promise traps him.',
  'A promise is a door that only opens from the side you pushed.',
  'So the queen did not defeat death; she made death keep his word.',
];
const beats = ['hook', 'setting', 'setting', 'escalation', 'escalation', 'escalation', 'mystery', 'pivot', 'analogy', 'payoff'];
const setFor = (n) => (n < 2 ? 'palace' : n < 6 ? 'hermitage' : n < 8 ? 'palace' : 'hermitage');

function makeScript() {
  return {
    version: 1, title: 'The Queen and the Promise', seconds: 36, wps: 3.75,
    characters: [{ id: 'queen', name: 'The Queen', role: 'the bride who argues with death', look: 'red sari' }],
    names: [],
    hookAdvisory: { paradoxAsFact: true, note: 'A wedding with a one-year deadline is stated as plain fact.' },
    lines: texts.map((text, n) => ({
      n, text, beat: beats[n], facts: n === 0 || n === 6 || n === 9 ? [] : ['F1'],
      look: { set: setFor(n), who: ['queen'], pose: n === 6 ? 'think' : 'stand', note: 'The queen stands in the scene and speaks to the court.' },
    })),
  };
}
const projectFor = (script) => ({ seconds: script.lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0) / 3.75, language: 'en', voice: { rate: { wordsPerSecond: 3.75 } } });
const check = (data) => validateScript(data, { project: projectFor(data), facts, catalog, sourceTexts: [] });

export function runFormulaTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const valid = makeScript();
  const baseErrs = check(valid);
  ok('valid formula script', baseErrs.length === 0, baseErrs.join('; '));
  ok('formula errors empty', formulaErrors(valid, projectFor(valid)).length === 0, formulaErrors(valid, projectFor(valid)).join('; '));
  ok('legacy beat map', formulaBeat('action') === 'escalation' && formulaBeat('explain') === 'analogy' && formulaBeat('twist') === 'payoff' && formulaBeat('deadpan') === 'escalation', 'formulaBeat');
  ok('pivot defaults', formulaPivots({ language: 'hi' }).includes('दरअसल,') && formulaPivots({ language: 'en' })[0] === 'You see,', JSON.stringify(formulaPivots({ language: 'en' })));
  ok('pivot configurable', formulaPivots({ language: 'en', script: { pivots: { en: ['Listen,'] } } })[0] === 'Listen,', 'project pivot');

  const longHook = makeScript(); longHook.lines[0].text = 'A queen married a man with one year left to live and the whole kingdom watched the wedding.';
  ok('hook length', check(longHook).some((e) => /hook is longer than 16 words/.test(e)), check(longHook).join('; '));
  const setup = makeScript(); setup.lines[0].text = 'Once upon a time, a queen married a man with one year left to live.';
  ok('hook setup clause', check(setup).some((e) => /starts with setup/.test(e)), check(setup).join('; '));
  const noAdvisory = makeScript(); delete noAdvisory.hookAdvisory;
  ok('hook advisory required', check(noAdvisory).some((e) => /hookAdvisory/.test(e)), check(noAdvisory).join('; '));
  const setting = makeScript(); setting.lines[6].beat = 'setting';
  ok('setting count', check(setting).some((e) => /setting lines; use 1-2/.test(e)), check(setting).join('; '));
  const escalation = makeScript(); escalation.lines[5].beat = 'analogy';
  ok('escalation count', check(escalation).some((e) => /escalation lines; use 3-6/.test(e)), check(escalation).join('; '));
  const noDialogue = makeScript(); noDialogue.lines[3].text = 'The sage said that the bridegroom would die within a single year.';
  ok('short quoted dialogue', check(noDialogue).some((e) => /short quoted in-character dialogue/.test(e)), check(noDialogue).join('; '));
  const noMystery = makeScript(); noMystery.lines[6].beat = 'escalation';
  ok('one mystery', check(noMystery).some((e) => /mystery lines; use exactly 1/.test(e)), check(noMystery).join('; '));
  const flatMystery = makeScript(); flatMystery.lines[6].text = 'She asks what a mortal can offer the god who owns every ending.';
  ok('mystery question mark', check(flatMystery).some((e) => /mystery must end with a question mark/.test(e)), check(flatMystery).join('; '));
  const badPivot = makeScript(); badPivot.lines[7].text = 'Actually, death must honor a promise, even when the promise traps him.';
  ok('pivot phrase', check(badPivot).some((e) => /pivot must start with/.test(e)), check(badPivot).join('; '));
  const badPayoff = makeScript(); badPayoff.lines[9].beat = 'escalation';
  ok('payoff last', check(badPayoff).some((e) => /last line must be payoff/.test(e)), check(badPayoff).join('; '));
  const manyPayoffs = makeScript(); manyPayoffs.lines.push({ ...manyPayoffs.lines[9], n: 10 }, { ...manyPayoffs.lines[9], n: 11 });
  ok('payoff count', check(manyPayoffs).some((e) => /payoff lines; use 1-2/.test(e)), check(manyPayoffs).join('; '));
  const shortSentences = makeScript();
  shortSentences.lines = shortSentences.lines.map((l) => ({ ...l, text: `${l.text.split(/\s+/).slice(0, 8).join(' ')}.` }));
  ok('median sentence band', check(shortSentences).some((e) => /median sentence length/.test(e)), check(shortSentences).join('; '));
  const noWho = makeScript(); delete noWho.lines[2].look.who;
  ok('literal look who', formulaErrors(noWho, projectFor(noWho)).some((e) => /look needs at least one declared character/.test(e)), formulaErrors(noWho, projectFor(noWho)).join('; '));
  const noPose = makeScript(); delete noPose.lines[2].look.pose;
  ok('literal look pose', formulaErrors(noPose, projectFor(noPose)).some((e) => /look needs a catalog pose/.test(e)), formulaErrors(noPose, projectFor(noPose)).join('; '));
  const order = makeScript(); [order.lines[6].beat, order.lines[7].beat] = [order.lines[7].beat, order.lines[6].beat];
  ok('formula order', check(order).some((e) => /out of formula order/.test(e)), check(order).join('; '));

  return { ok: errors.length === 0, errors, checks };
}
