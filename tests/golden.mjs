// Golden-frame regression: one middle frame per shot, rendered from the storyboard at 270x480 / JPEG 92, compared
// with fixtures/adi-parva/golden/shot_XX.jpg (MAD <= 1.0 on 0-255 grayscale). Shots 29 and 30 (the D3 wheel
// exemption) were captured from storyboard mode, every other golden frame from the legacy renderer before deletion.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, RENDER_CJS, ROOT, findPython, run } from '../cli/src/env.js';

export const GOLDEN_LIMIT = 1.0;

export async function runGolden() {
  const py = findPython();
  const fix = join(ROOT, 'fixtures', 'adi-parva');
  const shots = JSON.parse(readFileSync(join(fix, 'shots.json'), 'utf8'));
  const pairs = shots.map(([id, a, b]) => [Math.floor((a + b) / 2), id]);
  const frames = pairs.map(([f]) => f);
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-golden-'));
  try {
    await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(tmp, 'f_'), '--frames', frames.join(','), '--project', fix, '--size', '270x480', '--msaa', '0', '--jpeg', '0.92'], { cwd: ROOT });
    const r = JSON.parse(capture(py, [join(ROOT, 'tests', 'compare_golden.py'), tmp, join(fix, 'golden'), pairs.map(([f, id]) => `${f}:${id}`).join(',')]));
    return { ...r, ok: r.max <= GOLDEN_LIMIT, frames: r.shots.length };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
