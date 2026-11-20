// Test-only flat-card renderer: solid colour cards with drifting blocks.
// It proves that a style pack can replace the picture while the shared pipeline stays unchanged.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const PALETTE = [
  ['0x22313f', '0xe8b53a', '0x2f8a8a'],
  ['0x3a2432', '0xd96c4a', '0xf2e6c4'],
  ['0x1f3a2d', '0x7fb069', '0xe8b53a'],
  ['0x2d2a45', '0x8e7cc3', '0xf2c230'],
  ['0x3f2b1f', '0xc98c5c', '0x2f8a8a'],
];

const ffmpeg = (args) => new Promise((resolve, reject) => {
  const child = spawn('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`flat-card ffmpeg failed (${code}): ${err.slice(-500)}`)));
});

const cards = (w, h, index) => {
  const [bg, a, b] = PALETTE[index % PALETTE.length];
  const box = (color, phase, y, scale) => `drawbox=x='(w*0.5-${Math.round(w * 0.12)})+${Math.round(w * 0.09)}*sin(t*1.1+${phase})':y='h*${y}+${Math.round(h * 0.02)}*sin(t*0.8+${phase})':w=${Math.round(w * scale)}:h=${Math.round(h * 0.34)}:color=${color}@1:t=fill`;
  return { bg, filter: [box(a, 0.3, 0.33, 0.2), box(b, 2.1, 0.42, 0.16)].join(',') };
};

const pad2 = (n) => String(n).padStart(2, '0');

async function segment(file, from, to, size, index) {
  mkdirSync(dirname(file), { recursive: true });
  const [w, h] = size.split('x').map(Number);
  const frames = Math.max(1, Math.round(to - from));
  const { bg, filter } = cards(w, h, index);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=${bg}:s=${size}:d=${(frames / 30).toFixed(4)}:r=30`, '-vf', filter, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p', file]);
}

export async function renderPreview({ projectDir, qualityName = 'preview' }) {
  const rows = JSON.parse(readFileSync(join(projectDir, 'shots.json'), 'utf8'));
  const size = qualityName === 'final' ? '1440x2560' : '540x960';
  for (let i = 0; i < rows.length; i++) {
    const [id, a, b] = rows[i];
    await segment(join(projectDir, 'render', `seg_${pad2(id)}.mp4`), a, b, size, i);
  }
}

export async function renderShotSegments({ projectDir, jobsFile, size }) {
  const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    await segment(job.file, job.from, job.to, size, Number(job.id) || i);
  }
}

export async function renderSegments({ projectDir, jobsFile, size }) {
  const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
  for (let i = 0; i < jobs.length; i++) {
    const [from, to, file] = jobs[i];
    await segment(file, from, to, size, 0);
  }
}

export async function renderStills({ projectDir, frames, out, size }) {
  mkdirSync(dirname(out), { recursive: true });
  const [w, h] = size.split('x').map(Number);
  const { bg, filter } = cards(w, h, 0);
  for (const frame of String(frames).split(',').map((x) => Number(x.trim())).filter(Number.isFinite)) {
    const file = `${out}${frame}.jpg`;
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=${bg}:s=${size}:d=0.1:r=30`, '-vf', filter, '-frames:v', '1', '-q:v', '3', file]);
  }
}

export async function renderLookdev({ projectDir, out }) {
  mkdirSync(dirname(out), { recursive: true });
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x22313f:s=900x1600:d=0.1:r=30', '-vf', "drawbox=x='60+40*sin(t)':y=200:w=240:h=420:color=0xe8b53a@1:t=fill,drawbox=x=360:y=260:w=240:h=420:color=0x2f8a8a@1:t=fill,drawbox=x=660:y=320:w=200:h=420:color=0xd96c4a@1:t=fill", '-frames:v', '1', '-q:v', '3', out]);
}
