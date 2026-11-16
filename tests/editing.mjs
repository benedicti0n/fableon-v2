// Editing rules: short keys, late first keys and jump cuts on measured frames.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { compileBoard } from '../cli/src/authoring.js';
import { checkFramesMeasured } from '../cli/src/frames.js';

export async function runEditing() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const words = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'words.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const mk = (id, keys, end) => ({ version: 1, partial: true, cast: { kunti: { spec: 'C.kunti' } }, shots: [{ id, start: '13.Pandu', end, light: 'day', sets: ['village'], actors: [{ cast: 'kunti', id: 'kunti', at: 'village.front' }], camera: keys }] });
  const cases = {
    short: mk('A', [{ at: '13.Pandu', size: 'medium', on: ['kunti'], move: 'hold' }], 'shot+0.1s'),
    late: mk('B', [{ at: 'shot+1s', size: 'medium', on: ['kunti'], move: 'hold' }], 'shot+2s'),
    jump: mk('C', [{ at: '13.Pandu', size: 'medium', on: ['kunti'], move: 'hold' }, { at: 'shot+1s', size: 'medium', on: ['kunti'], move: 'hold', cut: true }], 'shot+2s'),
  };
  for (const [name, board] of Object.entries(cases)) {
    const tmp = mkdtempSync(join(tmpdir(), 'fableon-edit-'));
    try {
      const sb = compileBoard(board, words, catalog).storyboard;
      writeFileSync(join(tmp, 'words.json'), JSON.stringify(words));
      writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(sb));
      const r = await checkFramesMeasured(tmp);
      const code = name === 'short' ? 'key too short' : name === 'late' ? 'first key late' : 'jump cut';
      ok(`${name} rule`, r.errors.some((e) => e.code === code), JSON.stringify(r.errors.map((e) => e.code)));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  return { ok: errors.length === 0, errors, checks };
}
