// Partial boards require explicit ends and produce a v1 shot range without stretching to the next shot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT } from '../cli/src/env.js';
import { compileBoard } from '../cli/src/authoring.js';

export function runPartial() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const words = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'words.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const sbSchema = JSON.parse(readFileSync(join(ROOT, 'schema', 'storyboard.schema.json'), 'utf8'));
  const board = {
    version: 1, partial: true,
    cast: { kunti: { spec: 'C.kunti' } },
    shots: [
      { id: 'A', start: '5.Her', end: 'shot+1s', light: 'day', sets: ['village'], actors: [{ cast: 'kunti', at: 'village.front' }], camera: [{ at: '5.Her', size: 'medium', on: ['kunti'], move: 'hold' }] },
      { id: 'B', start: '12.A', end: 'shot+1s', light: 'day', sets: ['palace'], actors: [{ cast: 'kunti', at: 'palace.courtyard' }], camera: [{ at: '12.A', size: 'medium', on: ['kunti'], move: 'hold' }] },
    ],
  };
  const out = compileBoard(board, words, catalog).storyboard;
  ok('partial ends preserved', out.shots.length === 2 && out.shots.every((s) => s.end), JSON.stringify(out.shots.map((s) => s.end)));
  const valid = new Ajv2020({ allErrors: true, strict: false }).compile(sbSchema)(out);
  ok('partial validates as v1', valid);
  let msg = '';
  try { compileBoard({ ...board, shots: [board.shots[0], { ...board.shots[1], end: undefined }] }, words, catalog); } catch (e) { msg = e.message; }
  ok('partial needs end', /needs an explicit end/.test(msg), msg);
  return { ok: errors.length === 0, errors, checks };
}
