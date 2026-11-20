// Render the Phase 7 kit review sheet with Playwright; one-off, not part of the film pipeline.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from '../node_modules/playwright/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '..', 'docs', 'reports', 'phase-7', 'kit-sheet.jpg');
mkdirSync(dirname(out), { recursive: true });
await build({ entryPoints: [join(root, 'src', 'kit-sheet.ts')], bundle: true, format: 'iife', outfile: join(root, 'dist', 'kit-sheet.js'), logLevel: 'warning', loader: { '.json': 'json' } });
const bundle = readFileSync(join(root, 'dist', 'kit-sheet.js'), 'utf8');
const { chromium } = pw;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 2600, height: 7600 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0"><script>${bundle}</script></body></html>`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
  const data = await page.evaluate(() => window.drawKitSheet());
  writeFileSync(out, Buffer.from(String(data).split(',')[1], 'base64'));
  console.log(`kit sheet: ${out}`);
} finally { await browser.close(); }
