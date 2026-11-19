// Deterministic cover candidates and HTML/CSS composition. The frame comes from final.mp4; the browser only
// composes pixels and shapes Devanagari with the bundled Noto Sans Devanagari Black.
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import pw from '../../engine/node_modules/playwright/index.js';
import { ROOT, findPython } from './env.js';

const { chromium } = pw;
const norm = (n, cap) => Math.max(0, Math.min(1, Number(n) / cap));

async function metrics(paths) {
  const py = findPython();
  if (!py) return paths.map((p) => ({ path: p, sharpness: 0, contrast: 0, saturation: 0 }));
  const r = spawnSync(py, [join(ROOT, 'tools', 'publish', 'cover_metrics.py'), ...paths], { encoding: 'utf8' });
  if (r.status !== 0) return paths.map((p) => ({ path: p, sharpness: 0, contrast: 0, saturation: 0 }));
  try { return JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { return []; }
}

export function candidateFrames(projectDir) {
  const shots = JSON.parse(readFileSync(join(projectDir, 'shots.json'), 'utf8'));
  const board = JSON.parse(readFileSync(join(projectDir, 'board.json'), 'utf8'));
  const frames = existsSync(join(projectDir, 'frames.json')) ? JSON.parse(readFileSync(join(projectDir, 'frames.json'), 'utf8')) : { keys: [] };
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const beatByLine = new Map((script.lines ?? []).map((l) => [l.n, l.beat]));
  const beatOf = (shot) => {
    const lines = (shot.lines ?? []).map((n) => beatByLine.get(n)).filter(Boolean);
    if (lines.includes('hook')) return 'hook'; if (lines.includes('mystery')) return 'mystery'; if (lines.some((b) => b === 'payoff' || b === 'twist')) return 'payoff'; return 'normal';
  };
  const out = [];
  for (const [i, [id, a, b]] of shots.entries()) {
    const shot = board.shots?.[i] ?? {};
    const trans = shot.transition;
    const pad = trans ? Math.max(10, Math.round(Number(trans.frames ?? 7) * 2)) : 10;
    const frame = Math.min(b - 1, Math.max(a + pad, Math.round((a + b) / 2)));
    const key = (frames.keys ?? []).filter((k) => k.shot === shot.id && k.frames?.some((f) => Math.abs(f - frame) <= 12)).sort((x, y) => Math.abs((x.frames?.[0] ?? 0) - frame) - Math.abs((y.frames?.[0] ?? 0) - frame))[0] ?? null;
    const subject = key?.subjects?.[0] ?? null;
    const head = subject?.headBox;
    const headSize = head ? Math.max(0, (head.x1 - head.x0) * (head.y1 - head.y0)) : 0;
    const face = head ? Number(subject.visible ?? 1) > 0 && head.y0 >= 0 && head.y1 <= 1 : false;
    const chars = (shot.actors ?? []).length;
    out.push({ shot: shot.id ?? String(id), index: i, frame, time: +(frame / 30).toFixed(3), head, headSize, face, chars, beat: beatOf(shot), transition: trans?.type ?? 'cut' });
  }
  return out;
}

/** Extract, score and keep the top six candidates; returns metadata with relative image paths. */
export async function buildCandidates(projectDir, finalPath) {
  const dir = join(projectDir, 'publish', 'candidates');
  mkdirSync(dir, { recursive: true });
  const rows = candidateFrames(projectDir);
  const paths = [];
  for (const row of rows) {
    const out = join(dir, `${row.index + 1}-${row.shot}.jpg`);
    const metric = join(dir, `.metric-${row.index + 1}.jpg`);
    for (const [file, size] of [[out, '1080:1920'], [metric, '270:480']]) {
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(row.time), '-i', finalPath, '-frames:v', '1', '-vf', `scale=${size}:force_original_aspect_ratio=increase,crop=${size.replace(':', ':')}`, '-q:v', '3', file], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`cover frame grab failed: ${r.stderr}`);
    }
    row.image = relative(projectDir, out).split('\\').join('/');
    paths.push({ row, metric });
  }
  const metricsRows = await metrics(paths.map((p) => p.metric));
  const scored = paths.map(({ row, metric }, i) => {
    const m = metricsRows[i] ?? { sharpness: 0, contrast: 0, saturation: 0 };
    const sharp = norm(Math.log1p(m.sharpness) / Math.log(20), 1);
    const contrast = norm(m.contrast, 80);
    const sat = norm(m.saturation, 0.55);
    const head = Math.min(1, row.headSize / 0.08);
    const beat = row.beat === 'hook' ? 1 : row.beat === 'mystery' ? 0.85 : row.beat === 'payoff' ? 0.95 : 0.35;
    const chars = row.chars === 1 || row.chars === 2 ? 1 : 0.4;
    const score = +(head * 0.30 + (row.face ? 0.20 : 0) + sharp * 0.18 + contrast * 0.12 + sat * 0.10 + beat * 0.06 + chars * 0.04).toFixed(4);
    return { ...row, sharpness: +m.sharpness.toFixed(1), contrast: +m.contrast.toFixed(1), saturation: +m.saturation.toFixed(3), score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 6);
  for (const p of paths) { try { if (p.metric !== p.row.image) rmSync(p.metric, { force: true }); } catch { /* best effort */ } }
  writeFileSync(join(projectDir, 'publish', 'candidates.json'), JSON.stringify(scored, null, 2) + '\n');
  return scored;
}

const fontData = () => {
  const p = join(ROOT, 'web', 'node_modules', '@fontsource', 'noto-sans-devanagari', 'files', 'noto-sans-devanagari-devanagari-900-normal.woff2');
  return existsSync(p) ? readFileSync(p).toString('base64') : null;
};

/** Compose one cover from a candidate image. Text stays above the bottom 25% and right 15%. */
export async function composeCover(projectDir, { image, text, template = 'title', out = 'publish/cover.jpg' } = {}) {
  if (!image || !existsSync(join(projectDir, image))) throw new Error(`cover candidate ${image} is missing`);
  const img = readFileSync(join(projectDir, image)).toString('base64');
  const font = fontData();
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const accent = words.length > 1 ? 1 : 0;
  const styled = words.map((w, i) => `<span class="${i === accent ? 'accent' : ''}">${w.replace(/[&<>]/g, '')}</span>`).join(' ');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'NotoDeva';src:url(data:font/woff2;base64,${font ?? ''}) format('woff2');font-weight:900}
    html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0f1115}
    .frame{position:absolute;inset:0;background:url(data:image/jpeg;base64,${img}) center/cover no-repeat}
    .title{position:absolute;left:64px;top:64px;max-width:72%;font-family:'NotoDeva',sans-serif;font-weight:900;font-size:96px;line-height:1.08;color:#fff;-webkit-text-stroke:12px #20140a;paint-order:stroke fill;text-shadow:0 6px 25px rgba(0,0,0,.35)}
    .accent{color:#f5a524}
  </style></head><body><div class="frame"></div>${template === 'title' && words.length ? `<div class="title">${styled}</div>` : ''}</body></html>`;
  const b = await chromium.launch({ headless: true });
  try {
    const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(join(projectDir, out.split('/').slice(0, -1).join('/')), { recursive: true });
    await page.screenshot({ path: join(projectDir, out), type: 'jpeg', quality: 88 });
  } finally { await b.close(); }
  return out;
}
