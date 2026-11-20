import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pw from '../node_modules/playwright/index.js';
await build({ entryPoints: [join('engine','src','pose-bounds.ts')], bundle: true, format: 'iife', outfile: join('engine','dist','pose-bounds.js'), logLevel: 'error' });
const b = await pw.chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await b.newPage();
  await p.setContent(`<script>${readFileSync(join('engine','dist','pose-bounds.js'), 'utf8')}</script>`);
  await p.waitForFunction(() => window.ready === true);
  const rows = await p.evaluate(() => window.poseBounds());
  const stand = rows.find((r) => r.pose === 'stand');
  const sh = 975 - stand.minY, sw = Math.max(300 - stand.minX, stand.maxX - 300);
  const out = {};
  for (const r of rows) {
    const height = (975 - r.minY) / sh;
    out[r.pose] = {
      standing: +height.toFixed(3), seated: +height.toFixed(3),
      eye: +((975 - r.hc) / sh).toFixed(3), eyeSeated: +((975 - r.hc) / sh).toFixed(3),
      head: 1, halfWidth: +(Math.max(300 - r.minX, r.maxX - 300) / sw).toFixed(3),
    };
  }
  console.log(JSON.stringify(out, null, 2));
} finally { await b.close(); }
