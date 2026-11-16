#!/bin/bash
# bundle the engine page (vanilla three + postprocessing, no React) into engine/dist
set -e
cd "$(dirname "$0")/.."
npx esbuild src/main.ts --bundle --format=esm --outfile=dist/engine.js --log-level=warning --loader:.json=json
echo '<!doctype html><html><body style="margin:0;background:#000"><script type="module" src="engine.js"></script></body></html>' > dist/index.html
