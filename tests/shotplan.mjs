// Shot-plan deterministic checks (offline): coverage, timing, catalog, first-key landmarks, jump cuts and look.who.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { planTime, shotplanErrors } from '../cli/src/stages/shotplan.js';

export function runShotplanTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const script = { lines: [0, 1, 2].map((n) => ({ n, text: `line ${n}`, gloss: `gloss ${n}`, look: { who: ['a'] } })) };
  const words = [
    { w: 'one', a: 0, b: 2.5, line: 0 },
    { w: 'two', a: 3, b: 5.5, line: 1 },
    { w: 'three', a: 6, b: 8.5, line: 2 },
  ];
  const cast = { characters: [{ id: 'a', name: 'A' }] };
  const assets = { version: 1, assets: [{ object: 'noose', lines: [1], standIn: 'net', priority: 'high', note: '' }] };
  const shot = (id, lines, start, size, extra = {}) => ({
    id, lines, start, set: 'hermitage', light: 'day', characters: ['a'], mustShow: [], action: `action ${id}`,
    keys: [{ at: start, size, on: ['a'], angle: 'eye', side: 'front', move: 'push', note: 'beat' }], ...extra,
  });
  const base = { version: 1, shots: [
    shot('S1', [0], '0:0', 'wide', { mustShow: ['hermitage.clearing'] }),
    shot('S2', [1], '1:0', 'medium', { beats: [{ who: 'a', at: '1:0+0.5s', pose: 'stand', expr: 'neutral' }], fx: [{ kind: 'sparkle', at: '1:0+0.5s', note: 'beat' }], standIns: [{ asset: 'noose', standIn: 'net' }] }),
    shot('S3', [2], '2:0', 'close'),
  ] };
  const check = (p) => shotplanErrors(p, { script, words, cast, catalog, assets: assets.assets });
  ok('shot plan valid', check(base).length === 0, check(base).join('; '));
  ok('plan time n:k', planTime('1:0', words) === 3 && planTime('2:0+0.5s', words) === 6.5, `${planTime('1:0', words)} ${planTime('2:0+0.5s', words)}`);
  let badAnchor = ''; try { planTime('9:0', words); } catch (e) { badAnchor = e.message; }
  ok('plan time rejects missing word', /no word/.test(badAnchor), badAnchor);

  const missing = structuredClone(base); missing.shots[1].lines = [];
  ok('coverage contiguous', check(missing).some((e) => /missing line|cover|lines/.test(e)), check(missing).join('; '));
  const starts = structuredClone(base); starts.shots[1].start = '0:1';
  ok('starts increase', check(starts).some((e) => /after shot/.test(e)), check(starts).join('; '));
  const short = structuredClone(base); short.shots[1].start = '0:1';
  ok('shot length floor', check(short).some((e) => /shorter than 1.2|after shot/.test(e)), check(short).join('; '));
  const first = structuredClone(base); first.shots[0].keys[0].size = 'medium'; first.shots[0].mustShow = [];
  ok('first key landmark', check(first).some((e) => /wide\/establishing|landmark/.test(e)), check(first).join('; '));
  const cat = structuredClone(base); cat.shots[1].beats[0].pose = 'dance'; cat.shots[1].fx[0].kind = 'laser'; cat.shots[1].characters = ['ghost'];
  const catErrs = check(cat).join('; ');
  ok('catalog enums', /not in cast|pose|fx/.test(catErrs), catErrs);
  const jump = structuredClone(base); jump.shots[1].keys[0].size = 'wide'; jump.shots[1].keys[0].side = 'front';
  ok('plan jump cut', check(jump).some((e) => /jump cut/.test(e)), check(jump).join('; '));
  const light = structuredClone(base); light.shots[1].light = 'night';
  ok('light consistency', check(light).some((e) => /light changes/.test(e)), check(light).join('; '));
  const who = structuredClone(base); script.lines[1].look.who = ['b'];
  ok('look.who needs inclusion', check(base).some((e) => /look.who "b"/.test(e)), check(base).join('; '));
  const why = structuredClone(base); why.shots[1].why = 'a is off-screen on purpose';
  ok('why allows missing look.who', !check(why).some((e) => /look.who "b"/.test(e)), check(why).join('; '));
  script.lines[1].look.who = ['a'];
  const keyShort = structuredClone(base); keyShort.shots[1].keys.push({ at: '1:0+0.2s', size: 'close', on: ['a'], angle: 'eye', side: 'front', move: 'push', note: 'x' });
  ok('key length floor', check(keyShort).some((e) => /shorter than 0.6/.test(e)), check(keyShort).join('; '));
  const assetGap = structuredClone(base); assetGap.shots[1].standIns[0].standIn = 'laser';
  ok('stand-in exists', check(assetGap).some((e) => /stand-in/.test(e)), check(assetGap).join('; '));
  return { ok: errors.length === 0, errors, checks };
}
