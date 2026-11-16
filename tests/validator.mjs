// Validator acceptance: the fixture passes; three broken copies fail with the expected path + reason.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';

const BIN = join(ROOT, 'cli', 'bin', 'fableon.js');
const FIX = join(ROOT, 'fixtures', 'adi-parva');
const validate = (dir) => spawnSync(process.execPath, [BIN, 'validate', '--project', dir], { encoding: 'utf8' });

export async function runValidator() {
  console.log('\n== storyboard validator ==');
  const cases = [];
  const fixture = validate(FIX);
  cases.push({ name: 'fixture passes', ok: fixture.status === 0 && fixture.stdout.includes('validate: OK'), detail: (fixture.stdout || fixture.stderr).trim().split('\n').pop() });

  const tmp = mkdtempSync(join(tmpdir(), 'fableon-validate-'));
  try {
    const sb = JSON.parse(readFileSync(join(FIX, 'storyboard.json'), 'utf8'));
    const broken = [
      { name: 'unknown pose', expect: 'unknown pose "banana"', mutate: (x) => { x.shots[1].actors[0].pose = 'banana'; } },
      { name: 'planned special', expect: 'special "agni" is not implemented yet', mutate: (x) => { x.shots[1].actors[0].special = 'agni'; } },
      { name: 'word not in line', expect: 'no word 0:zzzz', mutate: (x) => { x.shots[0].start = { line: 0, word: 'zzzz' }; } },
      { name: 'decreasing shot starts', expect: 'is not after the previous start', mutate: (x) => { x.shots[2].start = { frame: 0 }; } },
    ];
    for (const [i, c] of broken.entries()) {
      const dir = join(tmp, `case${i}`);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(dir, { recursive: true });
      copyFileSync(join(FIX, 'words.json'), join(dir, 'words.json'));
      const x = JSON.parse(JSON.stringify(sb));
      c.mutate(x);
      writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(x));
      const r = validate(dir);
      const text = `${r.stdout}\n${r.stderr}`;
      cases.push({ name: c.name, ok: r.status !== 0 && text.includes(c.expect), detail: text.split('\n').find((l) => l.includes(c.expect))?.trim() ?? text.trim().split('\n').pop() });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  for (const c of cases) console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  const ok = cases.every((c) => c.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} validator (${cases.filter((c) => c.ok).length}/${cases.length})`);
  return { ok, cases };
}
