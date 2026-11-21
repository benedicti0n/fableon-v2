// Catalog-level episode inventory: read the Ganguli library, estimate, then run the routed model op.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.js';
import { ModelRouter } from './models/router.js';
import { modelForStage } from './core/model-config.js';
import { validationErrors, atomicWrite } from './core/artifacts.js';
import { INVENTORY } from './stages/prompts.js';

const LIB = join(ROOT, 'library', 'ganguli');
const CAT = join(ROOT, 'docs', 'catalog');
const WORK = join(ROOT, 'library', '.inventory');
const BOOKS = Array.from({ length: 18 }, (_, i) => i + 1);
const ROMAN = /^[IVXLCDM]+$/;

const sections = (book) => {
  const p = join(LIB, String(book).padStart(2, '0') + '.txt');
  if (!existsSync(p)) return { text: '', rows: [] };
  const text = readFileSync(p, 'utf8');
  const parts = text.split(/\nSECTION ([IVXLCDM]+)\n/);
  if (parts.length > 1) return { text, rows: parts.slice(1).filter((_, i) => i % 2 === 0).map((label, i) => ({ label, text: parts[i * 2 + 2] ?? '' })) };
  const rows = []; let cur = null, buf = [];
  for (const line of text.split('\n')) {
    if (/^\d+$/.test(line.trim())) { if (cur) rows.push({ label: cur, text: buf.join('\n') }); cur = line.trim(); buf = []; }
    else if (cur) buf.push(line);
  }
  if (cur) rows.push({ label: cur, text: buf.join('\n') });
  return { text, rows };
};

export function episodeText(ep) {
  const { text, rows } = sections(ep.book);
  if (!text) return '';
  const range = ep.sections;
  if (range?.[0] && range?.[1]) {
    const a = rows.findIndex((r) => r.label === String(range[0])), b = rows.findIndex((r) => r.label === String(range[1]));
    if (a >= 0 && b >= a) return rows.slice(a, b + 1).map((r) => r.text).join('\n');
  }
  return '';
}

const trim = (s, n = 90000) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function episodesToRun(ids = null) {
  const data = JSON.parse(readFileSync(join(CAT, 'episodes.json'), 'utf8'));
  const list = ids?.length ? data.episodes.filter((e) => ids.includes(e.id)) : data.episodes;
  return { data, list };
}

export function estimateInventory(ids = null) {
  const { list } = episodesToRun(ids);
  const project = {};
  const cfg = modelForStage(project, 'inventory');
  const price = cfg.prices ?? { input: 0.3, output: 1.2 };
  const rows = list.map((e) => {
    const text = trim(episodeText(e));
    const input = Math.max(1, Math.ceil(text.length / 4) + 900);
    const output = 1800;
    return { id: e.id, title: e.title, chars: text.length, inputTokens: input, outputTokens: output, costUsd: +(((input * (price.input ?? 0)) + (output * (price.output ?? 0))) / 1e6).toFixed(5) };
  });
  const total = +rows.reduce((a, r) => a + r.costUsd, 0).toFixed(4);
  const out = { version: 1, model: cfg.model ?? cfg.provider, price, episodes: rows, totalUsd: total, at: new Date().toISOString() };
  mkdirSync(CAT, { recursive: true }); atomicWrite(join(CAT, 'inventory.estimate.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

const roleOf = (x) => x.role ?? (x.mustShow === false ? 'background' : 'mustShow');
const row = (x) => ({ name: x.name, role: roleOf(x), mustShow: roleOf(x) === 'mustShow', ...(x.note ? { note: x.note } : {}) });

function normalizeEpisode(x, id) {
  return {
    id,
    places: (x.places ?? []).map((p) => ({ ...row(p), timeOfDay: p.timeOfDay ?? 'day' })),
    characters: (x.characters ?? []).map((c) => { const role = roleOf(c); return { name: c.name, kind: c.kind ?? 'human', traits: c.traits ?? [], mustHave: c.mustHave ?? [], speaking: c.speaking !== false, role, mustShow: role === 'mustShow', ...(c.note ? { note: c.note } : {}) }; }),
    animals: (x.animals ?? []).map(row),
    vehicles: (x.vehicles ?? []).map(row),
    props: (x.props ?? []).map(row),
    actions: (x.actions ?? []).map(row),
    effects: (x.effects ?? []).map(row),
    ...(x.crowd ? { crowd: String(x.crowd).slice(0, 120) } : {}),
    sounds: (x.sounds ?? []).map(String).slice(0, 12),
    sensitive: (x.sensitive ?? []).map((s) => ({ moment: String(s.moment ?? '').slice(0, 200), treatment: String(s.treatment ?? '').slice(0, 400) })).filter((s) => s.moment && s.treatment),
  };
}

export async function runInventory({ ids = null, noCache = false } = {}) {
  const est = estimateInventory(ids);
  const { data, list } = episodesToRun(ids);
  mkdirSync(WORK, { recursive: true });
  const project = {};
  const router = new ModelRouter(WORK, project, { noCache });
  const out = [];
  const review = [];
  for (const ep of list) {
    if (!ep.mapping?.verified) { review.push({ id: ep.id, reason: 'unverified section mapping' }); continue; }
    const text = trim(episodeText(ep));
    if (!text) { review.push({ id: ep.id, reason: 'no mapped section text' }); continue; }
    const messages = [
      { role: 'system', content: INVENTORY },
      { role: 'user', content: `EPISODE ${ep.id} — ${ep.title} (Book ${ep.book})\n\n${text}` },
    ];
    const r = await router.callJson('inventory', messages, {
      mockKey: 'inventory',
      validate: (d) => {
        const errs = validationErrors('inventory', d);
        if (d?.episodes?.length !== 1) errs.push('return exactly one episode');
        if (d?.episodes?.[0]?.id !== ep.id) errs.push(`episode id must be ${ep.id}`);
        return errs;
      },
      temperature: 0.2,
    });
    out.push(normalizeEpisode(r.data.episodes[0], ep.id));
  }
  let episodes = out;
  if (ids?.length && existsSync(join(CAT, 'inventory.json'))) {
    const old = JSON.parse(readFileSync(join(CAT, 'inventory.json'), 'utf8')).episodes ?? [];
    const by = new Map(old.map((e) => [e.id, e]));
    for (const e of out) by.set(e.id, e);
    episodes = [...by.values()];
  }
  const inventory = { version: 1, source: 'Ganguli via library/ganguli', estimateUsd: est.totalUsd, review, episodes };
  atomicWrite(join(CAT, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  return { inventory, estimate: est, usage: router.usage };
}
