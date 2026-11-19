// 1440x900 screenshots for the Phase 6 screens. The demo project is a real e2e render with a publish package.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pw from '../../engine/node_modules/playwright/index.js';
import { ROOT } from '../../cli/src/env.js';
import { createServer } from '../../server/src/server.js';

const { chromium } = pw;
const out = join(ROOT, 'docs', 'reports', 'phase-6');
mkdirSync(out, { recursive: true });
process.env.FABLEON_FINAL_SIZE = '540x960';
const token = 'screens-phase6';
let app, browser;
try {
  ({ app } = await createServer({ root: join(ROOT, 'work'), token, port: 0 }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = app.server.address().port;
  app.fableonAuthPort?.(port);
  const base = `http://127.0.0.1:${port}`;
  // One queued batch is useful for the queue screenshot; it stays paused.
  await fetch(`${base}/api/queue/from-preset`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ presetId: 'daily-short-hi', topics: ['The house of lac'] }) });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const shot = async (name, path, scroll = null) => {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    if (scroll) await page.getByText(scroll, { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(name, page.url());
  };
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, '01-projects.png') });
  console.log('01-projects');
  await shot('02-finish-look', '/p/phase6-demo/finish', 'Look');
  await shot('03-finish-sound', '/p/phase6-demo/finish', 'Sound');
  await shot('04-finish-render', '/p/phase6-demo/finish', 'Render');
  await shot('05-publish', '/p/checkpoint-bakasura/publish', 'Upload checklist');
  await shot('06-queue', '/queue', 'New from preset');
  await shot('07-presets', '/presets', 'Presets');
  await shot('08-costs', '/costs', 'Costs');
  await shot('09-costs-budgets', '/costs', 'Budgets');
  await shot('10-settings', '/settings', 'Channel profile');
  // The New-from-preset dialog is a separate visual state.
  await page.goto(`${base}/queue`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New from preset' }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: join(out, '11-new-from-preset.png') });
  console.log('11-new-from-preset');
  console.log(`screenshots written to ${out}`);
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  try { await app?.close(); } catch { /* closed */ }
}
