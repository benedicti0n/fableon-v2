// Print the WebGL renderer string a fresh Chromium exposes with the current RENDER_GL flag set (used by `fableon doctor`).
// usage: node engine/scripts/glinfo.cjs   -> {"renderer":…,"vendor":…,"version":…,"mode":…}
const { chromium } = require('playwright');
const { launchOptions, glInfo } = require('./browser.cjs');

(async () => {
  const mode = process.env.RENDER_GL || 'gpu';
  let browser;
  try {
    browser = await chromium.launch(launchOptions());
    const page = await browser.newPage();
    const info = await glInfo(page);
    console.log(JSON.stringify({ ...info, mode }));
    if (!info.renderer) process.exitCode = 1;
  } catch (e) {
    console.log(JSON.stringify({ renderer: null, error: e.message, mode }));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
