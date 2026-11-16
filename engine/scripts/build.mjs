// Bundle the engine page (vanilla three + postprocessing, no React) into engine/dist.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'engine.js'),
  logLevel: 'warning',
  loader: { '.json': 'json' },
});
writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body style="margin:0;background:#000"><script type="module" src="engine.js"></script></body></html>');
