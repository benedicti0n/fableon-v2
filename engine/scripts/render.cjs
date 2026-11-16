// Frame driver (Playwright + WebGL): loads engine/dist/index.html, calls window.renderFrame(f), pipes JPEGs into ffmpeg.
// Env: CHROME_PATH (optional browser binary), RENDER_GL = gpu (default) | swiftshader (CPU-only machines).
//   stills: node engine/render.cjs stills <outPrefix> <f,f,...> [w h ms] [off=ink,lens,...]
//   video : node engine/render.cjs video <out.mp4> <from> <to> [w h ms]   (frames [from, to), JPEG -> ffmpeg x264 crf 16)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..', 'dist');
const [mode, out, a1, a2, ...rest] = process.argv.slice(2);
const port = 8800 + Math.floor(Math.random() * 900);
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(p)) { s.statusCode = 404; return s.end(); } s.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : 'text/html'); s.end(fs.readFileSync(p)); }).listen(port);
const EXE = process.env.CHROME_PATH || undefined;
const GL_ARGS = process.env.RENDER_GL === 'swiftshader'
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--ignore-gpu-blocklist', '--enable-gpu']; // Phase 1: measure and pick the fastest working flags per OS
(async () => {
  const opts = mode === 'stills' ? [a2, ...rest] : rest;
  const [w = '1440', h = '2560', ms = '4'] = opts.filter((x) => x && !x.startsWith('off='));
  const off = (opts.find((x) => x && x.startsWith('off=')) || 'off=').slice(4);
  const b = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: GL_ARGS });
  const pg = await b.newPage({ viewport: { width: 400, height: 400 } });
  pg.on('pageerror', (e) => console.log('PAGEERR', e.message));
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
  const t0 = Date.now();
  await pg.goto(`http://localhost:${port}/index.html?w=${w}&h=${h}&ms=${ms}&off=${off}`);
  await pg.waitForFunction(() => window.ready, null, { timeout: 300000 });
  const total = await pg.evaluate(() => window.TOTAL);
  console.log('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'TOTAL', total);
  if (mode === 'segments') {
    // a1 = JSON file with [[from, to, outfile], ...]: one browser, many clips (skips clips that already exist)
    const jobs = JSON.parse(fs.readFileSync(a1, 'utf8'));
    for (const [from, to, file] of jobs) {
      if (fs.existsSync(file)) { console.log('skip', file); continue; }
      const tmp = file + '.part.mp4', ts = Date.now();
      const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let f = from; f < to; f++) {
        const d = await pg.evaluate((f) => window.renderFrame(f, 0.95), f);
        if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      }
      ff.stdin.end(); await new Promise((r) => ff.on('close', r));
      fs.renameSync(tmp, file);
      console.log(new Date().toISOString().slice(11, 19), 'seg', file, to - from, 'frames', ((Date.now() - ts) / 1000 / (to - from)).toFixed(2) + ' s/f');
    }
  }
  else if (mode === 'qa') { fs.writeFileSync(out, JSON.stringify(await pg.evaluate(() => window.QA))); console.log('qa json', out); }
  else if (mode === 'cuts') { console.log('CUTS ' + JSON.stringify(await pg.evaluate(() => window.camJumps()))); }
  else if (mode === 'list') { console.log(JSON.stringify(await pg.evaluate(() => window.SHOTLIST))); }
  else if (mode === 'stills') {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    for (const f of a1.split(',').map(Number)) {
      const t = Date.now();
      const d = await pg.evaluate((f) => window.renderFrame(f), f);
      fs.writeFileSync(`${out}${f}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
      console.log('still', f, ((Date.now() - t) / 1000).toFixed(1) + 's', JSON.stringify(await pg.evaluate(() => Object.fromEntries(Object.entries(window.PROF).map(([k, v]) => [k, Math.round(v)])))));
    }
  } else {
    const from = +a1, to = Math.min(+a2, total);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    let last = Date.now();
    for (let f = from; f < to; f++) {
      const d = await pg.evaluate((f) => window.renderFrame(f, 0.95), f);
      const buf = Buffer.from(d.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (Date.now() - last > 60000 || f === to - 1) { last = Date.now(); console.log(new Date().toISOString().slice(11, 19), 'frame', f, 'of', to, ((Date.now() - t0) / 1000 / (f - from + 1)).toFixed(2) + ' s/f'); }
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r));
    console.log('done', out);
  }
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
