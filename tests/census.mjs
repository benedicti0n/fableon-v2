// Census: inventory schema, deterministic matcher, coverage and build list smoke tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { validationErrors } from '../cli/src/core/artifacts.js';
import { loadCatalog, matchNeed } from '../cli/src/census.js';

export async function runCensusTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const C = loadCatalog();
  ok('catalog matcher knows the kit', matchNeed('characters', 'Karna', C).state === 'have' && matchNeed('animals', 'horse', C).state === 'have', JSON.stringify([matchNeed('characters', 'Karna', C), matchNeed('animals', 'horse', C)]));
  ok('catalog matcher marks a new place missing', matchNeed('places', 'royal assembly hall', C).state === 'missing' && matchNeed('places', 'royal assembly hall', C).target === 'sabha', JSON.stringify(matchNeed('places', 'royal assembly hall', C)));
  ok('catalog matcher builds an unknown character from Spec fields', matchNeed('characters', 'Arjuna', C).state === 'spec', JSON.stringify(matchNeed('characters', 'Arjuna', C)));
  ok('catalog matcher stands in a forest', matchNeed('places', 'Kamyaka forest', C).state === 'standIn', JSON.stringify(matchNeed('places', 'Kamyaka forest', C)));
  const inv = { version: 1, episodes: [{ id: 'mock', places: [{ name: 'palace', timeOfDay: 'day', mustShow: true }], characters: [{ name: 'Karna', kind: 'human', speaking: true, mustShow: true, traits: ['kavacha'], mustHave: ['kavacha'] }], animals: [], vehicles: [], props: [], actions: [], effects: [], crowd: 'small', sounds: [], sensitive: [{ moment: 'a death', treatment: 'off-screen' }] }] };
  ok('inventory schema accepts a mock episode', validationErrors('inventory', inv).length === 0, validationErrors('inventory', inv).join('; '));
  const bad = structuredClone(inv); bad.episodes[0].places[0].timeOfDay = 'midnight';
  ok('inventory schema rejects a bad time of day', validationErrors('inventory', bad).length > 0, validationErrors('inventory', bad).join('; '));
  const episodes = JSON.parse(readFileSync(join(ROOT, 'docs', 'catalog', 'episodes.json'), 'utf8')).episodes;
  ok('the episode list has the starting census', episodes.length >= 60, String(episodes.length));
  const census = JSON.parse(readFileSync(join(ROOT, 'docs', 'catalog', 'census.json'), 'utf8'));
  ok('the census covers every episode', census.rows.length === episodes.length, `${census.rows.length} vs ${episodes.length}`);
  ok('the census finds stageable episodes', census.rows.some((r) => r.stageable), String(census.rows.filter((r) => r.stageable).length));
  ok('the census proposes a set build list', census.build.some((b) => b.key === 'places:sabha') && !census.build.some((b) => b.key === 'places:kurukshetra'), JSON.stringify(census.build.slice(0, 8)));
  return { ok: errors.length === 0, errors, checks };
}
