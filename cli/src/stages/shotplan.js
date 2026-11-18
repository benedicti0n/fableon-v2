// Shot-plan stage: script + words + cast + assets -> a director's shot plan with deterministic checks.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../env.js';
import { validationErrors, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { buildCatalogCard } from '../catalog-card.js';
import { SHOTPLAN_SKELETON, SHOTPLAN_KEYS } from './prompts.js';
import { formulaBeat } from './script.js';
import { allocatePlan } from '../allocator.js';

const PLAN_ANCHOR = /^(\d+):(\d+)(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/;
const SIDE_DEG = { front: 0, left: -30, right: 30, frontLeft: -15, frontRight: 15 };
const ANGLE_DEG = { eye: 0, low: -20, high: 20, overhead: 45 };
const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
let planCatalog = null;
const catalogForPlan = (data) => { if (data.catalog) return data.catalog; if (!planCatalog) planCatalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8')); return planCatalog; };

export function planTime(anchor, words, fps = 30) {
  const m = PLAN_ANCHOR.exec(String(anchor ?? ''));
  if (!m) throw new Error(`bad anchor "${anchor}" (use n:k, optionally +0.4s or +4f)`);
  const line = Number(m[1]), k = Number(m[2]);
  const hits = words.filter((w) => w.line === line);
  const hit = hits[k];
  if (!hit) throw new Error(`anchor ${anchor}: line ${line} has no word ${k}`);
  const sign = m[3] === '-' ? -1 : 1;
  const offset = m[4] === undefined ? 0 : sign * Number(m[4]) * (m[5] === 's' ? 1 : 1 / fps);
  return hit.a + offset;
}

const markOf = (catalog, set, name) => {
  const s = catalog.sets.find((x) => x.name === set);
  return s?.marks.find((m) => m.name === name || `${set}.${m.name}` === name);
};
const markAny = (catalog, name) => {
  if (String(name).includes('.')) {
    const [set, ...rest] = String(name).split('.');
    return markOf(catalog, set, rest.join('.'));
  }
  return catalog.sets.flatMap((s) => s.marks.map((m) => ({ ...m, set: s.name }))).find((m) => m.name === name);
};
const catalogItem = (catalog, id, set) => {
  if (markOf(catalog, set, id) || markAny(catalog, id)) return true;
  if (catalog.effects.some((e) => e.name === id)) return true;
  if (catalog.setPieces.some((e) => e.name === id)) return true;
  if (catalog.props.some((e) => e.name === id)) return true;
  return false;
};
const landmark = (catalog, set, id) => !!(markOf(catalog, set, id) || catalog.sets.find((s) => s.name === set)?.marks.some((m) => `${set}.${m.name}` === id));

/** Deterministic shot-plan checks; returns [] when the plan is shootable. */
export function shotplanErrors(data, { script, words, cast, catalog, assets = [] }, { skeleton = false } = {}) {
  const errs = [];
  const shots = data.shots ?? [];
  const castIds = new Set((cast.characters ?? []).map((c) => c.id));
  const knownAssets = new Map((Array.isArray(assets) ? assets : assets?.assets ?? []).map((a) => [a.object, a.standIn]));
  const totalEnd = words.length ? words[words.length - 1].b : 0;
  const time = (a) => { try { return planTime(a, words); } catch (e) { errs.push(e.message); return NaN; } };
  const times = shots.map((s) => time(s.start));
  if (shots.length) {
    if (!(times[0] >= 0 && times[0] <= 0.5)) errs.push(`/shots/0/start must begin the film near 0 s (got ${times[0]})`);
    const flat = shots.flatMap((s) => s.lines ?? []);
    if (flat[0] !== 0) errs.push('/shots must start on line 0');
    for (let i = 1; i < flat.length; i++) if (flat[i] < flat[i - 1]) { errs.push(`/shots line order goes backwards at shot line ${flat[i]} after ${flat[i - 1]}`); break; }
    const seenLines = new Set(flat);
    for (let n = 0; n < script.lines.length; n++) if (!seenLines.has(n)) { errs.push(`/shots is missing line ${n}`); break; }
    if (flat[flat.length - 1] !== script.lines.length - 1) errs.push(`/shots must end on line ${script.lines.length - 1}`);
    for (let i = 1; i < shots.length; i++) if (!(times[i] > times[i - 1])) errs.push(`/shots/${i}/start must be after shot ${i - 1} (${times[i - 1]})`);
    const avg = totalEnd / shots.length;
    if (avg < 2.5 || avg > 4) errs.push(`/shots average ${avg.toFixed(2)} s is outside 2.5-4 s`);
    shots.forEach((s, i) => {
      const end = i + 1 < shots.length ? times[i + 1] : totalEnd;
      const len = end - times[i];
      if (!(len >= 1.2)) errs.push(`/shots/${i} is ${len.toFixed(2)} s, shorter than 1.2 s`);
      if (len > (s.hold ? 8 : 6)) errs.push(`/shots/${i} is ${len.toFixed(2)} s, longer than ${s.hold ? 8 : 6} s`);
      if (!catalog.sets.some((x) => x.name === s.set)) errs.push(`/shots/${i}/set "${s.set}" is not in the catalog`);
      if (!catalog.lights.some((x) => x.name === s.light)) errs.push(`/shots/${i}/light "${s.light}" is not in the catalog`);
      if (i > 0 && shots[i - 1].set === s.set && shots[i - 1].light !== s.light && !s.lightChange) errs.push(`/shots/${i}/light changes inside ${s.set} without lightChange: true`);
      for (const id of s.characters ?? []) if (!castIds.has(id)) errs.push(`/shots/${i}/characters "${id}" is not in cast.json`);
      const mark = s.mustShow ?? [];
      if (i === 0 || shots[i - 1].set !== s.set) {
        if (!skeleton) {
          const first = s.keys?.[0];
          if (!first || !['wide', 'establishing'].includes(first.size)) errs.push(`/shots/${i} opens a place without a wide/establishing first key`);
        }
        if (!mark.some((id) => landmark(catalog, s.set, id))) errs.push(`/shots/${i}/mustShow must list a landmark of ${s.set}`);
      }
      for (const id of mark) {
        if (castIds.has(id) || catalogItem(catalog, id, s.set)) continue;
        if (knownAssets.has(id)) errs.push(`/shots/${i}/mustShow "${id}" is an asset gap; use its stand-in ${knownAssets.get(id)}`);
        else errs.push(`/shots/${i}/mustShow "${id}" is not in the catalog/cast`);
      }
      const keys = s.keys ?? [];
      if (!skeleton && !keys.length) errs.push(`/shots/${i} has no camera keys`);
      if (!skeleton) {
      let lastKey = NaN;
      keys.forEach((k, j) => {
        const kt = time(k.at);
        if (!(kt >= times[i] - 0.001)) errs.push(`/shots/${i}/keys/${j}/at ${k.at} starts before the shot`);
        if (kt < lastKey) errs.push(`/shots/${i}/keys/${j}/at ${k.at} is not increasing`);
        lastKey = kt;
        if (!['close', 'medium', 'full', 'wide', 'establishing', 'insert'].includes(k.size)) errs.push(`/shots/${i}/keys/${j}/size "${k.size}" is invalid`);
        for (const id of asArray(k.on)) {
          if (castIds.has(id) && (s.characters ?? []).includes(id)) continue;
          if (catalogItem(catalog, id, s.set)) continue;
          errs.push(`/shots/${i}/keys/${j}/on "${id}" is not a shot character or a ${s.set} mark`);
        }
        for (const id of asArray(k.with)) if (!castIds.has(id) && !catalogItem(catalog, id, s.set)) errs.push(`/shots/${i}/keys/${j}/with "${id}" is not in the catalog/cast`);
      });
      const keyEnd = (j) => (j + 1 < keys.length ? time(keys[j + 1].at) : end);
      keys.forEach((k, j) => { const kt = time(k.at); if (j === 0 && Math.abs(kt - times[i]) > 0.25) errs.push(`/shots/${i}/keys/0 must start at the shot start`); if (keyEnd(j) - kt < 0.6) errs.push(`/shots/${i}/keys/${j} is shorter than 0.6 s`); });
      }
      for (const b of s.beats ?? []) {
        if (!(s.characters ?? []).includes(b.who)) errs.push(`/shots/${i}/beats "${b.who}" is not in characters`);
        const bt = time(b.at);
        if (!(bt >= times[i] && bt < end)) errs.push(`/shots/${i}/beats/${b.who}/at ${b.at} is outside the shot`);
        if (b.pose && !catalog.poses.some((x) => x.name === b.pose)) errs.push(`/shots/${i}/beats/${b.who} pose "${b.pose}" is not in the catalog`);
        if (b.expr && !catalog.expressions.some((x) => x.name === b.expr)) errs.push(`/shots/${i}/beats/${b.who} expr "${b.expr}" is not in the catalog`);
        if (b.prop && !catalog.props.some((x) => x.name === b.prop)) errs.push(`/shots/${i}/beats/${b.who} prop "${b.prop}" is not in the catalog`);
        if (b.face && !castIds.has(b.face) && !catalogItem(catalog, b.face, s.set)) errs.push(`/shots/${i}/beats/${b.who} face "${b.face}" is not in the catalog/cast`);
      }
      for (const f of s.fx ?? []) {
        const ft = time(f.at);
        if (!catalog.effects.some((x) => x.name === f.kind)) errs.push(`/shots/${i}/fx "${f.kind}" is not in the catalog`);
        if (!(ft >= times[i] && ft < end)) errs.push(`/shots/${i}/fx/${f.kind}/at ${f.at} is outside the shot`);
      }
      for (const si of s.standIns ?? []) {
        if (!knownAssets.has(si.asset)) errs.push(`/shots/${i}/standIns "${si.asset}" is not an assets.todo gap`);
        if (!catalogItem(catalog, si.standIn, s.set)) errs.push(`/shots/${i}/standIns stand-in "${si.standIn}" is not in the catalog`);
      }
      for (const n of s.lines ?? []) {
        for (const who of script.lines[n]?.look?.who ?? []) if (!(s.characters ?? []).includes(who) && !s.why) errs.push(`/shots/${i} covers line ${n} with look.who "${who}" but does not include it; add it or a why`);
      }
    });
    if (!skeleton) for (let i = 1; i < shots.length; i++) {
      const a = shots[i - 1], b = shots[i];
      if (a.set !== b.set) continue;
      const ka = a.keys?.[a.keys.length - 1], kb = b.keys?.[0];
      const pa = asArray(ka?.on)[0], pb = asArray(kb?.on)[0];
      if (!pa || pa !== pb || ka.size !== kb.size) continue;
      const side = Math.abs((SIDE_DEG[ka.side] ?? 0) - (SIDE_DEG[kb.side] ?? 0));
      const angle = Math.abs((ANGLE_DEG[ka.angle] ?? 0) - (ANGLE_DEG[kb.angle] ?? 0));
      if (side < 30 && angle < 30) errs.push(`/shots/${i} is a jump cut from shot ${i - 1}: ${pa} stays ${ka.size} with <30 degrees change`);
    }
  } else errs.push('/shots must not be empty');
  if (!skeleton && shots.length) errs.push(...directorErrors(data, { script, words, catalog }));
  return errs;
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const spans = (data, words) => {
  const out = [];
  (data.shots ?? []).forEach((s, i) => {
    const start = planTime(s.start, words);
    const end = i + 1 < data.shots.length ? planTime(data.shots[i + 1].start, words) : words[words.length - 1].b;
    out.push(`${start.toFixed(1)}–${end.toFixed(1)} s`);
  });
  return out;
};

export function renderShotplanMd(data, { script, words, cast }) {
  const times = spans(data, words);
  const rows = (data.shots ?? []).map((s, i) => {
    const lines = (s.lines ?? []).map((n) => `${script.lines[n]?.text ?? ''} / ${script.lines[n]?.gloss ?? ''}`).join('<br>');
    const keys = (s.keys ?? []).map((k) => `${k.at} ${k.size} ${asArray(k.on).join('+')}${k.with?.length ? ` with ${k.with.join('+')}` : ''} (${k.side ?? 'front'}/${k.angle ?? 'eye'}/${k.move ?? 'push'})${k.note ? ` — ${k.note}` : ''}`).join('<br>');
    return `| ${s.id} | ${times[i]} | ${lines} | ${esc(s.action)}<br>${esc((s.mustShow ?? []).join(', '))} | ${keys} |`;
  });
  return `# Shot plan — ${esc(script.title ?? data.title ?? '')}\n\n| shot | time | Hindi / gloss | what we see | keys |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
}


/** Film-level reference checks for a plan that uses scenes/transitions/direction marks. */
export function directorErrors(data, { script, words, catalog }, policy = {}) {
  const errs = [];
  const shots = data.shots ?? [];
  const hasDirection = shots.some((s) => s.scene || s.transition || (s.keys ?? []).some((k) => k.punch || k.impact || k.drama || k.reveal || k.foreground || k.ease));
  if (!hasDirection) return errs;
  const time = (a) => { try { return planTime(a, words); } catch (e) { errs.push(e.message); return NaN; } };
  const totalEnd = words.length ? words[words.length - 1].b : 0;
  const start = (s) => time(s.start);
  const endAt = (i) => (i + 1 < shots.length ? start(shots[i + 1]) : totalEnd);
  const hookLine = script.lines.find((l) => formulaBeat(l.beat) === 'hook');
  const hookWords = words.filter((w) => w.line === hookLine?.n);
  const hookEnd = hookWords.length ? Math.max(...hookWords.map((w) => w.b)) : 0;
  let cuts = 0, flashes = 0, flashAfterHook = false;
  shots.forEach((s, i) => {
    if (!s.scene) errs.push(`/shots/${i} needs a scene id`);
    if (i === 0) return;
    const prev = shots[i - 1];
    if (prev.scene === s.scene && (prev.set !== s.set || prev.light !== s.light)) errs.push(`/shots/${i} scene "${s.scene}" changes place/time inside the same scene`);
    if (prev.set === s.set && prev.light === s.light && prev.scene !== s.scene) errs.push(`/shots/${i} starts a new scene without a place/time change (${s.set}/${s.light})`);
    const t = s.transition;
    if (!t) { errs.push(`/shots/${i} needs a transition from ${prev.id}`); return; }
    if (t.type === 'cut') cuts++;
    if (t.type === 'flash') {
      flashes++;
      if (start(s) >= hookEnd) flashAfterHook = true;
      if ((t.frames ?? 4) !== 4) errs.push(`/shots/${i} flash must be 4 frames (got ${t.frames})`);
    }
    if (t.type === 'crossfade' && ((t.frames ?? 7) < 6 || (t.frames ?? 7) > 8)) errs.push(`/shots/${i} crossfade must be 6-8 frames (got ${t.frames})`);
    const placeChange = prev.set !== s.set || prev.light !== s.light;
    if (placeChange && !['crossfade', 'flash'].includes(t.type)) errs.push(`/shots/${i} changes place/time and needs a crossfade or the post-hook flash (got ${t.type})`);
  });
  if (cuts > (policy.maxCuts ?? 2)) errs.push(`/shots has ${cuts} hard cuts; use at most ${policy.maxCuts ?? 2}`);
  if (flashes > (policy.maxFlashes ?? 3)) errs.push(`/shots has ${flashes} flashes; use at most ${policy.maxFlashes ?? 3}`);
  if (flashes && !flashAfterHook) errs.push('/shots needs a flash after the hook');

  // Movement paths and follow keys.
  for (const [i, s] of shots.entries()) {
    for (const m of s.moves ?? []) {
      if (!(s.characters ?? []).includes(m.who)) errs.push(`/shots/${i}/moves "${m.who}" is not in characters`);
      const from = markAny(catalog ?? catalogForPlan(data), m.from);
      const to = markAny(catalog ?? catalogForPlan(data), m.to);
      if (!from || !to) errs.push(`/shots/${i}/moves needs catalog marks for from/to (${m.from} -> ${m.to})`);
      const a = time(m.at), b = time(m.until);
      if (!(a >= start(s) && a < endAt(i) && b > a && b <= endAt(i))) errs.push(`/shots/${i}/moves ${m.who} must stay inside the shot and end after it starts`);
    }
    for (const k of s.keys ?? []) {
      if (k.move === 'follow') {
        const who = asArray(k.on)[0];
        if (!(s.moves ?? []).some((m) => m.who === who)) errs.push(`/shots/${i}/keys follow needs a moves path for "${who}"`);
      }
      if (k.foreground) {
        const c = catalog ?? catalogForPlan(data);
        if (!catalogItem(c, k.foreground, s.set)) errs.push(`/shots/${i}/keys foreground "${k.foreground}" is not a catalog prop/mark`);
      }
    }
  }

  // Film shares and punch coverage.
  let hold = 0, dof = 0, keys = 0, fg = 0, low = 0, lowFull = 0;
  for (let i = 0; i < shots.length; i++) {
    const ks = shots[i].keys ?? [];
    const t0 = start(shots[i]), t1 = endAt(i);
    ks.forEach((k, j) => {
      const a = Math.max(t0, time(k.at));
      const b = j + 1 < ks.length ? Math.min(t1, time(ks[j + 1].at)) : t1;
      const d = Math.max(0, b - a);
      keys++;
      if (['push', 'hold'].includes(k.move ?? 'push') && !k.ease) hold += d;
      if (['close', 'medium', 'insert'].includes(k.size)) dof += d;
      if (k.foreground) fg++;
      if (['full', 'wide', 'establishing'].includes(k.size)) { lowFull++; if ((k.angle ?? 'low') === 'low') low++; }
    });
  }
  const total = Math.max(1e-6, totalEnd);
  const holdShare = hold / total, dofShare = dof / total, fgShare = keys ? fg / keys : 0;
  if (holdShare < (policy.holdMin ?? 0.70) || holdShare > (policy.holdMax ?? 0.85)) errs.push(`hold share ${(holdShare * 100).toFixed(0)}% is outside ${((policy.holdMin ?? 0.70) * 100).toFixed(0)}-${((policy.holdMax ?? 0.85) * 100).toFixed(0)}%`);
  if (dofShare < (policy.dofMin ?? 0.25) || dofShare > (policy.dofMax ?? 0.40)) errs.push(`DOF share ${(dofShare * 100).toFixed(0)}% is outside ${((policy.dofMin ?? 0.25) * 100).toFixed(0)}-${((policy.dofMax ?? 0.40) * 100).toFixed(0)}%`);
  if (fgShare < (policy.fgMin ?? 0.25) || fgShare > (policy.fgMax ?? 0.40)) errs.push(`foreground share ${(fgShare * 100).toFixed(0)}% of keys is outside ${((policy.fgMin ?? 0.25) * 100).toFixed(0)}-${((policy.fgMax ?? 0.40) * 100).toFixed(0)}%`);
  if (lowFull && low / lowFull < 0.5) errs.push(`low camera height on only ${low}/${lowFull} full/wide/establishing keys; use low by default`);
  const lineWindow = (n) => {
    const ws = (words ?? []).filter((w) => w.line === n);
    return ws.length ? [Math.min(...ws.map((w) => w.a)), Math.max(...ws.map((w) => w.b))] : null;
  };
  for (const l of script.lines.filter((x) => ['hook', 'mystery', 'payoff'].includes(formulaBeat(x.beat)))) {
    const w = lineWindow(l.n);
    if (!w) continue;
    const hit = shots.some((s) => (s.keys ?? []).some((k) => k.punch && time(k.punch) >= w[0] && time(k.punch) <= w[1]));
    if (!hit) errs.push(`/lines/${l.n} ${l.beat} needs a punch-in`);
  }
  return errs;
}

function normalizeSkeleton(plan, words, totalEnd) {
  const shots = plan.shots;
  const time = (a) => planTime(a, words);
  const union = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])];
  const merge = (into, from, keepStart) => {
    into.lines = union(into.lines, from.lines);
    into.characters = union(into.characters, from.characters);
    into.mustShow = union(into.mustShow, from.mustShow);
    into.action = `${into.action} ${from.action}`.trim();
    if (from.why) into.why = into.why ? `${into.why} ${from.why}` : from.why;
    if (from.lightChange) into.lightChange = true;
    if (keepStart) into.start = from.start;
    if (from.hold) into.hold = true;
  };
  for (let i = 0; i < shots.length; i++) {
    const end = i + 1 < shots.length ? time(shots[i + 1].start) : totalEnd;
    const len = end - time(shots[i].start);
    if (len >= 1.2) continue;
    if (i === 0 && shots.length > 1 && shots[1].set === shots[0].set) {
      merge(shots[0], shots[1], false); shots.splice(1, 1); i--;
    } else if (i > 0 && shots[i - 1].set === shots[i].set) {
      merge(shots[i - 1], shots[i], false); shots.splice(i, 1); i -= 2;
    } else if (i + 1 < shots.length && shots[i + 1].set === shots[i].set) {
      merge(shots[i + 1], shots[i], true); shots.splice(i, 1); i--;
    }
  }
  for (let i = 0; i < shots.length; i++) {
    const end = i + 1 < shots.length ? time(shots[i + 1].start) : totalEnd;
    const len = end - time(shots[i].start);
    if (len > 6 && len <= 8) shots[i].hold = true;
  }
  return shots.length;
}

export async function runShotplan({ projectDir, project, router }) {
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const words = JSON.parse(readFileSync(join(projectDir, 'words.json'), 'utf8'));
  const cast = JSON.parse(readFileSync(join(projectDir, 'cast.json'), 'utf8'));
  const assets = existsSync(join(projectDir, 'assets.todo.json')) ? JSON.parse(readFileSync(join(projectDir, 'assets.todo.json'), 'utf8')) : { version: 1, assets: [] };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const guide = readFileSync(join(ROOT, 'docs', 'DIRECTOR_GUIDE.md'), 'utf8');
  const craft = readFileSync(join(ROOT, 'prompts', 'director-craft.md'), 'utf8');
  const card = buildCatalogCard();
  const notesPath = join(projectDir, 'shotplan.notes.json');
  const notes = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')).notes?.map((n) => n.text) ?? [] : [];
  const wordsByLine = {};
  for (const w of words) (wordsByLine[w.line] ??= []).push([w.w, +w.a.toFixed(2), +w.b.toFixed(2)]);
  const data = {
    title: script.title,
    targetShots: 30,
    filmSeconds: project.seconds,
    lineCount: script.lines.length,
    script: script.lines.map((l) => ({ n: l.n, text: l.text, gloss: l.gloss, beat: l.beat, delivery: l.delivery, look: l.look })),
    words: wordsByLine,
    cast: cast.characters.map((c) => ({ id: c.id, name: c.name, spec: c.spec ?? c.cast, notes: c.notes })),
    assets: assets.assets,
    lights: catalog.lights,
    notes,
  };
  const skeletonSchema = JSON.parse(readFileSync(join(ROOT, 'schema', 'shotplan-skeleton.schema.json'), 'utf8'));
  const skeletonSystem = `${SHOTPLAN_SKELETON}\n\nDIRECTOR GUIDE\n${guide}\n\nDIRECTOR CRAFT\n${craft}\n\nCATALOG CARD\n${card.text}\n\nSKELETON SCHEMA\n${JSON.stringify(skeletonSchema, null, 2)}`;
  const { data: skeleton } = await router.callJson('shotplan', [
    { role: 'system', content: skeletonSystem },
    { role: 'user', content: `DATA:\n${JSON.stringify(data, null, 2)}\nReturn the complete shot skeleton as one json object.` },
  ], {
    validate: (d) => {
      if (d && d.version === undefined) d.version = 1;
      const errs = validationErrors('shotplan-skeleton', d);
      if (errs.length) return errs;
      normalizeSkeleton(d, words, words[words.length - 1].b);
      return shotplanErrors(d, { script, words, cast, catalog, assets: assets.assets }, { skeleton: true });
    },
    repairHint: 'Keep every valid shot. Use 20-32 shots, split long lines by word, cover every line in order, keep starts increasing and each shot 1.2-6 s (average 2.5-4 s), and give every new set a landmark in mustShow. Supply content only; the allocator sets transitions, shares, foreground, low heights and a punch on each hook/mystery/payoff line.',
  });

  const keysSchema = JSON.parse(readFileSync(join(ROOT, 'schema', 'shotplan-keys.schema.json'), 'utf8'));
  const keysSystem = `${SHOTPLAN_KEYS}\n\nDIRECTOR GUIDE\n${guide}\n\nDIRECTOR CRAFT\n${craft}\n\nCATALOG CARD\n${card.text}\n\nKEYS SCHEMA\n${JSON.stringify(keysSchema, null, 2)}`;
  const keyData = {
    skeleton: skeleton.shots.map((s) => ({ id: s.id, lines: s.lines, start: s.start, set: s.set, light: s.light, characters: s.characters, mustShow: s.mustShow, action: s.action, hold: s.hold })),
    words: wordsByLine,
    cast: data.cast,
    assets: data.assets,
    notes,
  };
  const { data: keyDataOut } = await router.callJson('shotplan', [
    { role: 'system', content: keysSystem },
    { role: 'user', content: `DATA:\n${JSON.stringify(keyData, null, 2)}\nReturn keys, beats, fx and standIns for every skeleton shot as one json object.` },
  ], {
    validate: (d) => {
      if (d && d.version === undefined) d.version = 1;
      const errs = validationErrors('shotplan-keys', d);
      if (errs.length) return errs;
      const byId = new Map((d.shots ?? []).map((s) => [s.id, s]));
      for (const s of skeleton.shots) if (!byId.has(s.id)) errs.push(`/shots is missing ${s.id}`);
      if (new Set((d.shots ?? []).map((s) => s.id)).size !== (d.shots ?? []).length) errs.push('/shots has duplicate ids');
      if (errs.length) return errs;
      const merged = allocatePlan(normalizePlan(mergePlan(skeleton, d)), { script, words, catalog }).plan;
      const findings = shotplanErrors(merged, { script, words, cast, catalog, assets: assets.assets });
      if (!findings.length) d.shots = merged.shots.map((s) => ({ id: s.id, keys: s.keys, ...(s.beats ? { beats: s.beats } : {}), ...(s.fx ? { fx: s.fx } : {}), ...(s.standIns ? { standIns: s.standIns } : {}) }));
      return findings;
    },
    repairHint: 'Keep every valid key. Start each shot on its first key, use a wide/establishing first key for the first shot and every new set, change size a step or side/angle >=30 degrees between adjacent keys, keep keys >=0.6 s, and turn mustShow into the first key with. Supply content only; the allocator fills shares, foreground, heights and required punches.',
  });
  const plan = allocatePlan(normalizePlan(mergePlan(skeleton, keyDataOut)), { script, words, catalog }).plan;
  writeJsonArtifact(projectDir, 'shotplan', 'shotplan.json', plan, 'shotplan');
  writeTextArtifact(projectDir, 'shotplan', 'shotplan.md', renderShotplanMd(plan, { script, words, cast }));
  const times = spans(plan, words);
  return { shots: plan.shots.length, average: ((words[words.length - 1].b - (plan.shots[0] ? planTime(plan.shots[0].start, words) : 0)) / plan.shots.length).toFixed(2), span: `${times[0].replace(' s', '')} .. ${times[times.length - 1].replace(' s', '')}`, usage: router.stageUsage('shotplan') };
}

const POSE_ALIASES = { release: 'present', kneel: 'sit', crouch: 'sneak', raise: 'armsUp', lower: 'stand', reach: 'grab', embrace: 'hold', cry: 'shout', kneelDown: 'sit', bow: 'vow' };
const EXPR_ALIASES = { angry: 'stern', happy: 'smile', sad: 'pained', surprised: 'shock', scared: 'nervous', calm: 'neutral' };
const PROP_ALIASES = { rope: 'net', noose: 'net', staff: 'spear', club: 'mace' };
function sideForJump(cur) {
  if (cur === 'left') return 'right';
  if (cur === 'right') return 'left';
  return 'left';
}
function normalizePlan(plan) {
  for (const shot of plan.shots) {
    for (const b of shot.beats ?? []) {
      if (b.pose && POSE_ALIASES[b.pose]) b.pose = POSE_ALIASES[b.pose];
      if (b.expr && EXPR_ALIASES[b.expr]) b.expr = EXPR_ALIASES[b.expr];
      if (b.prop && PROP_ALIASES[b.prop]) b.prop = PROP_ALIASES[b.prop];
    }
  }
  for (let i = 1; i < plan.shots.length; i++) {
    const a = plan.shots[i - 1], b = plan.shots[i];
    if (a.set !== b.set) continue;
    const ka = a.keys?.[a.keys.length - 1], kb = b.keys?.[0];
    const pa = asArray(ka?.on)[0], pb = asArray(kb?.on)[0];
    if (!pa || pa !== pb || ka.size !== kb.size) continue;
    const side = Math.abs((SIDE_DEG[ka.side] ?? 0) - (SIDE_DEG[kb.side] ?? 0));
    const angle = Math.abs((ANGLE_DEG[ka.angle] ?? 0) - (ANGLE_DEG[kb.angle] ?? 0));
    if (side < 30 && angle < 30) {
      kb.side = sideForJump(kb.side);
      kb.note = `${kb.note ?? ''} (turn to avoid a jump cut)`.trim();
    }
  }
  return plan;
}

function mergePlan(skeleton, keys) {
  const byId = new Map((keys.shots ?? []).map((s) => [s.id, s]));
  return {
    version: 1,
    shots: skeleton.shots.map((s) => ({
      ...s,
      keys: byId.get(s.id)?.keys ?? [],
      ...(byId.get(s.id)?.beats ? { beats: byId.get(s.id).beats } : {}),
      ...(byId.get(s.id)?.fx ? { fx: byId.get(s.id).fx } : {}),
      ...(byId.get(s.id)?.standIns ? { standIns: byId.get(s.id).standIns } : {}),
    })),
  };
}
