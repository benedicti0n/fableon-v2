// Look-dev sheet: render each scene's key frame in three candidate moods so the user can choose the lighting.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { findPython, ROOT, run } from './env.js';
import { makeContext } from './frames.js';
import { moodForLight } from './look.js';

const ALTS = {
  'golden-glow': ['warm-side', 'dusk'],
  'warm-side': ['golden-glow', 'noon'],
  dusk: ['golden-glow', 'night-moon'],
  'night-moon': ['dusk', 'golden-glow'],
  noon: ['warm-side', 'golden-glow'],
};

export async function lookdevCommand(dirArg, outArg = null) {
  const dir = dirArg;
  const boardPath = join(dir, 'board.json');
  const sbPath = join(dir, 'storyboard.json');
  if (!existsSync(boardPath) || !existsSync(sbPath)) throw new Error('lookdev needs board.json and storyboard.json (run: fableon board --project <dir>)');
  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  const sb = JSON.parse(readFileSync(sbPath, 'utf8'));
  const ctx = makeContext(dir);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const outDir = outArg ?? join(ROOT, 'docs', 'reports', 'phase-3f');
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-lookdev-'));
  const cells = [];
  try {
    copyFileSync(join(dir, 'words.json'), join(tmp, 'words.json'));
    const counts = (board.shots ?? []).reduce((m, s) => m.set(s.id, (m.get(s.id) ?? 0) + 1), new Map());
    for (const [idx, shot] of (board.shots ?? []).entries()) {
      const sceneLabel = counts.get(shot.id) > 1 ? `${shot.id} @ ${shot.start}` : shot.id;
      const start = ctx.anchor(shot.start);
      const end = shot.end && shot.end !== 'end' ? ctx.anchor(shot.end, start) : ctx.anchor({ end: true });
      const first = ctx.anchor(shot.camera?.[0]?.at ?? shot.start, start);
      const frame = Math.min(Math.max(start, first + 30), Math.max(start, end - 2));
      const pick = shot.look?.mood ?? moodForLight(shot.light);
      const moods = [pick, ...(ALTS[pick] ?? [])].filter((m, i, a) => a.indexOf(m) === i).slice(0, 3);
      for (const mood of moods) {
        const variant = JSON.parse(JSON.stringify(sb));
        if (variant.shots?.[idx]) variant.shots[idx].look = { mood };
        writeFileSync(join(tmp, 'storyboard.json'), JSON.stringify(variant));
        const prefix = join(tmp, `${shot.id}-${mood}-`);
        await run(process.execPath, [join(ROOT, 'engine', 'scripts', 'render.cjs'), 'stills', '--project', tmp, '--frames', String(frame), '--out', prefix, '--size', '540x960', '--msaa', '0'], { cwd: ROOT });
        const file = `${prefix}${frame}.jpg`;
        if (!existsSync(file)) throw new Error(`lookdev did not render ${shot.id} / ${mood}`);
        cells.push({ scene: sceneLabel, mood, pick: mood === pick, frame, path: file });
      }
    }
    const manifest = join(tmp, 'lookdev.json');
    writeFileSync(manifest, JSON.stringify({ title: project.title ?? project.id, out: join(outDir, `lookdev-${project.id}.jpg`), cells }, null, 2));
    const py = findPython();
    if (!py) throw new Error('lookdev sheet needs Python/Pillow');
    await run(py, [join(ROOT, 'tools', 'qa', 'lookdev_sheet.py'), manifest], { cwd: ROOT });
    const out = join(outDir, `lookdev-${project.id}.jpg`);
    return { out, cells, scenes: [...new Set(cells.map((c) => c.scene))] };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
