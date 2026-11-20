// Render the F5 animals, mounts and effects review sheet with Playwright; one-off, not part of the film pipeline.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from '../node_modules/playwright/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '..', 'docs', 'reports', 'phase-7', 'animals-sheet.jpg');
mkdirSync(dirname(out), { recursive: true });
await build({ entryPoints: [join(root, 'src', 'animals-sheet.ts')], bundle: true, format: 'iife', outfile: join(root, 'dist', 'animals-sheet.js'), logLevel: 'warning', loader: { '.json': 'json' } });
const bundle = readFileSync(join(root, 'dist', 'animals-sheet.js'), 'utf8');
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 3000, height: 5200 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0"><script>${bundle}</script></body></html>`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
  const data = await page.evaluate(() => window.drawAnimalsSheet());
  writeFileSync(out, Buffer.from(String(data).split(',')[1], 'base64'));
  console.log(`animals sheet: ${out}`);
} finally { await browser.close(); }
