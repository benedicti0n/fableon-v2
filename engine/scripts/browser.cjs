// Shared Chromium launch configuration: the renderer and the doctor must agree on which GPU path is used.
// RENDER_GL selects a flag set (default: gpu = the fastest working set for this OS):
//   gpu             best set for this OS (see docs/BENCHMARKS.md)
//   swiftshader     software WebGL fallback (CPU-only machines, CI)
//   chromium        Playwright's full Chromium in new-headless mode, GPU on
//   chromium-metal  same, forced ANGLE Metal backend (macOS)
//   chromium-gl     same, forced ANGLE OpenGL backend
//   shell           Playwright's headless shell, GPU on
//   shell-metal     headless shell + ANGLE Metal
const path = require('path');

const gpuArgs = ['--ignore-gpu-blocklist', '--enable-gpu'];
const SETS = {
  gpu: { channel: 'chromium', args: [...gpuArgs, ...(process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] },
  default: { args: [] },
  swiftshader: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  chromium: { channel: 'chromium', args: gpuArgs },
  'chromium-metal': { channel: 'chromium', args: [...gpuArgs, '--use-angle=metal'] },
  'chromium-gl': { channel: 'chromium', args: [...gpuArgs, '--use-angle=gl'] },
  shell: { args: gpuArgs },
  'shell-metal': { args: [...gpuArgs, '--use-angle=metal'] },
};

function launchOptions(mode) {
  const name = mode || process.env.RENDER_GL || 'gpu';
  const set = SETS[name];
  if (!set) throw new Error(`unknown RENDER_GL=${name} (choose ${Object.keys(SETS).join(', ')})`);
  const opts = { args: set.args };
  if (process.env.CHROME_PATH) opts.executablePath = path.resolve(process.env.CHROME_PATH);
  else if (set.channel) opts.channel = set.channel;
  return opts;
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render|mesa offscreen/i;
const isSoftware = (renderer) => SOFTWARE.test(String(renderer || ''));

// Ask a page for its WebGL renderer string (engine pages already expose window.GLINFO; blank pages are probed).
async function glInfo(page) {
  const existing = await page.evaluate(() => (window.GLINFO ? { renderer: window.GLINFO } : null)).catch(() => null);
  if (existing) return { ...existing, source: 'engine' };
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { renderer: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      version: gl.getParameter(gl.VERSION),
    };
  });
}

module.exports = { SETS, launchOptions, glInfo, isSoftware };
