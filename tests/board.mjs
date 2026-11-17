// Board writer helpers: slim per-shot schema size and the measured repair loop (mock measure).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { repairShot, shotSchema } from '../cli/src/stages/board.js';

export async function runBoardTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const cast = { characters: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  const planShot = { id: 'S1', lines: [0], start: '0:0', set: 'hermitage', light: 'day', characters: ['a', 'b'], mustShow: ['hermitage.clearing'], action: 'two shot', keys: [{ at: '0:0', size: 'wide', on: ['a', 'b'], angle: 'eye', side: 'front', move: 'push' }] };
  const schema = shotSchema(planShot, cast, catalog);
  const bytes = JSON.stringify(schema).length;
  ok('per-shot schema <= 20 KB', bytes <= 20 * 1024, `${bytes} bytes`);
  ok('per-shot schema restricts cast', JSON.stringify(schema.properties.actors.items.properties.cast.enum) === '["a","b"]', JSON.stringify(schema.properties.actors.items.properties.cast.enum));

  const base = { id: 'bad' }, good = { id: 'good' };
  const fail = async (s) => (s === good ? [] : ['edge a']);
  const pass = await repairShot({ base, variants: [base, good], measure: fail });
  ok('repair fails then passes', pass.best === good && pass.rounds === 3 && pass.escalated && !pass.needsHuman, JSON.stringify(pass));
  const stuck = await repairShot({ base, variants: [base, base, base], measure: async () => ['edge a'], maxRounds: 3 });
  ok('repair escalates and needs human', stuck.needsHuman && stuck.escalated && stuck.rounds === 3, JSON.stringify(stuck));
  const quick = await repairShot({ base, variants: [], measure: async () => ['edge a'], maxRounds: 3 });
  ok('repair needs human after one round', quick.needsHuman && !quick.escalated && quick.rounds === 1, JSON.stringify(quick));
  return { ok: errors.length === 0, errors, checks };
}
