// `fableon doctor`: prove the machine can build and run the fixture pipeline, one line per check.
import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE, ROOT, capture, findPython, loadDotEnv } from './env.js';

const GB = 1024 ** 3;

function nodeCheck() {
  const v = process.versions.node;
  return { label: `Node ${v}`, ok: Number(v.split('.')[0]) >= 20, detail: Number(v.split('.')[0]) >= 20 ? '' : 'need >= 20', fix: 'install Node 20+ (brew install node@20, or nvm install 20)' };
}

function pythonCheck(py) {
  if (!py) return { label: 'Python 3.12', ok: false, detail: 'no interpreter found', fix: 'brew install python@3.12 && python3.12 -m venv .venv' };
  try {
    const v = capture(py, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])']);
    return { label: `Python ${v}`, ok: v.startsWith('3.12.'), detail: py, fix: `point FABLEON_PYTHON at a Python 3.12 or run: python3.12 -m venv .venv (${py})` };
  } catch (e) {
    return { label: 'Python 3.12', ok: false, detail: `${py}: ${e.message}`, fix: 'brew install python@3.12' };
  }
}

function packageCheck(py) {
  if (!py) return { label: 'Python packages', ok: false, detail: 'no interpreter', fix: 'python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt' };
  const code = [
    'import json, sys',
    'import kokoro, numpy, scipy, soundfile, PIL',
    'print(json.dumps({"numpy": numpy.__version__, "scipy": scipy.__version__, "pillow": PIL.__version__}))',
  ].join('\n');
  try {
    const j = JSON.parse(capture(py, ['-c', code]));
    return { label: 'Python packages', ok: true, detail: `kokoro, numpy ${j.numpy}, scipy ${j.scipy}, soundfile, pillow ${j.pillow}` };
  } catch (e) {
    return { label: 'Python packages', ok: false, detail: e.message.split('\n').pop(), fix: `${py} -m pip install -r requirements.txt` };
  }
}

function toolCheck(name) {
  try {
    const line = capture(name, ['-version']).split('\n')[0];
    return { label: name, ok: true, detail: line };
  } catch {
    return { label: name, ok: false, detail: `${name} not on PATH`, fix: 'brew install ffmpeg (or install ffmpeg + ffprobe)' };
  }
}

function webglCheck() {
  try {
    const j = JSON.parse(capture(process.execPath, [join(ENGINE, 'scripts', 'glinfo.cjs')], { cwd: ENGINE, env: { ...process.env } }));
    if (!j.renderer) return { label: 'Playwright Chromium + WebGL', ok: false, detail: j.error || 'no WebGL renderer', fix: 'npx playwright install chromium' };
    const soft = /swiftshader|llvmpipe|software|basic render/i.test(j.renderer);
    return { label: 'Playwright Chromium + WebGL', ok: true, detail: `${j.renderer}${soft ? '  [software fallback]' : ''}` };
  } catch (e) {
    return { label: 'Playwright Chromium + WebGL', ok: false, detail: e.message.split('\n')[0], fix: 'npm install && npx playwright install chromium' };
  }
}

function distCheck() {
  const dist = join(ENGINE, 'dist');
  const files = ['index.html', 'engine.js'];
  const missing = files.filter((f) => !existsSync(join(dist, f)));
  if (missing.length) return { label: 'Engine dist', ok: false, detail: `missing ${missing.join(', ')}`, fix: 'npm run build' };
  const src = join(ENGINE, 'src');
  const newest = Math.max(...readdirSync(src).filter((f) => f.endsWith('.ts') || f.endsWith('.json')).map((f) => statSync(join(src, f)).mtimeMs));
  const built = statSync(join(dist, 'engine.js')).mtimeMs;
  return { label: 'Engine dist', ok: built >= newest, detail: built >= newest ? 'built and fresh' : 'stale (sources newer than dist)', fix: 'npm run build' };
}

function diskCheck() {
  try {
    const s = statfsSync(ROOT);
    const free = (s.bavail * s.bsize) / GB;
    return { label: 'Free disk space', ok: free >= 5, detail: `${free.toFixed(1)} GB free${free >= 5 ? '' : ' (need >= 5 GB)'}`, fix: 'free at least 5 GB (renders and work/ live here)' };
  } catch (e) {
    return { label: 'Free disk space', ok: false, detail: e.message, fix: 'check the disk is mounted and writable' };
  }
}

export function keyCheck(name) {
  return { label: name, ok: true, detail: process.env[name] ? 'SET (value hidden)' : 'MISSING (optional)' };
}

export function runDoctor() {
  loadDotEnv();
  const py = findPython();
  const checks = [nodeCheck(), pythonCheck(py), packageCheck(py), toolCheck('ffmpeg'), toolCheck('ffprobe'), webglCheck(), distCheck(), diskCheck(), keyCheck('DEEPSEEK_API_KEY'), keyCheck('TAVILY_API_KEY'), keyCheck('ELEVENLABS_API_KEY')];
  console.log('fableon doctor\n');
  let bad = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.label}${c.detail ? `  —  ${c.detail}` : ''}`);
    if (!c.ok) { bad++; if (c.fix) console.log(`       fix: ${c.fix}`); }
  }
  console.log(`\n${checks.length - bad}/${checks.length} checks OK`);
  if (bad) process.exitCode = 1;
  return bad;
}
