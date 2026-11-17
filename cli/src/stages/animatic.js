// Animatic stage: preview segments + voice only, then the same short_qa report.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync as writeFile } from 'node:fs';
import { join } from 'node:path';
import { findPython, ROOT, run } from '../env.js';
import { renderCommand, shotsCommand } from '../pipeline.js';
import { makeContext } from '../frames.js';

export async function runAnimatic({ projectDir }) {
  const shots = join(projectDir, 'shots.json');
  await shotsCommand(projectDir);
  if (!existsSync(shots)) throw new Error('animatic: shots.json was not written');
  await renderCommand(projectDir, { qualityName: 'preview', workers: 2 });
  const rows = JSON.parse(readFileSync(shots, 'utf8'));
  const render = join(projectDir, 'render');
  const list = join(render, 'animatic-concat.txt');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(list, rows.map(([id]) => `file 'seg_${String(id).padStart(2, '0')}.mp4'\n`).join(''));
  const noaudio = join(render, 'animatic_noaudio.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', noaudio], { cwd: ROOT });
  const video = join(projectDir, 'animatic.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', noaudio, '-i', join(projectDir, 'voice.wav'), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', video], { cwd: ROOT });
  const py = findPython();
  if (!py) throw new Error('animatic QA needs Python/Pillow (set FABLEON_PYTHON or create .venv)');
  const qaDir = join(projectDir, 'animatic-qa');
  mkdirSync(qaDir, { recursive: true });
  const metaRaw = JSON.parse(readFileSync(join(projectDir, 'qa_meta.json'), 'utf8'));
  const ctx = makeContext(projectDir);
  const planned = [...(metaRaw.planned ?? [])];
  const xfade = [...(metaRaw.xfade ?? [])];
  const eventsPath = existsSync(join(projectDir, 'events.json')) ? join(projectDir, 'events.json') : join(projectDir, 'cuts.json');
  const events = existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, 'utf8')) : [];
  for (const e of events) if (e > 10) xfade.push([e - 10, e]);
  for (const shot of ctx.sb.shots ?? []) {
    const start = ctx.anchor(shot.start);
    for (const k of shot.camera ?? []) if (k.cut) { const f = ctx.anchor(k.at, start); planned.push([f, f]); }
    if (start > 10) xfade.push([start - 10, start]);
  }
  const meta = join(projectDir, 'animatic-qa-meta.json');
  writeFile(meta, JSON.stringify({ ...metaRaw, planned, xfade }, null, 2) + '\n');
  await run(py, [join(ROOT, 'tools', 'qa', 'short_qa.py'), video, qaDir, meta], { cwd: ROOT });
  const report = readFileSync(join(qaDir, 'report.md'), 'utf8');
  const lines = report.split('\n');
  const get = (p) => lines.find((l) => l.startsWith(p)) ?? '';
  const framesLine = get('FRAMES '), popsLine = get('POPS ');
  const framesList = (t) => { const i = t.indexOf('['); if (i < 0) return []; try { return JSON.parse(t.slice(i)); } catch { return []; } };
  const black = framesList((/black (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const white = framesList((/white (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const frozen = framesList((/frozen spans >=12f (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const pops = framesList(popsLine);
  const unexplained = pops.filter((p) => !events.some((c) => Math.abs(c - p) <= 1));
  const ok = !black.length && !white.length && !frozen.length && !unexplained.length;
  const summary = ['# Animatic QA', '', `- ${get('SPECS ')}`, `- ${get('LOUDNESS ')}`, `- ${framesLine}`, `- planned events ignored (±1 frame): ${events.length} frames from ${eventsPath}`, `- pops reported by QA: ${pops.length ? pops.join(', ') : 'none'}`, `- unexplained pops: ${unexplained.length ? unexplained.join(', ') : 'none'}`, '', `Verdict: ${ok ? 'PASS' : 'FAIL'} (black ${black.length}, unplanned white ${white.length}, frozen spans ${frozen.length}, unexplained pops ${unexplained.length})`, ''].join('\n');
  writeFile(join(projectDir, 'animatic-qa.md'), report + '\n\n' + summary);
  return { video, qa: join(projectDir, 'animatic-qa.md'), specs: get('SPECS '), frames: framesLine, pops: popsLine, verdict: ok ? 'PASS' : 'FAIL' };
}
