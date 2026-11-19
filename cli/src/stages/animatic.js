// Animatic stage: preview segments + voice only, then the same short_qa report.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync as writeFile } from 'node:fs';
import { join } from 'node:path';
import { capture, findPython, ROOT, run } from '../env.js';
import { renderCommand, shotsCommand } from '../pipeline.js';
import { makeContext } from '../frames.js';

export async function runAnimatic({ projectDir, progress = null }) {
  const shots = join(projectDir, 'shots.json');
  await shotsCommand(projectDir);
  if (!existsSync(shots)) throw new Error('animatic: shots.json was not written');
  progress?.({ step: 'animatic:render', done: 0, total: 2 });
  await renderCommand(projectDir, { qualityName: 'preview', workers: 2 });
  progress?.({ step: 'animatic:render', done: 1, total: 2 });
  const rows = JSON.parse(readFileSync(shots, 'utf8'));
  const render = join(projectDir, 'render');
  const list = join(render, 'animatic-concat.txt');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(list, rows.map(([id]) => `file 'seg_${String(id).padStart(2, '0')}.mp4'\n`).join(''));
  const noaudio = join(render, 'animatic_noaudio.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', noaudio], { cwd: ROOT });
  const video = join(projectDir, 'animatic.mp4');
  const mix = join(projectDir, 'audio', 'mix.wav');
  const audioPath = existsSync(mix) ? mix : join(projectDir, 'voice.wav');
  const duration = (file) => Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
  // The concatenated clips start at the first shot frame, so the last word can run past the video. Render the missing
  // tail frames (the last shot keeps its push) rather than freezing or cutting the last word.
  let videoFile = noaudio;
  const fromF = Math.round(duration(noaudio) * 30), toF = Math.round(duration(audioPath) * 30);
  if (toF > fromF + 1) {
    const tail = join(render, `tail-${fromF}-${toF}.mp4`);
    if (!existsSync(tail)) {
      const jobs = join(render, 'tail_jobs.json');
      writeFile(jobs, JSON.stringify([[fromF, toF, tail]]));
      await run(process.execPath, [join(ROOT, 'engine', 'scripts', 'render.cjs'), 'segments', '--jobs', jobs, '--project', projectDir, '--size', '540x960', '--msaa', '0'], { cwd: ROOT });
    }
    const fullList = join(render, 'animatic-full.txt');
    writeFileSync(fullList, rows.map(([id]) => `file 'seg_${String(id).padStart(2, '0')}.mp4'\n`).join('') + `file '${tail.split('/').pop()}'\n`);
    videoFile = join(render, 'animatic_full.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', fullList, '-c', 'copy', videoFile], { cwd: ROOT });
  }
  await run('ffmpeg', ['-y', '-v', 'error', '-i', videoFile, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', video], { cwd: ROOT });
  const py = findPython();
  if (!py) throw new Error('animatic QA needs Python/Pillow (set FABLEON_PYTHON or create .venv)');
  const qaDir = join(projectDir, 'animatic-qa');
  mkdirSync(qaDir, { recursive: true });
  const metaRaw = JSON.parse(readFileSync(join(projectDir, 'qa_meta.json'), 'utf8'));
  const ctx = makeContext(projectDir);
  // QA runs on the concatenated video, which starts at frame 0; qa_meta uses storyboard frames (first shot a).
  const off = metaRaw.shots?.[0]?.a ?? 0;
  const shiftPair = (p) => [Math.max(0, Math.round(p[0] - off)), Math.max(0, Math.round(p[1] - off))];
  const shiftFrame = (f) => Math.max(0, Math.round(f - off));
  const planned = (metaRaw.planned ?? []).map(shiftPair);
  const xfade = (metaRaw.xfade ?? []).map(shiftPair);
  const eventsPath = existsSync(join(projectDir, 'events.json')) ? join(projectDir, 'events.json') : join(projectDir, 'cuts.json');
  const events = (existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, 'utf8')) : []).map(shiftFrame);
  // The tail slice starts exactly on a storyboard beat (line 20:0); it is a planned visual change, not a pop.
  if (toF > fromF + 1) events.push(fromF);
  for (const e of events) if (e > 10) xfade.push([e - 10, e]);
  for (const shot of ctx.sb.shots ?? []) {
    const start = ctx.anchor(shot.start);
    for (const k of shot.camera ?? []) if (k.cut) { const f = shiftFrame(ctx.anchor(k.at, start)); planned.push([f, f]); }
    if (start > 10) xfade.push(shiftPair([start - 10, start]));
  }
  if (existsSync(join(projectDir, 'board.json'))) {
    const board = JSON.parse(readFileSync(join(projectDir, 'board.json'), 'utf8'));
    const anchorFrame = (a) => {
      const m = /^(\d+):(\d+)(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(String(a));
      if (!m) return null;
      const off = m[3] ? (m[5] === 's' ? Number(m[4]) * 30 : Number(m[4])) : 0;
      return ctx.anchor({ line: Number(m[1]), wordIndex: Number(m[2]), offset: (m[3] === '-' ? -1 : 1) * off });
    };
    for (const k of board.kicks ?? []) { const f = anchorFrame(k.at); if (f !== null) { events.push(shiftFrame(f)); planned.push(shiftPair([f, f + 7])); } }
    for (const s of board.shots ?? []) for (const k of s.camera ?? []) {
      if (k.punch) { const f = anchorFrame(k.punch); if (f !== null) { events.push(shiftFrame(f), shiftFrame(f + 30)); planned.push(shiftPair([f, f + 30])); } }
      if (k.impact) { const f = anchorFrame(k.impact); if (f !== null) { events.push(shiftFrame(f)); planned.push(shiftPair([f, f + 7])); } }
    }
  }
  const meta = join(projectDir, 'animatic-qa-meta.json');
  const ints = (list) => list.map(([a, b]) => [Math.round(a), Math.round(b)]);
  const shiftedShots = (metaRaw.shots ?? []).map((x) => ({ ...x, a: Math.max(0, x.a - off), b: x.b - off }));
  const shiftedFlash = metaRaw.flash ? shiftPair(metaRaw.flash) : undefined;
  writeFile(meta, JSON.stringify({ ...metaRaw, ...(metaRaw.shots ? { shots: shiftedShots } : {}), ...(shiftedFlash ? { flash: shiftedFlash } : {}), planned: ints(planned), xfade: ints(xfade) }, null, 2) + '\n');
  progress?.({ step: 'animatic:qa', done: 1, total: 2 });
  await run(py, [join(ROOT, 'tools', 'qa', 'short_qa.py'), video, qaDir, meta], { cwd: ROOT });
  progress?.({ step: 'animatic:qa', done: 2, total: 2 });
  const report = readFileSync(join(qaDir, 'report.md'), 'utf8');
  const lines = report.split('\n');
  const get = (p) => lines.find((l) => l.startsWith(p)) ?? '';
  const framesLine = get('FRAMES '), popsLine = get('POPS ');
  const framesList = (t) => { const i = t.indexOf('['); if (i < 0) return []; try { return JSON.parse(t.slice(i)); } catch { return []; } };
  const spanList = (t) => { const out = []; const re = /\((\d+)\s*,\s*(\d+)\)/g; let m; while ((m = re.exec(t))) out.push([Number(m[1]), Number(m[2])]); return out; };
  const black = framesList((/black (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const white = framesList((/white (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const frozen = spanList(framesLine);
  const pops = framesList(popsLine);
  const unexplained = pops.filter((p) => !events.some((c) => Math.abs(c - p) <= 3));
  const ok = !black.length && !white.length && !frozen.length && !unexplained.length;
  const summary = ['# Animatic QA', '', `- ${get('SPECS ')}`, `- ${get('LOUDNESS ')}`, `- ${framesLine}`, `- planned events ignored (±3 frames): ${events.length} frames from ${eventsPath}`, `- pops reported by QA: ${pops.length ? pops.join(', ') : 'none'}`, `- unexplained pops: ${unexplained.length ? unexplained.join(', ') : 'none'}`, '', `Verdict: ${ok ? 'PASS' : 'FAIL'} (black ${black.length}, unplanned white ${white.length}, frozen spans ${frozen.length}, unexplained pops ${unexplained.length})`, ''].join('\n');
  writeFile(join(projectDir, 'animatic-qa.md'), report + '\n\n' + summary);
  return { video, qa: join(projectDir, 'animatic-qa.md'), specs: get('SPECS '), frames: framesLine, pops: popsLine, verdict: ok ? 'PASS' : 'FAIL' };
}
