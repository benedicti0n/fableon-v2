// Phase 1 pipeline: init -> voice -> shots -> stills/render -> audio -> assemble -> qa (all against one project folder).
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ASSEMBLE_MJS, CLI, RENDER_CJS, ROOT, findPython, run } from './env.js';
import { assertFixtureTimeline, initProject, projectDir, quality, requireFile } from './project.js';
import { balance } from './jobs.js';

const pad = (n) => String(n).padStart(2, '0');
const frames = (segs) => segs.reduce((n, s) => n + s[1] - s[0], 0);

function readShots(dir) {
  const shots = JSON.parse(readFileSync(requireFile(dir, 'shots.json', 'run: fableon shots --project <dir>'), 'utf8'));
  if (!Array.isArray(shots) || !shots.length) throw new Error(`${join(dir, 'shots.json')} is empty or malformed`);
  return shots;
}

function segments(dir, shots) {
  return shots.map(([id, a, b]) => [a, b, join(dir, 'render', `seg_${pad(id)}.mp4`)]);
}

function renderArgs(...extra) {
  return [RENDER_CJS, ...extra, '--size', '540x960', '--msaa', '0'];
}

async function writeMeta(dir) {
  await run(process.execPath, renderArgs('list', '--out', join(dir, 'shots.json')), { cwd: ROOT });
  await run(process.execPath, renderArgs('qa', '--out', join(dir, 'qa_meta.json')), { cwd: ROOT });
  await run(process.execPath, renderArgs('cuts', '--out', join(dir, 'cuts.json')), { cwd: ROOT });
}

export async function shotsCommand(dirArg) {
  const dir = projectDir(dirArg);
  assertFixtureTimeline(dir);
  await writeMeta(dir);
  console.log(`shots: wrote shots.json, qa_meta.json, cuts.json in ${dir}`);
}

export async function initCommand(name, from) {
  const r = initProject(name, from);
  console.log(`init: ${r.dir} (${r.copied.length} files from ${r.from})`);
  for (const f of r.copied) console.log(`  ${f}`);
}

export async function stillsCommand(dirArg, framesCsv, qualityName) {
  const dir = projectDir(dirArg);
  assertFixtureTimeline(dir);
  const q = quality(qualityName);
  if (!framesCsv) throw new Error('missing --frames 60,640');
  await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(dir, 'stills', 'f_'), '--frames', framesCsv, '--size', q.size, '--msaa', '0'], { cwd: ROOT });
  console.log(`stills: wrote ${join(dir, 'stills')}`);
}

function worker(dir, jobsFile, q, i) {
  const child = spawn(process.execPath, [RENDER_CJS, 'segments', '--jobs', jobsFile, '--size', q.size, '--msaa', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
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

export async function renderCommand(dirArg, { qualityName = 'preview', workers: n = 2, detach = false } = {}) {
  const dir = projectDir(dirArg);
  assertFixtureTimeline(dir);
  const q = quality(qualityName);
  if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error('--workers must be an integer 1..16');
  const segs = segments(dir, readShots(dir));
  const renderDir = join(dir, 'render');
  mkdirSync(renderDir, { recursive: true });
  for (const f of readdirSync(renderDir)) if (f.endsWith('.part.mp4')) rmSync(join(renderDir, f));
  const missing = segs.filter((s) => !existsSync(s[2]));
  if (!missing.length) { console.log(`render: all ${segs.length} clips exist, nothing to do`); return; }
  if (detach) {
    const log = join(renderDir, 'render.log');
    const out = openSync(log, 'a');
    const child = spawn(process.execPath, [join(CLI, 'bin', 'fableon.js'), 'render', '--project', dir, '--quality', qualityName, '--workers', String(n)], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    child.unref();
    console.log(`render: detached pid ${child.pid}; log ${log}`);
    console.log(`render: follow with: tail -f ${log}`);
    return;
  }
  await workers(dir, missing, q, n);
}

export async function audioCommand(dirArg) {
  const dir = projectDir(dirArg);
  assertFixtureTimeline(dir);
  const py = findPython();
  if (!py) throw new Error('no Python found (set FABLEON_PYTHON or create .venv)');
  await run(py, [join(ROOT, 'audio', 'mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
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

// Phase 1 fixture only: these three frame-diff spikes are intended impact pops from the prototype, not defects
// (named as acceptable in the phase prompt). Anything else is unexplained and fails the QA gate.
const KNOWN_POPS = new Set([1249, 2152, 2715]);

export async function qaCommand(dirArg) {
  const dir = projectDir(dirArg);
  const py = findPython();
  if (!py) throw new Error('no Python found (set FABLEON_PYTHON or create .venv)');
  requireFile(dir, 'final.mp4', 'run: fableon assemble --project <dir>');
  const meta = requireFile(dir, 'qa_meta.json', 'run: fableon shots --project <dir>');
  const out = join(dir, 'qa');
  mkdirSync(out, { recursive: true });
  await run(py, [join(ROOT, 'tools', 'qa', 'short_qa.py'), join(dir, 'final.mp4'), out, meta], { cwd: ROOT });
  const report = readFileSync(join(out, 'report.md'), 'utf8').split('\n');
  const line = (p) => report.find((l) => l.startsWith(p)) || '';
  const specs = line('SPECS '), loudness = line('LOUDNESS '), framesLine = line('FRAMES '), popsLine = line('POPS ');
  const cutsPath = join(dir, 'cuts.json');
  const cuts = existsSync(cutsPath) ? JSON.parse(readFileSync(cutsPath, 'utf8')) : [];
  const pops = listOf(popsLine);
  const known = pops.filter((p) => KNOWN_POPS.has(p));
  const unexplained = pops.filter((p) => !cuts.some((c) => Math.abs(c - p) <= 1) && !KNOWN_POPS.has(p));
  const black = listOf((/black (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const white = listOf((/white (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const frozen = listOf((/frozen spans >=12f (\[[^\]]*\])/.exec(framesLine) || [])[1] || '[]');
  const ok = !black.length && !white.length && !frozen.length && !unexplained.length;
  const md = [
    '# QA summary',
    '',
    `- ${specs}`,
    `- ${loudness}`,
    `- ${framesLine}`,
    `- planned camera cuts ignored (±1 frame): ${cuts.length} frames from cuts.json`,
    `- pops reported by QA: ${pops.length ? pops.join(', ') : 'none'}`,
    `- known intended pops (fixture): ${known.length ? known.join(', ') : 'none'}`,
    `- unexplained pops: ${unexplained.length ? unexplained.join(', ') : 'none'}`,
    '',
    `Verdict: ${ok ? 'PASS' : 'FAIL'} (black ${black.length}, unplanned white ${white.length}, frozen spans ${frozen.length}, unexplained pops ${unexplained.length})`,
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
