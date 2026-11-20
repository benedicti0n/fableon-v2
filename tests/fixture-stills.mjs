// Pre-Phase-7 fixture baselines: 3 final-quality stills each, native size, MAD <= 1.0.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, findPython, RENDER_CJS, ROOT, run } from '../cli/src/env.js';

const PLAN = { 'savitri-hi': [114, 937, 1953], 'bakasura-hi': [343, 1011, 1645] };

export async function runFixtureStills() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) return { ok: true, errors, checks: [{ name: 'fixture stills skipped', ok: true, detail: 'no python' }] };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-fixture-stills-'));
  try {
    for (const [name, frames] of Object.entries(PLAN)) {
      const dir = join(tmp, name);
      await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(dir, 'f_'), '--frames', frames.join(','), '--project', join(ROOT, 'fixtures', name), '--size', '1440x2560', '--msaa', '0'], { cwd: ROOT });
      const r = JSON.parse(capture(py, [join(ROOT, 'tests', 'compare_fixture_stills.py'), dir, join(ROOT, 'fixtures', name, 'reference-stills'), frames.join(',')]));
      for (const x of r.frames) ok(`${name} frame ${x.frame}`, x.mad <= 1.0, `MAD ${x.mad}, max ${x.max}`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
