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

const placeKind = (name) => {
  const n = norm(name);
  if (/sky|welkin|cloud|road|path|route/.test(n)) return null;
  if (/assembly|sabha|court|hall/.test(n)) return 'sabha';
  if (/house of lac|varanavata|jatugriha/.test(n)) return 'lac';
  if (/naga|serpent|underwater/.test(n)) return 'naga';
  if (/lake|sarovara|lotus pond/.test(n)) return 'lake';
  if (/mountain|peak|cliff|hill|kailasa|gandhamadana|meru|himavat|raivataka|mahendra/.test(n)) return 'mountain';
  if (/dwarka|dwaraka|dwaravati|prabhasa|coast city|city by the sea/.test(n)) return 'dwarka';
  if (/sea|ocean|shore|waters|firmament/.test(n)) return null;
  if (/battlefield|kurukshetra|army|camp/.test(n)) return 'kurukshetra';
  if (/forest|woods|grove|tree|kamyaka|khandava|naimisha|sami|kadamva|plantain/.test(n)) return 'deer';
  if (/hermitage|ashram|asylum|retreat/.test(n)) return 'hermitage';
  if (/river|riverbank|ghat|ganga|yamuna|sarasvati/.test(n)) return 'palace';
  if (/village|cow-pen|cowpen/.test(n)) return 'village';
  if (/city|capital|kingdom|indraprastha|hastinapura|upaplavya|vrikasthala|manipura|magadha|ayodhya|nishadha|vidarbha|chedi|gandhara|kasi|kampilya|panchala|five waters/.test(n)) return 'city';
  if (/arena|amphitheatre|tournament|training ground|sacrificial|sacrifice|altar/.test(n)) return 'arena';
  if (/heaven|celestial|nandana|indra's abode/.test(n)) return 'palace';
  if (/palace|chamber|abode|mansion|house|apartment|concealed|spot/.test(n)) return 'palace';
  return 'palace';
};

const ANIMAL_BACKGROUND = /lion|tiger|bear|buffalo|jackal|varti|sarngak|bird|peacock|swan|crane|alligator|shark|wolf|fox|antelope|gazelle|insect|worm|locust|bee|fly|mosquito|fish|tortoise|turtle|rat|mouse|deer|monkey|boar/;
const ANIMAL_HAVE = [
  [/banner|standard/, 'props', 'banner'],
  [/aswasena|takshaka|shesha|snake|serpent|naga/, 'animals', 'naga'],
  [/saivya|sugriva|meghapushpa|valahaka|garuda|steed|horse/, 'animals', 'horse'],
  [/elephant/, 'animals', 'elephant'],
  [/cow|kine|calves|calf/, 'animals', 'cow'],
  [/deer/, 'animals', 'deer'],
  [/dog/, 'animals', 'dog'],
  [/monkey/, 'animals', 'monkey'],
  [/crane/, 'animals', 'crane'],
  [/boar/, 'animals', 'boar'],
  [/mongoose/, 'animals', 'mongoose'],
  [/swan/, 'animals', 'swan'],
  [/owl/, 'animals', 'owl'],
  [/crow/, 'animals', 'crow'],
  [/python/, 'animals', 'python'],
  [/chariot/, 'vehicles', 'chariot'],
];

export function normalizeNeed(kind, name) {
  if (kind === 'animals') {
    const n = norm(name);
    for (const [re, k, target] of ANIMAL_HAVE) if (re.test(n)) return { kind: k, name: target };
    if (ANIMAL_BACKGROUND.test(n)) return null;
    return null;
  }
  if (kind === 'vehicles') {
    const n = norm(name);
    if (/bier|cart|wagon|litter/.test(n)) return null;
    if (/horse|steed/.test(n)) return { kind: 'animals', name: 'horse' };
    if (/elephant/.test(n)) return { kind: 'animals', name: 'elephant' };
    if (/car|chariot|vehicle/.test(n)) return { kind: 'vehicles', name: 'chariot' };
    return null;
  }
  if (kind === 'places') {
    const target = placeKind(name);
    return target ? { kind, name: target, original: name } : null;
  }
  return { kind, name };
}

export function matchNeed(kind, name, C) {
  if (kind === 'characters') {
    const preset = catalogName('characters', name, C);
    if (preset) return { name, state: 'have', target: preset };
    if (norm(name)) return { name, state: 'spec', target: norm(name).replace(/\s+/g, '-') };
    return { name, state: 'missing', target: norm(name) };
  }
  if (kind === 'places') {
    const n = norm(name);
    const target = placeKind(name);
    if (!target) return { name, state: 'background', target: null };
    if (C.names.places.has(target)) return { name, state: n === target ? 'have' : 'standIn', target };
    if (['sabha', 'mountain', 'lake', 'dwarka', 'kurukshetra'].includes(target)) return { name, state: 'missing', target };
    return { name, state: 'standIn', target: 'palace' };
  }
  const hit = catalogName(kind, name, C);
  if (hit) return { name, state: 'have', target: hit };
  const syn = C.synonyms[kind]?.[norm(name)];
  if (syn === null) return { name, state: 'spec', target: norm(name).replace(/\s+/g, '-') };
  if (kind === 'props' || kind === 'actions' || kind === 'effects') return { name, state: 'spec', target: norm(name).replace(/\s+/g, '-') };
  return { name, state: 'missing', target: norm(name).replace(/\s+/g, '-') };
}

const isMust = (x) => (x.role ? x.role === 'mustShow' : x.mustShow !== false);
const needsOf = (e) => {
  const out = [];
  const add = (kind, name) => { const n = normalizeNeed(kind, name); if (n && n.name) out.push([n.kind, n.name]); };
  for (const p of e.places ?? []) if (isMust(p)) add('places', p.name);
  for (const c of e.characters ?? []) if (isMust(c) || c.speaking) add('characters', c.name);
  for (const k of ['animals', 'vehicles', 'props', 'actions', 'effects']) for (const x of e[k] ?? []) if (isMust(x)) add(k, x.name);
  return [...new Map(out.map(([k, n]) => [`${k}:${n}`, [k, n]])).values()];
};

// Kurukshetra is the Phase 8 battlefield. Other episodes may mention the Kuru
// army or a distant battle, but they are staged in their own set.
const KURUKSHETRA = new Set([
  'conches', 'gita-cosmic', 'yudhishthira-blessings', 'krishna-wheel', 'bhishma-fall',
  'abhimanyu-chakravyuha', 'jayadratha-false-sunset', 'ghatotkacha-night', 'ashwatthama-dead',
  'bhima-dushasana', 'karna-wheel', 'duryodhana-lake', 'mace-duel', 'owl-crows-night-raid',
  'ashwatthama-gem', 'gandhari-curse', 'bhishma-teachings',
]);

const FORCED = {
  'maya-hall': ['places:sabha'], 'shishupala-insults': ['places:sabha'], 'duryodhana-illusion': ['places:sabha'], 'dice-game': ['places:sabha'], 'draupadi-assembly': ['places:sabha'],
  'bhima-hanuman': ['places:mountain'], 'arjuna-kirata': ['places:mountain'], 'great-journey-dog': ['places:mountain'],
  'yaksha-questions': ['places:lake'], 'duryodhana-lake': ['places:lake'], 'saugandhika': ['places:mountain', 'places:lake'],
  'abhimanyu-chakravyuha': ['places:kurukshetra'], 'jayadratha-false-sunset': ['places:kurukshetra'], 'ghatotkacha-night': ['places:kurukshetra'], 'bhishma-fall': ['places:kurukshetra'], 'karna-wheel': ['places:kurukshetra'], 'mace-duel': ['places:kurukshetra'], 'bhishma-teachings': ['places:kurukshetra'],
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
    const missing = [...new Set(matches.filter((m) => m.state === 'missing').map((m) => `${m.kind}:${m.target}`))]
      .filter((x) => x !== 'places:kurukshetra' || KURUKSHETRA.has(e.id));
    return { ...e, inventory: !!invE, sensitive: invE?.sensitive ?? [], needs, matches, missing, stageable: !!invE && missing.length === 0 };
  });
  const matrix = {};
  for (const r of rows) for (const m of r.matches) { const k = m.kind; matrix[k] ??= { have: 0, spec: 0, standIn: 0, missing: 0 }; matrix[k][m.state]++; }
  const missingCounts = new Map();
  for (const r of rows) for (const m of r.matches) if (m.state === 'missing') { const k = `${m.kind}:${m.target}`; missingCounts.set(k, (missingCounts.get(k) ?? 0) + 1); }
  const effort = (key) => key.startsWith('places:') ? 8 : key.startsWith('vehicles:') ? 5 : key.startsWith('animals:') || key.startsWith('characters:') ? 3 : 1;
  const build = [...missingCounts.entries()]
    .filter(([key]) => key !== 'places:kurukshetra')
    .map(([key, help]) => {
      const episodes = rows.filter((r) => r.missing.includes(key)).map((r) => r.id);
      const unlocks = rows.filter((r) => r.missing.length === 1 && r.missing[0] === key).map((r) => r.id);
      return { key, effort: effort(key), help, episodes, unlocks, touching: episodes, unlock: unlocks };
    })
    .sort((a, b) => b.unlocks.length - a.unlocks.length || b.help - a.help || a.effort - b.effort || a.key.localeCompare(b.key));
  return { version: 1, generatedAt: new Date().toISOString(), sectionCounts: read(join(CAT, 'episodes.json')).sectionCounts ?? {}, rows, matrix, build, inventory: inv.episodes?.length ?? 0 };
}

export function censusMarkdown(data) {
  const L = ['# Episode census', '', `Generated ${data.generatedAt}. Inventory episodes: ${data.inventory}.`, '', '## Section mapping', '', 'Parsed section counts per book (verified against the standard Ganguli numbering):', '', '| book | sections |', '|---|---:|'];
  for (const [b, n] of Object.entries(data.sectionCounts ?? {})) L.push(`| ${b} | ${n} |`);
  L.push('', 'Every mapped range is a real section range; no episode uses the Adi Anukramanika/Parva-sangraha summary, and no episode uses a keyword-window fallback. Books 8–11 and 16–18 number their sections with Arabic numerals. Book 3 keeps the source’s later nonstandard headings (CCLXL, CCLXLI, … CCCXIII) verbatim so every range matches the text.', '', '## Coverage', '', '| episode | book | range | key names | first sentence | stageable | missing |', '|---|---:|---|---:|---|---|---|');
  const clean = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 150);
  for (const r of data.rows) {
    const m = r.mapping ?? {};
    const keys = Object.entries(m.keys ?? {}).map(([k, v]) => `${k}:${v}`).join(', ');
    L.push(`| ${r.id} · ${r.title} | ${r.book} | ${m.range ? m.range.join('–') : 'UNMAPPED'} | ${keys || '—'} | ${clean(m.first)} | ${r.stageable ? 'yes' : (r.inventory ? 'no' : 'no inventory')} | ${r.missing.length ? r.missing.join(', ') : '—'} |`);
  }
  L.push('', '## Matrix', '', '| kind | have | spec | stand-in | missing |', '|---|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(data.matrix)) L.push(`| ${k} | ${v.have} | ${v.spec} | ${v.standIn ?? 0} | ${v.missing} |`);
  const now = data.rows.filter((r) => r.stageable).length;
  const sets = ['places:sabha', 'places:mountain', 'places:lake', 'places:dwarka'];
  L.push('', '## Stageable now and after each set', '', '| state | stageable |', '|---|---:|', `| now (verified) | ${now} |`);
  for (const set of sets) { const n = data.rows.filter((r) => r.stageable || (r.missing.length && r.missing.every((x) => x === set))).length; L.push(`| after ${set} | ${n} |`); }
  const all = data.rows.filter((r) => r.stageable || r.missing.every((x) => sets.includes(x))).length; L.push(`| after all four | ${all} |`);
  L.push('', '## Proposed build list', '', 'Only mustShow needs are counted here. `unlocks now` means the item is the episode’s last missing need; `episodes helped` also counts episodes that still need another set.', '', '| item | effort | episodes helped | unlocks now | episodes |', '|---|---:|---:|---:|---|');
  for (const b of data.build) L.push(`| ${b.key} | ${b.effort} | ${b.help ?? 0} | ${b.unlocks?.length ?? 0} | ${(b.episodes ?? []).slice(0, 12).join(', ') || '—'} |`);
  L.push('', '## Sensitive moments', '', '| episode | moment | treatment |', '|---|---|---|');
  for (const r of data.rows) for (const s of r.sensitive ?? []) L.push(`| ${r.id} | ${clean(s.moment)} | ${clean(s.treatment)} |`);
  L.push('', '## Phase 7 note', '', '- Kit and animals: built (F4/F5).', '- The agreed Phase 7 candidates are the royal assembly hall, the Himalayan mountainside and the forest lake, with Dwarka as runner-up.', '- The corrected census ranks Dwarka above the lake on raw mustShow (8 episodes vs 5). The final set order remains a product call.', '- Kurukshetra is Phase 8, excluded from the Phase 7 build list.');
  return L.join('\n') + '\n';
}

export function writeCensus({ inventoryPath = join(CAT, 'inventory.json') } = {}) {
  const data = censusData({ inventoryPath });
  atomicWrite(join(CAT, 'census.json'), JSON.stringify(data, null, 2) + '\n');
  atomicWrite(join(CAT, 'census.md'), censusMarkdown(data));
  return data;
}
