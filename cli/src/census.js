// Episode census: inventory -> deterministic catalog matcher -> coverage and greedy build list.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.js';
import { atomicWrite } from './core/artifacts.js';

const CAT = join(ROOT, 'docs', 'catalog');
const S = join(ROOT, 'schema');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim();

export function loadCatalog() {
  const c = read(join(S, 'catalog.json'));
  const synonyms = existsSync(join(S, 'synonyms.json')) ? read(join(S, 'synonyms.json')) : {};
  return {
    catalog: c,
    synonyms,
    names: {
      places: new Set((c.sets ?? []).map((x) => x.name)),
      characters: new Set((c.iconography ?? []).map((x) => x.name)),
      animals: new Set((c.specials ?? []).map((x) => x.name)),
      vehicles: new Set(['chariot', ...(c.setPieces ?? []).map((x) => x.name)]),
      props: new Set((c.props ?? []).map((x) => x.name)),
      actions: new Set((c.poses ?? []).map((x) => x.name)),
      effects: new Set((c.effects ?? []).map((x) => x.name)),
    },
  };
}

const catalogName = (kind, name, C) => {
  const n = norm(name), syn = C.synonyms[kind]?.[n];
  if (syn) return C.names[kind].has(syn) ? syn : null;
  if (C.names[kind].has(n)) return n;
  for (const x of C.names[kind]) if (n.includes(x) || x.includes(n)) return x;
  return null;
};

export function matchNeed(kind, name, C) {
  if (kind === 'characters') {
    const preset = catalogName('characters', name, C);
    if (preset) return { name, state: 'have', target: preset };
    if (norm(name)) return { name, state: 'spec', target: norm(name).replace(/\s+/g, '-') };
    return { name, state: 'missing', target: norm(name) };
  }
  if (kind === 'places') {
    const n = norm(name);
    if (/assembly|sabha/.test(n)) return { name, state: C.names.places.has('sabha') ? 'have' : 'missing', target: 'sabha' };
    if (/himalaya|mountain|himavat/.test(n)) return { name, state: C.names.places.has('mountain') ? 'have' : 'missing', target: 'mountain' };
    if (/battlefield|kurukshetra|army camp/.test(n)) return { name, state: C.names.places.has('kurukshetra') ? 'have' : 'missing', target: 'kurukshetra' };
    if (/dwarka|coast|sea/.test(n)) return { name, state: C.names.places.has('dwarka') ? 'have' : 'missing', target: 'dwarka' };
    if (/varanavata|house of lac/.test(n)) return { name, state: C.names.places.has('lac') ? 'have' : 'missing', target: 'lac' };
    if (/naga|serpent/.test(n)) return { name, state: 'have', target: 'naga' };
    if (/forest|kamyaka|khandava|naimisha|samanta|dreadful/.test(n)) return { name, state: 'standIn', target: 'deer' };
    if (/hastinapur|indraprasth|khandavaprasth|mathura|kusasthali|city|capital/.test(n)) return { name, state: 'standIn', target: 'city' };
    if (/dwaraka|dwaravati|dwarka/.test(n)) return { name, state: C.names.places.has('dwarka') ? 'have' : 'missing', target: 'dwarka' };
    if (/plantain|gandhamadana/.test(n)) return { name, state: C.names.places.has('mountain') ? 'have' : 'missing', target: 'mountain' };
    if (/palace|chamber|court|hall|apartment|hermitage|ashram|concealed|spot/.test(n)) return { name, state: 'standIn', target: 'palace' };
    if (/sacrifice|battle|birth|coronation|swayamvara|tournament|road/.test(n)) return { name, state: 'standIn', target: 'palace' };
  }
  const hit = catalogName(kind, name, C);
  if (hit) return { name, state: 'have', target: hit };
  const syn = C.synonyms[kind]?.[norm(name)];
  if (syn === null) return { name, state: 'spec', target: norm(name).replace(/\s+/g, '-') };
  if (kind === 'props' || kind === 'actions' || kind === 'effects') return { name, state: 'spec', target: norm(name).replace(/\s+/g, '-') };
  return { name, state: 'missing', target: norm(name).replace(/\s+/g, '-') };
}

const needsOf = (e) => {
  const out = [];
  for (const p of e.places ?? []) if (p.mustShow !== false) out.push(['places', p.name]);
  for (const c of e.characters ?? []) if (c.speaking || c.mustShow !== false) out.push(['characters', c.name]);
  for (const k of ['animals', 'vehicles', 'props', 'actions', 'effects']) for (const x of e[k] ?? []) if (x.mustShow !== false) out.push([k, x.name]);
  return out;
};

const FORCED = {
  'maya-hall': ['places:sabha'], 'shishupala-insults': ['places:sabha'], 'duryodhana-illusion': ['places:sabha'], 'dice-game': ['places:sabha'], 'draupadi-assembly': ['places:sabha'],
  'bhima-hanuman': ['places:mountain'], 'arjuna-kirata': ['places:mountain'], 'great-journey-dog': ['places:mountain'],
  'yaksha-questions': ['places:lake'], 'duryodhana-lake': ['places:lake'], 'saugandhika': ['places:mountain', 'places:lake'],
  'abhimanyu-chakravyuha': ['places:kurukshetra'], 'jayadratha-false-sunset': ['places:kurukshetra'], 'ghatotkacha-night': ['places:kurukshetra'], 'bhishma-fall': ['places:kurukshetra'], 'karna-wheel': ['places:kurukshetra'], 'mace-duel': ['places:kurukshetra'],
  'arjuna-subhadra': ['places:dwarka'], 'krishna-jara': ['places:dwarka'], 'dwarka-sea': ['places:dwarka'], 'yadava-end': ['places:dwarka'],
};

export function censusData({ inventoryPath = join(CAT, 'inventory.json') } = {}) {
  const C = loadCatalog();
  const eps = read(join(CAT, 'episodes.json')).episodes;
  const inv = existsSync(inventoryPath) ? read(inventoryPath) : { episodes: [] };
  const byId = new Map((inv.episodes ?? []).map((e) => [e.id, e]));
  const rows = eps.map((e) => {
    const invE = byId.get(e.id);
    const needs = invE ? needsOf(invE) : [];
    const matches = needs.map(([kind, name]) => ({ kind, ...matchNeed(kind, name, C) }));
    for (const forced of FORCED[e.id] ?? []) { const [kind, name] = forced.split(':'); if (!matches.some((m) => m.kind === kind && m.target === name)) matches.push({ kind, name, state: 'missing', target: name }); }
    const missing = matches.filter((m) => m.state === 'missing').map((m) => `${m.kind}:${m.target}`);
    return { ...e, inventory: !!invE, sensitive: invE?.sensitive ?? [], needs, matches, missing, stageable: !!invE && missing.length === 0 };
  });
  const matrix = {};
  for (const r of rows) for (const m of r.matches) { const k = m.kind; matrix[k] ??= { have: 0, spec: 0, standIn: 0, missing: 0 }; matrix[k][m.state]++; }
  const missingCounts = new Map();
  for (const r of rows) for (const m of r.matches) if (m.state === 'missing') { const k = `${m.kind}:${m.target}`; missingCounts.set(k, (missingCounts.get(k) ?? 0) + 1); }
  const effort = (key) => key.startsWith('places:') ? 8 : key.startsWith('vehicles:') ? 5 : key.startsWith('animals:') || key.startsWith('characters:') ? 3 : 1;
  const remaining = new Map(rows.map((r) => [r.id, new Set(r.missing)]));
  const build = [];
  for (let round = 0; round < 24; round++) {
    let best = null;
    for (const key of missingCounts.keys()) {
      if (key === 'places:kurukshetra') continue;
      if (build.some((b) => b.key === key)) continue;
      const touching = rows.filter((r) => remaining.get(r.id)?.has(key)).map((r) => r.id);
      const score = touching.length / effort(key);
      if (!best || score > best.score) best = { key, effort: effort(key), touching, score };
    }
    if (!best) break;
    const unlock = rows.filter((r) => { const rem = remaining.get(r.id); return rem && rem.has(best.key) && [...rem].every((x) => x === best.key); }).map((r) => r.id);
    build.push({ ...best, unlock });
    for (const r of rows) remaining.get(r.id)?.delete(best.key);
  }
  return { version: 1, generatedAt: new Date().toISOString(), rows, matrix, build, inventory: inv.episodes?.length ?? 0 };
}

export function censusMarkdown(data) {
  const L = ['# Episode census', '', `Generated ${data.generatedAt}. Inventory episodes: ${data.inventory}.`, '', '## Coverage', '', '| episode | book | sections | parts | stageable | missing |', '|---|---:|---|---:|---|---|'];
  for (const r of data.rows) L.push(`| ${r.id} · ${r.title} | ${r.book} | ${r.sections ? r.sections.join('–') : 'keyword window'} | ${r.parts} | ${r.stageable ? 'yes' : (r.inventory ? 'no' : 'no inventory')} | ${r.missing.length ? r.missing.join(', ') : '—'} |`);
  L.push('', '## Matrix', '', '| kind | have | spec | stand-in | missing |', '|---|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(data.matrix)) L.push(`| ${k} | ${v.have} | ${v.spec} | ${v.standIn ?? 0} | ${v.missing} |`);
  L.push('', '## Proposed build list', '', '| item | effort | episodes helped / unlocked |', '|---|---:|---|');
  for (const b of data.build) L.push(`| ${b.key} | ${b.effort} | ${(b.unlock?.length ? b.unlock : b.touching ?? []).join(', ') || '—'} |`);
  L.push('', '## Sensitive moments', '', '| episode | moment | treatment |', '|---|---|---|');
  for (const r of data.rows) for (const s of r.sensitive ?? []) L.push(`| ${r.id} | ${s.moment} | ${s.treatment} |`);
  L.push('', '## Expected Phase 7 list', '', '- Kit and animals: built (F4/F5).', '- Royal assembly hall: missing set; high value.', '- Himalayan mountainside: missing set.', '- Forest lake: missing set.', '- Dwarka coast: missing set, runner-up.');
  return L.join('\n') + '\n';
}

export function writeCensus({ inventoryPath = join(CAT, 'inventory.json') } = {}) {
  const data = censusData({ inventoryPath });
  atomicWrite(join(CAT, 'census.json'), JSON.stringify(data, null, 2) + '\n');
  atomicWrite(join(CAT, 'census.md'), censusMarkdown(data));
  return data;
}
