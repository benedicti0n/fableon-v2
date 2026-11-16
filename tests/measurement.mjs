// Measurement fixes: sorted head boxes, silhouette edge checks and move sampling.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { checkFramesMeasured, sampleKeyFrames } from '../cli/src/frames.js';

export async function runMeasurement() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const moving = sampleKeyFrames({ move: 'tiltUp' }, 100, 160);
  const still = sampleKeyFrames({ cut: true }, 100, 160);
  ok('move sampling start/end', moving[0] === 100 && moving[moving.length - 1] === 158, JSON.stringify(moving));
  ok('static sampling settles', still[0] === 106 && still[still.length - 1] === 158, JSON.stringify(still));
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-measure-'));
  try {
    const fix = join(ROOT, 'fixtures', 'adi-parva');
    copyFileSync(join(fix, 'words.json'), join(tmp, 'words.json'));
    const sb = JSON.parse(readFileSync(join(fix, 'storyboard.json'), 'utf8'));
    sb.shots = sb.shots.filter((s) => s.id === 'S14');
    sb.shots[0].end = { frame: 1338 };
    for (const k of sb.shots[0].camera) k.semantic = true;
    sb.shots[0].camera[1].fov = 5;
    writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(sb, null, 2));
    const r = await checkFramesMeasured(tmp);
    ok('sage bun edge', r.errors.some((e) => e.code === 'edge' && e.subject === 'sage'), JSON.stringify(r.errors.slice(0, 2)));
    const boxes = r.rows.flatMap((row) => row.subjects ?? []).map((s) => s.headBox).filter(Boolean);
    ok('head boxes sorted', boxes.length > 0 && boxes.every((b) => b.x0 <= b.x1 && b.y0 <= b.y1), JSON.stringify(boxes.slice(0, 2)));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
