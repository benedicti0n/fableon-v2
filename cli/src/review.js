// `fableon review`: labelled side-by-side stills for selected shots (start/mid/end) using `render.cjs` + PIL.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { RENDER_CJS, ROOT, findPython, run } from './env.js';
import { projectDir, requireFile } from './project.js';

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));

export async function reviewCommand(dirArg, compareArg, shotsCsv, outArg) {
  const dir = projectDir(dirArg);
  const compare = compareArg ? projectDir(compareArg) : null;
  const shots = readJSON(requireFile(dir, 'shots.json', 'run: fableon shots --project <dir>'));
  const sb = readJSON(requireFile(dir, 'storyboard.json'));
  const ids = (sb.shots ?? []).map((s) => s.id);
  const rows = shots.map(([n, a, b], i) => ({ id: ids[i] ?? String(n), n, a, b }));
  const wanted = shotsCsv ? new Set(String(shotsCsv).split(',').map((s) => s.trim())) : null;
  const chosen = rows.filter((s) => !wanted || wanted.has(s.id) || wanted.has(String(s.n)));
  if (!chosen.length) throw new Error(`no shots matched --shots ${shotsCsv}`);
  const frames = chosen.flatMap(({ a, b }) => [a, Math.floor((a + b) / 2), b - 1]);
  const base = join(ROOT, 'work', 'review', dir.split(/[\\/]/).pop());
  mkdirSync(base, { recursive: true });
  const left = join(base, 'left_');
  const right = join(base, 'right_');
  await run(process.execPath, [RENDER_CJS, 'stills', '--out', left, '--frames', frames.join(','), '--project', dir, '--size', '270x480', '--msaa', '0', '--jpeg', '0.92'], { cwd: ROOT });
  if (compare) await run(process.execPath, [RENDER_CJS, 'stills', '--out', right, '--frames', frames.join(','), '--project', compare, '--size', '270x480', '--msaa', '0', '--jpeg', '0.92'], { cwd: ROOT });
  const out = outArg ? (isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg)) : join(base, 'sheet.jpg');
  mkdirSync(dirname(out), { recursive: true });
  const manifest = join(base, 'review.json');
  writeFileSync(manifest, JSON.stringify({ left, right: compare ? right : null, out, shots: chosen.map(({ id, a, b }) => ({ id, frames: [a, Math.floor((a + b) / 2), b - 1] })) }, null, 2));
  const py = findPython();
  if (!py) throw new Error('review needs Python/Pillow (set FABLEON_PYTHON or create .venv)');
  await run(py, [join(ROOT, 'tools', 'qa', 'review_sheet.py'), manifest], { cwd: ROOT });
  console.log(`review: ${out}`);
  return { out, manifest };
}
