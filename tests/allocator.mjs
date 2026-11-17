// Deterministic allocator: model content in, statistical film grammar out.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { allocatePlan } from '../cli/src/allocator.js';

export function runAllocatorTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const words = Array.from({ length: 30 }, (_, i) => ({ w: `w${i}`, a: i * 0.33, b: i * 0.33 + 0.25, line: Math.floor(i / 3) }));
  const script = { lines: Array.from({ length: 10 }, (_, n) => ({ n, beat: n === 0 ? 'hook' : n === 4 ? 'mystery' : n === 9 ? 'payoff' : 'escalation', text: words.filter((w) => w.line === n).map((w) => w.w).join(' '), look: { who: [] } })) };
  const plan = { version: 1, shots: Array.from({ length: 10 }, (_, i) => ({
    id: `S${i + 1}`, lines: [i], start: `${i}:0`, set: 'village', light: 'day', characters: ['savitri'], mustShow: ['village.front'],
    keys: [{ at: `${i}:0`, size: 'medium', on: ['savitri'], angle: 'eye', side: 'front', move: 'push' }],
    beats: [], fx: [],
  })) };
  const { stats } = allocatePlan(plan, { script, words, catalog });
  ok('allocator DOF 25-40', stats.dofShare >= 0.25 && stats.dofShare <= 0.40, JSON.stringify(stats));
  ok('allocator hold 70-85', stats.holdShare >= 0.70 && stats.holdShare <= 0.85, JSON.stringify(stats));
  ok('allocator foreground 25-40', stats.foregroundShare >= 0.25 && stats.foregroundShare <= 0.40, JSON.stringify(stats));
  ok('allocator cuts <=2', stats.cuts <= 2, JSON.stringify(stats));
  ok('allocator flash after hook', stats.flashes === 1 && plan.shots.some((s) => s.transition?.type === 'flash'), JSON.stringify(stats));
  ok('allocator low heights', plan.shots.flatMap((s) => s.keys).filter((k) => k.size === 'full').every((k) => k.angle === 'low'), JSON.stringify(plan.shots.flatMap((s) => s.keys).map((k) => [k.size, k.angle])));
  ok('allocator punches required lines', [0, 4, 9].every((n) => plan.shots.some((s) => s.lines.includes(n) && s.keys.some((k) => k.punch?.startsWith(`${n}:`)))), JSON.stringify(plan.shots.map((s) => [s.lines, s.keys.map((k) => k.punch)])));
  return { ok: errors.length === 0, errors, checks };
}
