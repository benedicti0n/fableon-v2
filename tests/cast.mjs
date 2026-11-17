// Cast design checks: trait mapping, visual distinctness, asset gaps (offline).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { assetGaps, castErrors, deltaE } from '../cli/src/stages/cast.js';

export function runCastTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const script = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'savitri-hi', 'script.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const base = { version: 1, characters: [
    { id: 'savitri', name: 'सावित्री', spec: { skin: '#a8693f', build: 'slim', top: '#e0565a', sari: '#2f8a8a', border: '#f2c230', head: 'long', hairCol: '#1e1418', flower: '#fff2c8', earrings: '#e8b53a' }, scale: 1, mustHave: ['woman', 'sari', 'long-hair'], notes: 'Princess in a teal sari.' },
    { id: 'satyavan', name: 'सत्यवान', spec: { skin: '#d9a066', build: 'adult', top: null, lower: '#7a5a3a', head: 'hair', hairCol: '#2a1a1e' }, scale: 1, mustHave: ['young-man', 'forest-clothes'], notes: 'Young woodcutter in simple brown clothes.' },
    { id: 'yama', name: 'यम', spec: { skin: '#2f1f2a', build: 'big', top: null, lower: '#1c1418', drape: '#c8342e', head: 'crownSmall', crownCol: '#e8b53a', necklace: '#e8b53a' }, scale: 1, mustHave: ['dark-skin', 'red-attire', 'crown'], notes: 'Death god, dark skin, red robe, diadem.' },
    { id: 'narada', name: 'नारद', spec: { skin: '#c98c5c', build: 'elder', top: null, lower: '#e8a33a', drape: '#6a4fb5', head: 'topknot', hairCol: '#6a6a72', beard: '#8a8a92', beardLong: true }, scale: 1, mustHave: ['sage', 'topknot', 'beard'], notes: 'Wandering sage with a topknot and beard.' },
  ] };
  ok('cast draft passes', castErrors(base, script, catalog).length === 0, castErrors(base, script, catalog).join('; '));

  const missing = structuredClone(base); missing.characters.pop();
  ok('mentions are required', castErrors(missing, script, catalog).some((e) => /missing narada/.test(e)), castErrors(missing, script, catalog).join('; '));

  const trait = structuredClone(base); trait.characters[2].mustHave.push('red-eyes');
  ok('unmapped trait rejected', castErrors(trait, script, catalog).some((e) => /red-eyes/.test(e)), castErrors(trait, script, catalog).join('; '));

  const traitValue = structuredClone(base); traitValue.characters[2].spec.skin = '#e7b07e';
  ok('trait value enforced', castErrors(traitValue, script, catalog).some((e) => /dark-skin/.test(e)), castErrors(traitValue, script, catalog).join('; '));

  const lookalike = structuredClone(base); lookalike.characters[1].spec = { ...lookalike.characters[0].spec };
  const lookErrs = castErrors(lookalike, script, catalog).join('; ');
  ok('main characters distinct', /skin DeltaE|garment DeltaE|all share/.test(lookErrs), lookErrs);

  const gaps = assetGaps(script, catalog);
  ok('noose asset gap', gaps.some((g) => g.object === 'noose' && g.standIn === 'net' && g.lines.includes(8) && g.lines.includes(19)), JSON.stringify(gaps));

  ok('deltaE separates colours', deltaE('#000000', '#ffffff') > 90 && deltaE('#a8693f', '#a8693f') === 0, JSON.stringify([deltaE('#000000', '#ffffff'), deltaE('#a8693f', '#a8693f')]));
  return { ok: errors.length === 0, errors, checks };
}
