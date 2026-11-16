// Measured coverage checks: the hand-written S27 keys produce blocker/size warnings, not errors.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { checkFramesMeasured } from '../cli/src/frames.js';

export async function runMeasured() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-measured-'));
  try {
    const fix = join(ROOT, 'fixtures', 'adi-parva');
    copyFileSync(join(fix, 'words.json'), join(tmp, 'words.json'));
    const sb = JSON.parse(readFileSync(join(fix, 'storyboard.json'), 'utf8'));
    sb.shots = sb.shots.filter((s) => s.id === 'S27');
    sb.shots[0].end = { frame: 2673 };
    writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(sb, null, 2));
    const r = await checkFramesMeasured(tmp);
    ok('measured ran', r.measured && r.keys.length > 0, `${r.keys.length} keys`);
    ok('v1 findings are warnings', r.errors.length === 0, `${r.errors.length} errors`);
    ok('blocker measured', r.warnings.some((w) => w.code === 'blocker'), JSON.stringify(r.warnings.slice(0, 2)));
    ok('size measured', r.warnings.some((w) => w.code === 'subject too small' || w.code === 'subject too large'), 'no size warning');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
