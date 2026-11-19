// Render one SFX preview for the sound inspector.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findPython, ROOT } from './env.js';

export function sfxPreviewCommand(dirArg, { kind = 'thud', seed = 1, gainDb = 0 } = {}) {
  const dir = resolve(dirArg);
  const py = findPython();
  if (!py) throw new Error('sfx-preview needs Python (set FABLEON_PYTHON or create .venv)');
  const name = `${kind}-${seed}.wav`;
  const out = join(dir, 'qa', 'previews', name);
  mkdirSync(join(dir, 'qa', 'previews'), { recursive: true });
  const r = spawnSync(py, [join(ROOT, 'audio', 'sfx_preview.py'), String(kind), String(seed), String(gainDb), out], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'sfx-preview failed');
  return { kind, seed, gainDb, file: join('qa', 'previews', name), seconds: 1.5 };
}
