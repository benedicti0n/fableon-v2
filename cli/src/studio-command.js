// One-command studio: rebuild web/dist when stale, then serve and open the token URL.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, run } from './env.js';
import { startServer } from '../../server/src/server.js';

const newest = (dir, out = 0) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    const st = statSync(p);
    if (e.isDirectory()) out = newest(p, out);
    else out = Math.max(out, st.mtimeMs);
  }
  return out;
};

export async function studioCommand({ port = 4317, root = join(ROOT, 'work'), open = true } = {}) {
  const dist = join(ROOT, 'web', 'dist', 'index.html');
  const source = Math.max(newest(join(ROOT, 'web', 'src')), statSync(join(ROOT, 'web', 'index.html')).mtimeMs, statSync(join(ROOT, 'web', 'package.json')).mtimeMs);
  if (!existsSync(dist) || statSync(dist).mtimeMs < source) {
    console.log('studio: web/dist is stale; building');
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'web:build'], { cwd: ROOT });
  }
  await startServer({ port: Number(port), root, open: !!open });
}
