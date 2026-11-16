// `fableon review`: per-camera-key, settled stills with optional compare and coverage ID images.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { RENDER_CJS, ROOT, findPython, run } from './env.js';
import { projectDir } from './project.js';
import { checkFramesMeasured, makeContext } from './frames.js';

export async function reviewCommand(dirArg, compareArg, shotsCsv, outArg, opts = {}) {
  const dir = projectDir(dirArg);
  const compare = compareArg ? projectDir(compareArg) : null;
  const ctx = makeContext(dir);
  const shots = ctx.sb.shots ?? [];
  const wanted = shotsCsv ? new Set(String(shotsCsv).split(',').map((s) => s.trim())) : null;
  const rows = [], frames = [];
  for (let si = 0; si < shots.length; si++) {
    const shot = shots[si];
    if (wanted && !wanted.has(shot.id)) continue;
    const start = ctx.anchor(shot.start);
    const endShot = shot.end ? ctx.anchor(shot.end, start) : si + 1 < shots.length ? ctx.anchor(shots[si + 1].start) : ctx.END + (ctx.sb.tailFrames ?? 36);
    const keys = (shot.camera ?? []).map((k) => ({ k, f: ctx.anchor(k.at, start) })).sort((a, b) => a.f - b.f);
    keys.forEach(({ k, f: kf }, ki) => {
      const end = ki + 1 < keys.length ? keys[ki + 1].f : endShot;
      const xf = si && ki === 0 && shots[si - 1].light !== shot.light ? (ctx.sb.crossfade ?? 10) / 2 : 0;
      const finish = Math.max(k.cut ? 6 : 0, k.dur ?? 0, k.tiltDur ?? 0, xf);
      const settle = Math.min(Math.max(kf, end - 1), kf + finish);
      const last = Math.max(settle, end - 2);
      const framePair = [settle, last];
      frames.push(...framePair);
      rows.push({ shot: shot.id, key: ki, size: k.size ?? null, move: k.move ?? null, on: k.subjects ?? [], frames: framePair, label: `${shot.id} · key ${ki} · ${k.size ?? '-'}/${k.move ?? 'push'}/${(k.subjects ?? []).join('+') || (k.with ?? []).join('+') || 'scenery'}` });
    });
  }
  if (!rows.length) throw new Error(`no camera keys matched --shots ${shotsCsv}`);
  const base = join(ROOT, 'work', 'review', dir.split(/[\\/]/).pop());
  mkdirSync(base, { recursive: true });
  const left = join(base, 'left_'), right = join(base, 'right_'), cov = join(base, 'cov_');
  const uniq = [...new Set(frames)].sort((a, b) => a - b);
  await run(process.execPath, [RENDER_CJS, 'stills', '--out', left, '--frames', uniq.join(','), '--project', dir, '--size', '270x480', '--msaa', '0', '--jpeg', '0.92'], { cwd: ROOT });
  if (compare) await run(process.execPath, [RENDER_CJS, 'stills', '--out', right, '--frames', uniq.join(','), '--project', compare, '--size', '270x480', '--msaa', '0', '--jpeg', '0.92'], { cwd: ROOT });
  let covDir = null;
  if (opts.coverage) {
    covDir = cov;
    const jobs = uniq.map((f) => ({ frame: f, subjects: [], over: null, with: [] }));
    const jobsFile = join(base, 'coverage-jobs.json');
    writeFileSync(jobsFile, JSON.stringify(jobs));
    await run(process.execPath, [RENDER_CJS, 'coverage', '--jobs', jobsFile, '--out', join(base, 'coverage.json'), '--png', covDir, '--project', dir, '--size', '180x320', '--msaa', '0'], { cwd: ROOT });
  }
  let measured = null;
  try { measured = await checkFramesMeasured(dir); } catch { /* review still renders if measured check cannot run */ }
  const verdictFor = (r) => {
    const e = measured?.errors?.find((x) => x.shot === r.shot && x.key === r.key);
    if (e) return e.message;
    const w = measured?.warnings?.find((x) => x.shot === r.shot && x.key === r.key);
    return w ? `warn: ${w.message}` : 'OK';
  };
  for (const r of rows) r.verdict = verdictFor(r);
  const out = outArg ? (isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg)) : join(base, 'sheet.jpg');
  const split = !!opts.split;
  const sheet = split ? join(out, 'sheet.jpg') : out;
  mkdirSync(split ? out : dirname(sheet), { recursive: true });
  const manifest = join(base, 'review.json');
  const payload = { left, right: compare ? right : null, coverage: covDir, out: sheet, splitDir: split ? out : null, split, cover: !!opts.coverage, rows: rows.map((r) => ({ ...r, label: `${r.label} · f${r.frames[0]}/${r.frames[1]} · ${r.verdict}` })) };
  writeFileSync(manifest, JSON.stringify(payload, null, 2));
  const py = findPython();
  if (!py) throw new Error('review needs Python/Pillow (set FABLEON_PYTHON or create .venv)');
  await run(py, [join(ROOT, 'tools', 'qa', 'review_sheet.py'), manifest], { cwd: ROOT });
  console.log(`review: ${sheet}${split ? ` (+ per-shot images in ${out})` : ''}`);
  return { out: sheet, manifest, rows };
}
