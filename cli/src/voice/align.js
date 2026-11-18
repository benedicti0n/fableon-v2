// Bridge to the local forced aligner: provider word timings are replaced by acoustic timings from align.py.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findPython, ROOT, run } from '../env.js';
import { atomicWrite } from '../core/artifacts.js';

export async function alignWords({ projectDir, wavPath, script, method = 'auto' }) {
  const python = findPython();
  if (!python) throw new Error('forced aligner: no python interpreter found');
  const work = join(projectDir, '.fableon');
  mkdirSync(work, { recursive: true });
  const scriptPath = join(work, 'align-script.json');
  const out = join(work, 'align.json');
  atomicWrite(scriptPath, JSON.stringify({ lines: (script.lines ?? []).map((l) => ({ n: l.n, text: l.text })) }, null, 2) + '\n');
  await run(python, [join(ROOT, 'cli/src/voice/align.py'), '--wav', wavPath, '--script', scriptPath, '--out', out, '--method', method], { cwd: ROOT });
  const data = JSON.parse(readFileSync(out, 'utf8'));
  if (!Array.isArray(data.words) || !data.words.length) throw new Error('forced aligner returned no words');
  return data;
}
