// 1440x900 screenshots of every Phase 5 screen, using a real work project read-only.
// Run with: npm run web:screens
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pw from '../../engine/node_modules/playwright/index.js';
import { ROOT } from '../../cli/src/env.js';
import { createServer } from '../../server/src/server.js';

const { chromium } = pw;
const out = join(ROOT, 'docs', 'reports', 'phase-5');
mkdirSync(out, { recursive: true });
const token = 'screens-token-phase5';
let app, browser;
try {
  ({ app } = await createServer({ root: join(ROOT, 'work'), token, port: 0 }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = app.server.address().port;
  app.fableonAuthPort?.(port);
  const base = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
  await page.evaluate(() => document.fonts.ready);

  const projects = await (await fetch(`${base}/api/projects`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const chosen = projects.projects.find((p) => p.source === 'work' && p.id === 'bakasura-hi')
    ?? projects.projects.find((p) => p.source === 'work')
    ?? projects.projects[0];
  if (!chosen) throw new Error('no project to photograph');
  const id = chosen.id;

  const shot = async (name, path, wait) => {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    if (wait) await page.getByText(wait, { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(name, page.url());
  };

  await page.screenshot({ path: join(out, '01-projects.png') });
  console.log('01-projects', page.url());
  await shot('02-settings', '/settings', 'Settings & usage');
  await shot('03-brief', `/p/${id}/brief`, 'Brief');
  await shot('04-research', `/p/${id}/research`, 'Research');
  await shot('05-script', `/p/${id}/script`, 'Script');
  await shot('06-voice', `/p/${id}/voice`, 'Waveform');
  await shot('07-cast', `/p/${id}/cast`, 'Characters');
  await shot('08-shotplan', `/p/${id}/shotplan`, 'Shot plan & board');
  await shot('09-board', `/p/${id}/board`, 'Shot plan & board');
  await shot('10-animatic', `/p/${id}/animatic`, 'Animatic');
  await page.locator('video').evaluate(async (v) => {
    await new Promise((resolve) => {
      const seek = () => { v.currentTime = Math.min(2, Number.isFinite(v.duration) ? v.duration : 2); v.addEventListener('seeked', resolve, { once: true }); setTimeout(resolve, 3000); };
      if (v.readyState >= 2) seek(); else { v.addEventListener('loadeddata', seek, { once: true }); setTimeout(resolve, 5000); }
    });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, '10-animatic.png') });
  console.log(`screenshots written to ${out} using ${chosen.source}/${id}`);
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  try { await app?.close(); } catch { /* closed */ }
}
