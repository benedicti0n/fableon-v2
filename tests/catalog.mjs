// Catalog metadata gate: every set has a front, an establishing box and named marks; keep-out volumes are valid;
// every build/special has positive subject measurements.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';

export function runCatalog() {
  const c = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const errors = [];
  const names = new Set(c.sets.map((s) => s.name));
  for (const s of c.sets) {
    if (typeof s.front !== 'number') errors.push(`${s.name}: no front`);
    const b = s.bounds;
    if (!b || !Array.isArray(b.min) || !Array.isArray(b.max) || b.min.some((v, i) => v >= b.max[i])) errors.push(`${s.name}: bad bounds`);
    if (!Array.isArray(s.marks) || !s.marks.length) errors.push(`${s.name}: no marks`);
    for (const m of s.marks ?? []) {
      if (!m.name || !Array.isArray(m.pos) || m.pos.length !== 3 || typeof m.facing !== 'number' || !m.description) errors.push(`${s.name}.${m.name}: bad mark`);
    }
  }
  for (const [set, vols] of Object.entries(c.keepout ?? {})) {
    if (!names.has(set)) errors.push(`keepout for unknown set ${set}`);
    for (const v of vols) {
      if (!v.name) errors.push(`${set}: unnamed volume`);
      if (v.kind === 'box' && (!(v.min?.length === 3) || !(v.max?.length === 3))) errors.push(`${set}.${v.name}: bad box`);
      if (v.kind === 'cylinder' && !(v.r > 0 && v.y1 > v.y0)) errors.push(`${set}.${v.name}: bad cylinder`);
      if (!['box', 'cylinder'].includes(v.kind)) errors.push(`${set}.${v.name}: unknown volume kind`);
    }
  }
  for (const key of ['adult', 'slim', 'stout', 'big', 'elder', 'kid', 'baby', 'ganesha', 'agni', 'deer', 'naga', 'baby', 'pot', 'flat']) {
    const m = c.measure?.[key];
    if (!m) { errors.push(`missing measure ${key}`); continue; }
    for (const f of ['standing', 'seated', 'eye', 'eyeSeated', 'head', 'halfWidth']) if (!(m[f] > 0)) errors.push(`${key}.${f} is not positive`);
  }
  return { ok: errors.length === 0, errors, sets: c.sets.length, marks: c.sets.reduce((n, s) => n + s.marks.length, 0), volumes: Object.values(c.keepout ?? {}).reduce((n, v) => n + v.length, 0), measures: Object.keys(c.measure ?? {}).length };
}
