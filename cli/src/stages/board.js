// Board writer: shot plan -> authoring board shots, with compile/measured repair and review.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../env.js';
import { atomicWrite, writeJsonArtifact } from '../core/artifacts.js';
import { compileBoard } from '../authoring.js';
import { checkFramesMeasured } from '../frames.js';

const DEFAULTS = { palace: 'courtyard', hermitage: 'clearing', village: 'front', deer: 'clearing', arena: 'floor', city: 'clearing', lac: 'stage', naga: 'floor' };
const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000; };
const asArray = (v) => (Array.isArray(v) ? v : [v]);
const clean = (r) => r.errors.length === 0;

export function shotSchema(planShot, cast, catalog) {
  const set = catalog.sets.find((s) => s.name === planShot.set);
  const marks = (set?.marks ?? []).map((m) => `${planShot.set}.${m.name}`);
  const chars = planShot.characters ?? [];
  const subjects = [...new Set([...chars, ...marks, ...catalog.effects.map((e) => e.name)])];
  const anchor = { type: 'string', pattern: `^(?:${(planShot.lines ?? []).join('|')}):[0-9]+(?:[+-][0-9]+(?:\\.[0-9]+)?[fs])?$` };
  const actor = {
    type: 'object', additionalProperties: false, required: ['cast', 'at', 'pose', 'expr'],
    properties: {
      cast: { enum: chars }, at: { enum: marks }, nudge: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
      pose: { enum: catalog.poses.map((x) => x.name) }, expr: { enum: catalog.expressions.map((x) => x.name) },
      prop: { oneOf: [{ enum: catalog.props.map((x) => x.name) }, { type: 'null' }] },
      face: { enum: [...new Set([...chars, ...marks, ...catalog.effects.map((e) => e.name)])] },
      scale: { type: 'number', exclusiveMinimum: 0 },
    },
  };
  const camera = {
    type: 'object', additionalProperties: false, required: ['at', 'size', 'on', 'angle', 'side', 'move'],
    properties: {
      at: anchor, size: { enum: ['close', 'medium', 'full', 'wide', 'establishing', 'insert'] },
      on: { type: 'array', items: { enum: subjects }, minItems: 1 },
      with: { type: 'array', items: { enum: subjects } },
      angle: { enum: ['eye', 'low', 'high', 'overhead'] }, side: { enum: ['front', 'left', 'right', 'frontLeft', 'frontRight'] },
      move: { enum: ['push', 'hold', 'glide', 'follow', 'crane', 'tiltUp', 'tiltDown', 'pan', 'reveal'] },
      cut: { type: 'boolean' }, scenery: { type: 'boolean' },
    },
  };
  return {
    type: 'object', additionalProperties: false, required: ['id', 'start', 'end', 'light', 'sets', 'actors', 'camera'],
    properties: {
      id: { const: planShot.id }, start: anchor, end: anchor, light: { enum: catalog.lights.map((x) => x.name) },
      sets: { type: 'array', items: { enum: [planShot.set] }, minItems: 1, maxItems: 1 },
      actors: { type: 'array', items: actor }, camera: { type: 'array', items: camera, minItems: 1 },
    },
  };
}

function baseShot(s, i, plan, cast, catalog) {
  const set = catalog.sets.find((x) => x.name === s.set) ?? catalog.sets[0];
  const mark = `${s.set}.${DEFAULTS[s.set] ?? set.marks[0]?.name ?? 'floor'}`;
  const n = s.characters?.length ?? 0;
  const effective = (s.keys ?? []).map((k) => (k.size === 'close' && asArray(k.on).length > 1 ? 'medium' : k.size));
  const spacing = effective.includes('close') ? 0.5 : effective.includes('medium') ? 0.9 : 1.0;
  const actors = (s.characters ?? []).map((id, j) => {
    const beats = (s.beats ?? []).filter((b) => b.who === id);
    const first = beats[0] ?? {};
    return {
      cast: id, id, at: mark, nudge: [(j - (n - 1) / 2) * spacing, 0, 0],
      pose: first.pose ?? 'stand', expr: first.expr ?? 'neutral',
      ...(first.prop ? { prop: first.prop } : {}), ...(first.face ? { face: first.face } : {}),
      do: beats.map((b) => { const { who, at, ...rest } = b; if (rest.talk === true) rest.talk = { base: rest.expr ?? 'neutral', rate: 1 }; return [at, rest]; }),
    };
  });
  const camera = (s.keys ?? []).map((k, j) => {
    const withIds = (k.with ?? []).filter((id) => { const m = set.marks.find((x) => x.name === id || `${s.set}.${x.name}` === id); return !m || (m.ids?.length ?? 0) > 0; });
    const on = asArray(k.on);
    return { at: k.at, size: k.size === 'close' && on.length > 1 ? 'medium' : k.size, on, ...(withIds.length ? { with: withIds } : {}), angle: k.angle, side: k.side, move: k.move, ...(j ? { cut: true } : {}), ...(on.every((id) => !(s.characters ?? []).includes(id)) ? { scenery: true } : {}) };
  });
  const fx = (s.fx ?? []).map((f) => ({ kind: f.kind, at: f.at, pos: { mark, nudge: [0, 2.2, -0.6] }, ...(f.kind === 'puff' ? { size: 2.6, dur: 0.4 } : {}), ...(f.kind === 'sparkle' ? { size: 0.8 } : {}), ...(f.kind === 'stars' ? { size: [1.5, 0.79], period: 0.4, dur: 0.4 } : {}) }));
  return { id: s.id, start: s.start, end: i + 1 < plan.shots.length ? plan.shots[i + 1].start : 'end', light: s.light, sets: [s.set], actors, camera, ...(fx.length ? { fx } : {}) };
}

function variants(shot, s, catalog) {
  const out = [shot];
  const set = catalog.sets.find((x) => x.name === s.set);
  const marks = (set?.marks ?? []).map((m) => `${s.set}.${m.name}`);
  const clone = () => JSON.parse(JSON.stringify(shot));
  { const v = clone(); v.camera.forEach((k) => { k.side = 'front'; }); out.push(v); }
  { const v = clone(); v.camera.forEach((k) => { k.angle = 'low'; }); out.push(v); }
  for (const spacing of [0.7, 0.5]) {
    const v = clone(); const n = v.actors.length;
    v.actors.forEach((a, j) => { a.nudge = [(j - (n - 1) / 2) * spacing, 0, 0]; }); out.push(v);
  }
  for (const third of ['left', 'right']) { const v = clone(); v.camera.forEach((k) => { if (asArray(k.on).length > 1) k.third = third; }); out.push(v); }
  for (const side of ['left', 'right']) { const v = clone(); v.camera.forEach((k) => { k.side = side; }); out.push(v); }
  for (const mark of marks) { const v = clone(); v.actors.forEach((a, j) => { a.at = mark; a.nudge = [(j - (v.actors.length - 1) / 2) * 0.7, 0, 0]; }); v.fx?.forEach((f) => { f.pos = { mark, nudge: [0, 2.2, -0.6] }; }); out.push(v); }
  return out;
}

function measureShot(tmp, shot, castMap, words, catalog) {
  const board = { version: 1, partial: true, cast: castMap, shots: [shot] };
  const { storyboard } = compileBoard(board, words, catalog);
  atomicWrite(join(tmp, 'words.json'), JSON.stringify(words));
  atomicWrite(join(tmp, 'storyboard.json'), JSON.stringify(storyboard));
  return checkFramesMeasured(tmp);
}

export async function repairShot({ base, variants = [], measure, maxRounds = 3 }) {
  let best = base, bestFindings = await measure(base), rounds = 1, escalated = false;
  if (!bestFindings.length) return { best, findings: [], rounds, escalated, needsHuman: false };
  for (const v of variants) {
    if (rounds >= maxRounds) break;
    rounds++;
    const findings = await measure(v);
    if (findings.length < bestFindings.length) { best = v; bestFindings = findings; }
    if (!bestFindings.length) break;
    if (rounds >= 2) escalated = true;
  }
  return { best, findings: bestFindings, rounds, escalated, needsHuman: bestFindings.length > 0 };
}

export async function runBoard({ projectDir, project, router }) {
  const plan = JSON.parse(readFileSync(join(projectDir, 'shotplan.json'), 'utf8'));
  const cast = JSON.parse(readFileSync(join(projectDir, 'cast.json'), 'utf8'));
  const words = JSON.parse(readFileSync(join(projectDir, 'words.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const castMap = Object.fromEntries(cast.characters.map((c) => [c.id, { spec: c.spec ?? c.cast, seed: seedOf(c.id) }]));
  let shots = plan.shots.map((s, i) => baseShot(s, i, plan, cast, catalog));
  const review = { version: 1, model: 'deterministic base + measured variants', shots: [] };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-board-'));
  try {
    // Compile each shot alone; if a shot cannot compile, try its variants.
    for (let i = 0; i < shots.length; i++) {
      let chosen = null, findings = [], rounds = 0;
      for (const v of variants(shots[i], plan.shots[i], catalog)) {
        rounds++;
        try { compileBoard({ version: 1, partial: true, cast: castMap, shots: [v] }, words, catalog); chosen = v; break; }
        catch (e) { findings = [e.message]; }
      }
      if (!chosen) { chosen = shots[i]; findings = findings.length ? findings : ['no compiling variant']; }
      review.shots.push({ id: shots[i].id, rounds, needsHuman: !chosen, findings });
      shots[i] = chosen;
    }
    const board = { version: 1, cast: castMap, shots };
    let compiled = compileBoard(board, words, catalog).storyboard;
    atomicWrite(join(projectDir, 'storyboard.json'), JSON.stringify(compiled, null, 2) + '\n');
    let measured = await checkFramesMeasured(projectDir);
    // Edge/head-cut shots can be repaired by a small deterministic staging variation. Do not churn a
    // blocker/face problem through one-shot coverage (the one-shot framing differs from the full board).
    for (const id of [...new Set(measured.errors.map((e) => e.shot))]) {
      const errs = measured.errors.filter((e) => e.shot === id);
      const rec = review.shots.find((s) => s.id === id);
      if (errs.some((e) => ['blocker', 'face too small', 'subject hidden'].includes(e.code))) {
        if (rec) { rec.needsHuman = true; rec.findings = errs.map((e) => e.message); }
        continue;
      }
      const idx = shots.findIndex((s) => s.id === id);
      if (idx < 0) continue;
      let best = shots[idx], bestErrors = errs, rounds = 1;
      for (const v of variants(shots[idx], plan.shots[idx], catalog).slice(1, 16)) {
        rounds++;
        try {
          const r = await measureShot(tmp, v, castMap, words, catalog);
          if (r.errors.length < bestErrors.length) { best = v; bestErrors = r.errors; }
          if (!bestErrors.length) break;
        } catch (e) { /* keep the previous best */ }
      }
      shots[idx] = best;
      if (rec) { rec.rounds += rounds; rec.findings = bestErrors.map((e) => e.message); rec.needsHuman = bestErrors.length > 0; }
    }
    const finalBoard = { version: 1, cast: castMap, shots };

    compiled = compileBoard(finalBoard, words, catalog).storyboard;
    atomicWrite(join(projectDir, 'storyboard.json'), JSON.stringify(compiled, null, 2) + '\n');
    measured = await checkFramesMeasured(projectDir);
    for (const id of new Set(measured.errors.map((e) => e.shot))) {
      const rec = review.shots.find((s) => s.id === id);
      if (rec) { rec.needsHuman = true; rec.findings = measured.errors.filter((e) => e.shot === id).map((e) => e.message); }
    }
    writeJsonArtifact(projectDir, 'board', 'board.review.json', review, null);
    writeJsonArtifact(projectDir, 'board', 'board.json', finalBoard, 'authoring');
    const needsHuman = review.shots.filter((s) => s.needsHuman).map((s) => s.id);
    return { shots: finalBoard.shots.length, needsHuman, errors: measured.errors.length, warnings: measured.warnings.length, usage: router.stageUsage('board') };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
