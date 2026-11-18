// Phase 1 pipeline: init -> voice -> shots -> stills/render -> audio -> assemble -> qa (all against one project folder).
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ASSEMBLE_MJS, CLI, RENDER_CJS, ROOT, findPython, run } from './env.js';
import { assertProjectInputs, initProject, projectDir, quality, requireFile } from './project.js';
import { validateStoryboard } from './validate.js';
import { balance } from './jobs.js';

const pad = (n) => String(n).padStart(2, '0');
const frames = (segs) => segs.reduce((n, s) => n + s[1] - s[0], 0);

function readShots(dir) {
  const shots = JSON.parse(readFileSync(requireFile(dir, 'shots.json', 'run: fableon shots --project <dir>'), 'utf8'));
  if (!Array.isArray(shots) || !shots.length) throw new Error(`${join(dir, 'shots.json')} is empty or malformed`);
  return shots;
}

/** Validate the project's storyboard before touching the engine. */
function prepare(dir) {
  const r = validateStoryboard(dir);
  if (!r.ok) throw new Error(`storyboard validation failed (${r.errors.length} error(s)); fix them before rendering`);
  assertProjectInputs(dir);
}

function shotRows(dir) {
  const rows = readShots(dir);
  const sb = JSON.parse(readFileSync(requireFile(dir, 'storyboard.json'), 'utf8'));
  const ids = (sb.shots ?? []).map((s) => s.id);
  return rows.map(([n, a, b], i) => ({ id: ids[i] ?? String(n), n, a, b }));
}

function segments(dir, shots) {
  return shots.map(([id, a, b]) => [a, b, join(dir, 'render', `seg_${pad(id)}.mp4`)]);
}

function renderArgs(dir, ...extra) {
  return [RENDER_CJS, ...extra, '--project', dir, '--size', '540x960', '--msaa', '0'];
}

async function writeMeta(dir) {
  await run(process.execPath, renderArgs(dir, 'list', '--out', join(dir, 'shots.json')), { cwd: ROOT });
  await run(process.execPath, renderArgs(dir, 'qa', '--out', join(dir, 'qa_meta.json')), { cwd: ROOT });
  await run(process.execPath, renderArgs(dir, 'cuts', '--out', join(dir, 'cuts.json')), { cwd: ROOT });
  await run(process.execPath, renderArgs(dir, 'events', '--out', join(dir, 'events.json')), { cwd: ROOT });
}

export async function shotsCommand(dirArg) {
  const dir = projectDir(dirArg);
  prepare(dir);
  await writeMeta(dir);
  console.log(`shots: wrote shots.json, qa_meta.json, cuts.json in ${dir}`);
}

export async function initCommand(name, from) {
  const r = initProject(name, from);
  console.log(`init: ${r.dir} (${r.copied.length} files from ${r.from})`);
  for (const f of r.copied) console.log(`  ${f}`);
}

export async function stillsCommand(dirArg, framesCsv, qualityName, shotsCsv) {
  const dir = projectDir(dirArg);
  prepare(dir);
  const q = quality(qualityName);
  let frames = framesCsv;
  if (shotsCsv) {
    const wanted = new Set(shotsCsv.split(',').map((s) => s.trim()).filter(Boolean));
    const shots = shotRows(dir).filter((s) => wanted.has(s.id) || wanted.has(String(s.n)));
    if (!shots.length) throw new Error(`no shots matched --shots ${shotsCsv}`);
    const tokens = (framesCsv ?? 'start,mid,end').split(',').map((s) => s.trim()).filter(Boolean);
    const list = [];
    for (const { a, b } of shots) for (const t of tokens) {
      const f = t === 'start' ? a : t === 'mid' ? Math.floor((a + b) / 2) : t === 'end' ? b - 1 : Number(t);
      if (!Number.isFinite(f)) throw new Error(`bad frame token "${t}" (use start, mid, end or a number)`);
      list.push(f);
    }
    frames = [...new Set(list)].join(',');
  }
  if (!frames) throw new Error('missing --frames 60,640');
  await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(dir, 'stills', 'f_'), '--frames', frames, '--project', dir, '--size', q.size, '--msaa', '0'], { cwd: ROOT });
  console.log(`stills: wrote ${join(dir, 'stills')}`);
}

function worker(dir, jobsFile, q, i) {
  const child = spawn(process.execPath, [RENDER_CJS, 'segments', '--jobs', jobsFile, '--project', dir, '--size', q.size, '--msaa', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const relay = (stream, tag) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) if (l.trim()) console.log(`${tag} ${l}`);
    });
  };
  relay(child.stdout, `[w${i}]`);
  relay(child.stderr, `[w${i}]!`);
  return child;
}

async function workers(dir, segs, q, n) {
  const { lists, load } = balance(segs, n);
  const jobs = lists.map((list, k) => {
    const f = join(dir, 'render', `jobs_${k}.json`);
    writeFileSync(f, JSON.stringify(list));
    return f;
  });
  console.log(`render: ${segs.length} clips, ${frames(segs)} frames, ${n} worker(s) [${load.join(' + ')} frames]`);
  const total = frames(segs), doneAtStart = segs.filter((s) => existsSync(s[2])).reduce((a, s) => a + s[1] - s[0], 0);
  const t0 = Date.now();
  const kids = jobs.map((f, i) => worker(dir, f, q, i));
  const timer = setInterval(() => {
    const done = segs.filter((s) => existsSync(s[2])).reduce((a, s) => a + s[1] - s[0], 0);
    const made = done - doneAtStart, elapsed = (Date.now() - t0) / 1000;
    const eta = made > 0 && done < total ? ` ETA ${Math.round((elapsed / made) * (total - done))}s` : '';
    console.log(`render: ${done}/${total} frames (${Math.round((100 * done) / total)}%), ${Math.round(elapsed)}s elapsed${eta}`);
  }, 5000);
  const kill = () => kids.forEach((k) => { try { k.kill(); } catch {} });
  const onInt = () => { kill(); clearInterval(timer); console.error('\nrender: interrupted (start with --detach to survive)'); process.exit(130); };
  process.once('SIGINT', onInt);
  const codes = await Promise.all(kids.map((k) => new Promise((r) => k.on('close', r))));
  clearInterval(timer);
  process.removeListener('SIGINT', onInt);
  if (codes.some((c) => c !== 0)) { kill(); throw new Error(`render worker failed (exit ${codes.join(', ')})`); }
  const missing = segs.filter((s) => !existsSync(s[2]));
  if (missing.length) throw new Error(`render finished but ${missing.length} clip(s) are missing: ${missing.map((s) => s[2]).join(', ')}`);
}

export async function renderCommand(dirArg, { qualityName = 'preview', workers: n = 2, detach = false, shots: shotFilter = null } = {}) {
  const dir = projectDir(dirArg);
  prepare(dir);
  const q = quality(qualityName);
  if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error('--workers must be an integer 1..16');
  const wanted = shotFilter ? new Set(String(shotFilter).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  let all = readShots(dir);
  if (wanted) {
    const rows = shotRows(dir).filter((s) => wanted.has(s.id) || wanted.has(String(s.n)));
    if (!rows.length) throw new Error(`no shots matched --shots ${shotFilter}`);
    const nums = new Set(rows.map((s) => s.n));
    all = all.filter(([id]) => nums.has(id));
  }
  const segs = segments(dir, all);
  const renderDir = join(dir, 'render');
  mkdirSync(renderDir, { recursive: true });
  for (const f of readdirSync(renderDir)) if (f.endsWith('.part.mp4')) rmSync(join(renderDir, f));
  const missing = segs.filter((s) => !existsSync(s[2]));
  if (!missing.length) { console.log(`render: all ${segs.length} clips exist, nothing to do`); return; }
  if (detach) {
    const log = join(renderDir, 'render.log');
    const out = openSync(log, 'a');
    const child = spawn(process.execPath, [join(CLI, 'bin', 'fableon.js'), 'render', '--project', dir, '--quality', qualityName, '--workers', String(n), ...(shotFilter ? ['--shots', shotFilter] : [])], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    child.unref();
    console.log(`render: detached pid ${child.pid}; log ${log}`);
    console.log(`render: follow with: tail -f ${log}`);
    return;
  }
  await workers(dir, missing, q, n);
}

export async function audioCommand(dirArg) {
  const dir = projectDir(dirArg);
  assertProjectInputs(dir);
  const py = findPython();
  if (!py) throw new Error('no Python found (set FABLEON_PYTHON or create .venv)');
  const script = existsSync(join(dir, 'cues.json')) ? 'cues_mix.py' : 'mix.py';
  await run(py, [join(ROOT, 'audio', script)], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
  if (!existsSync(join(dir, 'audio', 'mix.wav'))) throw new Error(`audio: ${join(dir, 'audio', 'mix.wav')} was not written`);
  console.log(`audio: wrote ${join(dir, 'audio', 'mix.wav')}`);
}

export async function assembleCommand(dirArg) {
  const dir = projectDir(dirArg);
  requireFile(dir, 'shots.json');
  requireFile(join(dir, 'audio'), 'mix.wav', 'run: fableon audio --project <dir>');
  const shots = readShots(dir);
  const missing = segments(dir, shots).filter((s) => !existsSync(s[2]));
  if (missing.length) throw new Error(`assemble: ${missing.length} clip(s) missing (run: fableon render --project ${dir}); first: ${missing[0][2]}`);
  await run(process.execPath, [ASSEMBLE_MJS, '--project', dir], { cwd: ROOT });
  console.log(`assemble: wrote ${join(dir, 'final.mp4')}`);
}

const listOf = (text) => {
  const i = text.indexOf('[');
  if (i < 0) return [];
  try { return JSON.parse(text.slice(i)); } catch { return []; }
};



export async function qaCommand(dirArg) {
  const dir = projectDir(dirArg);
  const py = findPython();
  if (!py) throw new Error('no Python found (set FABLEON_PYTHON or create .venv)');
  requireFile(dir, 'final.mp4', 'run: fableon assemble --project <dir>');
  const metaPath = requireFile(dir, 'qa_meta.json', 'run: fableon shots --project <dir>');
  const out = join(dir, 'qa');
  mkdirSync(out, { recursive: true });
  const rawMeta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const off = rawMeta.shots?.[0]?.a ?? 0;
  const shiftPair = (p) => [Math.max(0, Math.round(p[0] - off)), Math.max(0, Math.round(p[1] - off))];
  const meta = { ...rawMeta, shots: (rawMeta.shots ?? []).map((s) => ({ ...s, a: Math.max(0, s.a - off), b: s.b - off })), ...(rawMeta.flash ? { flash: shiftPair(rawMeta.flash) } : {}), xfade: (rawMeta.xfade ?? []).map(shiftPair), planned: (rawMeta.planned ?? []).map(shiftPair) };
  const metaVideo = join(out, 'qa_meta.video.json');
  writeFileSync(metaVideo, JSON.stringify(meta, null, 2) + '\n');
  await run(py, [join(ROOT, 'tools', 'qa', 'short_qa.py'), join(dir, 'final.mp4'), out, metaVideo], { cwd: ROOT });
  let voiceOk = true;
  if (existsSync(join(dir, 'voice.wav')) && existsSync(join(dir, 'words.json'))) {
    try { await run(py, [join(ROOT, 'tools', 'qa', 'voice_qa.py'), dir], { cwd: ROOT }); }
    catch { voiceOk = false; }
  }
  const report = readFileSync(join(out, 'report.md'), 'utf8').split('\n');
  const line = (p) => report.find((l) => l.startsWith(p)) || '';
  const specs = line('SPECS '), loudness = line('LOUDNESS '), framesLine = line('FRAMES '), popsLine = line('POPS ');
  const eventsPath = existsSync(join(dir, 'events.json')) ? join(dir, 'events.json') : join(dir, 'cuts.json');
  const events = (existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, 'utf8')) : []).map((f) => Math.max(0, f - off));
  const pops = listOf(popsLine);
  const unexplained = pops.filter((p) => !events.some((c) => Math.abs(c - p) <= 3));
  const black = listOf((/black (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const white = listOf((/white (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const spanList = (t) => { const out = []; const re = /\((\d+)\s*,\s*(\d+)\)/g; let m; while ((m = re.exec(t))) out.push([Number(m[1]), Number(m[2])]); return out; };
  const frozen = spanList(framesLine);
  const ok = !black.length && !white.length && !frozen.length && !unexplained.length && voiceOk;
  const md = [
    '# QA summary',
    '',
    `- ${specs}`,
    `- ${loudness}`,
    `- ${framesLine}`,
    `- planned events ignored (±3 frames; concat/encode has a 2-frame start offset): ${events.length} frames from ${existsSync(join(dir, 'events.json')) ? 'events.json' : 'cuts.json'}`,
    `- pops reported by QA: ${pops.length ? pops.join(', ') : 'none'}`,
    `- unexplained pops: ${unexplained.length ? unexplained.join(', ') : 'none'}`,
    '',
    `- voice QA: ${voiceOk ? 'PASS' : 'FAIL'} (${join(dir, 'voice-qa.md')})`,
    `Verdict: ${ok ? 'PASS' : 'FAIL'} (black ${black.length}, unplanned white ${white.length}, frozen spans ${frozen.length}, unexplained pops ${unexplained.length}, voice ${voiceOk ? 'pass' : 'fail'})`,
  ].join('\n');
  writeFileSync(join(out, 'summary.md'), md + '\n');
  console.log(md);
  console.log(`\nqa: wrote ${join(out, 'summary.md')}`);
  if (!ok) process.exitCode = 1;
}

export async function voiceCommand(dirArg, speed, voice) {
  const dir = projectDir(dirArg);
  const py = findPython();
  if (!py) throw new Error('no Python found (set FABLEON_PYTHON or create .venv)');
  requireFile(dir, 'SCRIPT.md');
  await run(py, [join(ROOT, 'voice', 'make_voice.py'), String(speed), voice], { cwd: join(ROOT, 'voice'), env: { ...process.env, PROJECT_DIR: dir } });
}

export async function allCommand(dirArg, { qualityName = 'preview', workers: n = 2 } = {}) {
  const dir = projectDir(dirArg);
  console.log(`all: ${dir} (${qualityName}, ${n} workers)\n>> shots`);
  await shotsCommand(dir);
  console.log('\n>> render');
  await renderCommand(dir, { qualityName, workers: n });
  console.log('\n>> audio');
  await audioCommand(dir);
  console.log('\n>> assemble');
  await assembleCommand(dir);
  console.log('\n>> qa');
  await qaCommand(dir);
  console.log(`\nall: done — ${join(dir, 'final.mp4')}`);
}
