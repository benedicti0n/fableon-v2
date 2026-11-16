// Every storyboard shot start must resolve to the same frame as the fixture's shots.json (the old timeline).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { normalizeWord } from '../shared/words.mjs';

const norm = normalizeWord;

export function runStartAnchors() {
  console.log('\n== storyboard shot starts ==');
  const sb = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'storyboard.json'), 'utf8'));
  const words = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'words.json'), 'utf8'));
  const shots = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'adi-parva', 'shots.json'), 'utf8'));
  const fps = sb.fps ?? 30;
  const frame = (a) => {
    if (a.frame !== undefined) return a.frame + (a.offset ?? 0);
    const hits = words.filter((w) => w.line === a.line && norm(w.w) === norm(a.word));
    if (!hits[a.nth ?? 0]) throw new Error(`no word ${a.line}:${a.word}`);
    return Math.max(0, Math.round(hits[a.nth ?? 0].a * fps)) + (a.offset ?? 0);
  };
  const bad = [];
  const rows = sb.shots.map((s, i) => {
    const got = frame(s.start), want = shots[i][1];
    if (got !== want) bad.push(`${s.id}: ${got} != ${want}`);
    return { id: s.id, got, want };
  });
  for (const r of rows) console.log(`  ${r.id.padEnd(6)} frame ${String(r.got).padStart(4)} (expected ${r.want})`);
  const ok = bad.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} shot starts: ${rows.length} resolved${bad.length ? `; mismatches: ${bad.join(', ')}` : ''}`);
  return { ok, rows, bad };
}
