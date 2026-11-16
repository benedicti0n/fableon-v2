// Export the runtime catalog to schema/catalog.json. The lists live in the engine sources (single source of truth):
// this script bundles a tiny entry with esbuild, imports it in Node, and writes the JSON the validator reads.
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const src = join(root, 'engine', 'src');
const out = join(root, 'schema', 'catalog.json');
const dist = join(root, 'engine', 'dist');

const entry = `
import { POSES, PROPS, SPECIALS } from "./people";
import { EXPRS } from "./toon";
import { LIGHTS_NAMES } from "./lights";
import { PLACES } from "./places";
import { SET_NAMES } from "./sets";
import { C, KIDS } from "./castlist";
export default {
  places: PLACES,
  sets: SET_NAMES,
  cast: { C: Object.keys(C), KIDS: Object.keys(KIDS), KAURAVA: { generator: true } },
  poses: POSES,
  expressions: EXPRS,
  props: PROPS,
  specials: SPECIALS,
  effects: ["sparkle", "halo", "knot"],
  setPieces: ["pages"],
  lights: LIGHTS_NAMES,
};
`;

const bundle = join(dist, 'catalog-export.mjs');
mkdirSync(dist, { recursive: true });
try {
  await build({
    stdin: { contents: entry, resolveDir: src, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    external: ['three', 'three/*'],
  });
  const mod = await import(pathToFileURL(bundle).href);
  writeFileSync(out, JSON.stringify(mod.default, null, 2) + '\n');
  console.log(`catalog: wrote ${out}`);
} finally {
  rmSync(bundle, { force: true });
}
