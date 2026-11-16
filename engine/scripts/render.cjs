// Frame driver (Playwright + WebGL): loads engine/dist/index.html, calls window.renderFrame(f), pipes JPEGs into ffmpeg.
// Env: CHROME_PATH (optional browser binary), RENDER_GL = gpu (default) | swiftshader (CPU-only machines).
//
//   node engine/scripts/render.cjs stills   --out <prefix> --frames 60,640 [--size 540x960] [--msaa 0] [--off ink,lens]
//   node engine/scripts/render.cjs video    --out <out.mp4> --from 0 --to 90 [--size 1440x2560] [--msaa 0]
//   node engine/scripts/render.cjs segments --jobs <jobs.json> [--size …] [--msaa …]
//   node engine/scripts/render.cjs list     --out <shots.json>
//   node engine/scripts/render.cjs qa       --out <qa_meta.json>
//   node engine/scripts/render.cjs cuts     --out <cuts.json>
//
// --jobs is a JSON array of [from, to, outfile] triples: one browser, many clips (existing clips are skipped).
// --project <dir> serves that folder under /project/ (words.json + storyboard.json); with no storyboard the engine
// falls back to the compiled-in story.ts, exactly as before.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..', 'dist');
const usage = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 11).join('\n');

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true;
    else { o[k] = v; i++; }
  }
  return o;
}
const opt = parse(process.argv.slice(2));
const mode = opt._[0];
if (!mode || opt.help) { console.log(usage); process.exit(mode ? 0 : 1); }
const [W, H] = String(opt.size || '1440x2560').split(/[x:]/).map(Number);
const MS = +(opt.msaa ?? 4), OFF = String(opt.off || '');
const PROJECT = opt.project ? path.resolve(String(opt.project)) : null;
const need = (k) => { if (opt[k] === undefined || opt[k] === true) { console.error(`render.cjs ${mode}: missing --${k}\n\n${usage}`); process.exit(1); } return String(opt[k]); };
const port = 8800 + Math.floor(Math.random() * 900);
const mime = (p) => p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.jpg') || p.endsWith('.jpeg') ? 'image/jpeg' : p.endsWith('.png') ? 'image/png' : 'text/html';
const srv = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  let p;
  if (url.startsWith('/project/')) {
    if (!PROJECT) { s.statusCode = 404; return s.end(); }
    p = path.resolve(PROJECT, url.slice('/project/'.length));
    if (p !== PROJECT && !p.startsWith(PROJECT + path.sep)) { s.statusCode = 403; return s.end(); }
  } else p = path.join(root, url);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { s.statusCode = 404; return s.end(); }
  s.setHeader('Content-Type', mime(p)); s.end(fs.readFileSync(p));
}).listen(port);
const { launchOptions, glInfo, isSoftware } = require('./browser.cjs');
const framesCsv = mode === 'stills' ? need('frames') : '';
const out = ['stills', 'video', 'list', 'qa', 'cuts'].includes(mode) ? need('out') : '';
const jobsFile = mode === 'segments' ? need('jobs') : '';
(async () => {
  const b = await chromium.launch(launchOptions());
  const pg = await b.newPage({ viewport: { width: 400, height: 400 } });
  pg.on('pageerror', (e) => console.log('PAGEERR', e.message));
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
  const t0 = Date.now();
  await pg.goto(`http://localhost:${port}/index.html?w=${W}&h=${H}&ms=${MS}&off=${OFF}`);
  await pg.waitForFunction(() => window.ready, null, { timeout: 300000 });
  const total = await pg.evaluate(() => window.TOTAL);
  console.log('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'TOTAL', total);
  const gl = await glInfo(pg);
  console.log('GL', JSON.stringify(gl));
  if (!process.env.RENDER_GL || process.env.RENDER_GL === 'gpu') {
    if (isSoftware(gl.renderer)) console.warn('WARNING GPU request fell back to software WebGL:', gl.renderer, '— see docs/BENCHMARKS.md; set RENDER_GL=swiftshader to silence');
  }
  if (mode === 'segments') {
    // one browser, many clips (skips clips that already exist)
    const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
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
  else if (mode === 'cuts') { fs.writeFileSync(out, JSON.stringify(await pg.evaluate(() => window.camJumps()))); console.log('cuts json', out); }
  else if (mode === 'list') { fs.writeFileSync(out, JSON.stringify(await pg.evaluate(() => window.SHOTLIST))); console.log('shots json', out); }
  else if (mode === 'stills') {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    for (const f of framesCsv.split(',').map(Number)) {
      const t = Date.now();
      const d = await pg.evaluate((f) => window.renderFrame(f), f);
      fs.writeFileSync(`${out}${f}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
      console.log('still', f, ((Date.now() - t) / 1000).toFixed(1) + 's', JSON.stringify(await pg.evaluate(() => Object.fromEntries(Object.entries(window.PROF).map(([k, v]) => [k, Math.round(v)])))));
    }
  } else {
    const from = +(opt.from ?? 0), to = Math.min(+(opt.to ?? total), total);
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
