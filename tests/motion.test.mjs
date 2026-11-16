// Unit tests for the pure motion math (path easing, ballistic, walk phase, bob, screen offsets).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ENGINE } from '../cli/src/env.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

export async function runMotionTests() {
  console.log('\n== motion math ==');
  const req = createRequire(join(ENGINE, 'package.json'));
  const { build } = req('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-motion-'));
  const out = join(tmp, 'motion.mjs');
  const checks = [];
  try {
    await build({ entryPoints: [join(ENGINE, 'src', 'core', 'motion.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
    const m = await import(pathToFileURL(out).href);
    const p = (name, ok, detail = '') => checks.push({ name, ok, detail });

    p('linear midpoint', m.samplePath([{ f: 0, v: [0, 0, 0] }, { f: 10, v: [10, 20, -10] }], 5).every((v, i) => near(v, [5, 10, -5][i])), JSON.stringify(m.samplePath([{ f: 0, v: [0, 0, 0] }, { f: 10, v: [10, 20, -10] }], 5)));
    p('clamped ends', JSON.stringify(m.samplePath([{ f: 10, v: [1, 2, 3] }, { f: 20, v: [4, 5, 6] }], 0)) === JSON.stringify([1, 2, 3]) && JSON.stringify(m.samplePath([{ f: 10, v: [1, 2, 3] }, { f: 20, v: [4, 5, 6] }], 99)) === JSON.stringify([4, 5, 6]));
    p('step ease', near(m.easeK('step', 0.99), 0) && near(m.easeK('step', 1), 1));
    p('smooth/glide monotone', m.easeK('smooth', 0.5) === 0.5 && m.easeK('glide', 0.5) === 0.5);
    const b = m.ballisticAt([0, 0, 0], [1, 2, 0], [0, -10, 0], 0.5);
    p('ballistic p0 + v·u + a·u²', near(b[0], 0.5) && near(b[1], -1.5) && near(b[2], 0), JSON.stringify(b));
    p('ballistic floor', near(m.ballisticAt([0, 0, 0], [0, 0, 0], [0, -10, 0], 1, -3)[1], -3));
    p('walk phase wraps', near(m.walkPhase(0.25, 2), 0.5) && near(m.walkPhase(1, 1), 0));
    p('bob sine', near(m.bobOffset(0.25, { amp: 2, freq: 1 }), 2) && near(m.bobOffset(0, { amp: 2, freq: 1 }), 0));
    const s = m.addScreen([1, 2, 3], [1, 0, 0], [0, 1, 0], [0, 0, 1], [2, 3, 4]);
    p('screen offset', JSON.stringify(s) === JSON.stringify([3, 5, 7]), JSON.stringify(s));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  const ok = checks.every((c) => c.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} motion math (${checks.filter((c) => c.ok).length}/${checks.length})`);
  return { ok, checks };
}
