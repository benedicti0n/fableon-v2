// `fableon diff --project <dir> --frame N [--shot ID]`: render one frame in legacy and storyboard mode, save the
// pixels, the structural state and a sorted structural report.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RENDER_CJS, ROOT, findPython, run } from './env.js';
import { projectDir, requireFile } from './project.js';

const PRIORITY = (p) => {
  if (/^states\[\d+\]\.camera|^states\[\d+\]\.light|^states\[\d+\]\.sun|^dof/.test(p)) return 0;
  if (/^layers/.test(p)) return 1;
  if (/^states\[\d+\]\.places/.test(p)) return 2;
  if (/^states\[\d+\]\.fx/.test(p)) return 3;
  if (/^states\[\d+\]\.dyn/.test(p)) return 4;
  return 5;
};

function flatten(a, b, path, out) {
  if (path.endsWith('.key')) return; // texture-pool cache identity only, not visual state
  if (typeof a !== typeof b) { out.push({ path, a, b }); return; }
  if (a === null || b === null || typeof a !== 'object') {
    if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-6) return;
    if (a !== b) out.push({ path, a, b });
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { out.push({ path: `${path}.length`, a: a?.length, b: b?.length }); return; }
    for (let i = 0; i < a.length; i++) flatten(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) flatten(a[k], b[k], path ? `${path}.${k}` : k, out);
}

export async function diffCommand(dirArg, frameArg, shotArg) {
  const dir = projectDir(dirArg);
  const frame = Number(frameArg);
  if (!Number.isInteger(frame) || frame < 0) throw new Error('diff needs --frame <n>');
  const py = findPython();
  if (!py) throw new Error('no Python found');
  const outDir = join(dir, 'diff', String(frame));
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-diff-'));
  const legacyDir = join(tmp, 'legacy');
  mkdirSync(legacyDir, { recursive: true });
  copyFileSync(requireFile(dir, 'words.json'), join(legacyDir, 'words.json'));
  const sizeArgs = ['--size', '540x960', '--msaa', '0'];
  try {
    await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(tmp, 'legacy_f_'), '--frames', String(frame), '--project', legacyDir, ...sizeArgs], { cwd: ROOT });
    await run(process.execPath, [RENDER_CJS, 'state', '--out', join(outDir, 'legacy.json'), '--frame', String(frame), '--project', legacyDir, ...sizeArgs], { cwd: ROOT });
    await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(tmp, 'story_f_'), '--frames', String(frame), '--project', dir, ...sizeArgs], { cwd: ROOT });
    await run(process.execPath, [RENDER_CJS, 'state', '--out', join(outDir, 'storyboard.json'), '--frame', String(frame), '--project', dir, ...sizeArgs], { cwd: ROOT });
    copyFileSync(join(tmp, `legacy_f_${frame}.jpg`), join(outDir, 'legacy.jpg'));
    copyFileSync(join(tmp, `story_f_${frame}.jpg`), join(outDir, 'storyboard.jpg'));
    await run(py, [join(ROOT, 'tools', 'qa', 'frame_diff.py'), join(outDir, 'legacy.jpg'), join(outDir, 'storyboard.jpg'), join(outDir, 'heat.png')], { cwd: ROOT });

    const a = JSON.parse(readFileSync(join(outDir, 'legacy.json'), 'utf8'));
    const b = JSON.parse(readFileSync(join(outDir, 'storyboard.json'), 'utf8'));
    const diffs = [];
    flatten(a, b, '', diffs);
    diffs.sort((x, y) => PRIORITY(x.path) - PRIORITY(y.path) || x.path.localeCompare(y.path));
    const lines = [
      `frame ${frame}${shotArg ? ` shot ${shotArg}` : ''}`,
      `layers legacy=${a.layers?.map((l) => `${l.id}:${l.alpha}`).join(',') || '-'} storyboard=${b.layers?.map((l) => `${l.id}:${l.alpha}`).join(',') || '-'}`,
      diffs.length ? `${diffs.length} structural difference(s), highest impact first (cache keys ignored):` : 'no structural differences (cache keys ignored)',
      ...diffs.slice(0, 200).map((d) => `${d.path}: legacy=${JSON.stringify(d.a)} storyboard=${JSON.stringify(d.b)}`),
    ];
    writeFileSync(join(outDir, 'report.txt'), lines.join('\n') + '\n');
    console.log(`diff: ${outDir}`);
    console.log(lines.slice(0, 3).join('\n'));
    if (diffs.length) console.log(`  first: ${lines[3]}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
