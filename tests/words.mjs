// Shared Unicode word normaliser + ASCII anchor regression + new anchor forms.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { countWords, normalizedText, normalizeWord } from '../shared/words.mjs';
import { compileBoard, parseAnchor } from '../cli/src/authoring.js';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function runWordTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };

  ok('unicode letters kept', normalizeWord('यम।') === 'यम', normalizeWord('यम।'));
  ok('combining marks kept', normalizeWord('हिन्दी') === 'हिन्दी', normalizeWord('हिन्दी'));
  ok('danda stripped', normalizeWord('गया॥') === 'गया', normalizeWord('गया॥'));
  ok('curly apostrophe', normalizeWord('“Yama’s”') === "yama's", normalizeWord('“Yama’s”'));
  ok('ascii unchanged', normalizeWord('Hello, world!') === 'helloworld', normalizeWord('Hello, world!'));
  ok('word count after normalisation', countWords('यम आया। फिर गया ॥') === 4, String(countWords('यम आया। फिर गया ॥')));
  ok('normalised text', normalizedText("Don't stop!") === "don't stop", normalizedText("Don't stop!"));

  const anchors = [
    ['12.यम', { line: 12, word: 'यम', offset: -2 }],
    ['12.यम#1+0.3s', { line: 12, word: 'यम', nth: 1, offset: 9 }],
    ['12:4', { line: 12, wordIndex: 4, offset: -2 }],
    ['12:4+0.5s', { line: 12, wordIndex: 4, offset: 15 }],
  ];
  for (const [s, want] of anchors) {
    try { ok(`anchor ${s}`, eq(parseAnchor(s, 30), want), JSON.stringify(parseAnchor(s, 30))); }
    catch (e) { ok(`anchor ${s}`, false, e.message); }
  }

  // Every anchor already compiled into the Adi fixture must resolve to the same frame as the old ASCII normaliser.
  const storyboard = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'storyboard.json'), 'utf8'));
  const words = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'words.json'), 'utf8'));
  const oldNorm = (s) => String(s).toLowerCase().replace(/[^a-z']/g, '');
  const fps = storyboard.fps ?? 30;
  const found = [];
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if ('line' in x && 'word' in x) found.push(x);
    for (const v of Object.values(x)) walk(v);
  };
  walk(storyboard);
  let same = 0, bad = [];
  for (const a of found) {
    const hitsOld = words.filter((w) => w.line === a.line && oldNorm(w.w) === oldNorm(a.word));
    const hitsNew = words.filter((w) => w.line === a.line && normalizeWord(w.w) === normalizeWord(a.word));
    const frameOld = hitsOld[a.nth ?? 0] ? Math.max(0, Math.round(hitsOld[a.nth ?? 0].a * fps)) + (a.offset ?? 0) : null;
    const frameNew = hitsNew[a.nth ?? 0] ? Math.max(0, Math.round(hitsNew[a.nth ?? 0].a * fps)) + (a.offset ?? 0) : null;
    if (frameOld !== null && frameOld === frameNew) same++;
    else bad.push(`${a.line}:${a.word}`);
  }
  ok('adi anchors unchanged', found.length > 0 && bad.length === 0, `${same}/${found.length}, bad: ${bad.slice(0, 5).join(', ')}`);

  // The new word-index form compiles in a board (dev/compile path).
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const synthetic = Array.from({ length: 6 }, (_, i) => ({ w: `w${i}`, a: i, b: i + 0.8, line: 12 }));
  let compiled = null, err = '';
  try {
    compiled = compileBoard({ version: 1, shots: [{ id: 'W', start: '12:4', light: 'day', sets: ['village'] }] }, synthetic, catalog);
  } catch (e) { err = e.message; }
  ok('word-index compiles', !!compiled && compiled.storyboard.shots[0].start.wordIndex === 4, err || JSON.stringify(compiled?.storyboard.shots[0].start));

  return { ok: errors.length === 0, errors, checks };
}
