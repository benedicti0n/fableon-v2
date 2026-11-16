// Voice provider dispatch. Kokoro keeps the fixture path; ElevenLabs uses beat blocks and character timestamps.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findPython, ROOT, run } from '../env.js';
import { readJson } from '../core/artifacts.js';
import { synthesizeElevenLabs } from './elevenlabs.js';

export { synthesizeElevenLabs } from './elevenlabs.js';

export function scriptBlocks(projectDir) {
  const scriptPath = join(projectDir, 'script.json');
  if (existsSync(scriptPath)) {
    const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
    const blocks = [];
    for (const line of script.lines ?? []) {
      const last = blocks[blocks.length - 1];
      if (last && last.beat === line.beat) last.lines.push({ n: line.n, text: line.text, delivery: line.delivery });
      else blocks.push({ beat: line.beat, lines: [{ n: line.n, text: line.text, delivery: line.delivery }] });
    }
    return blocks;
  }
  const md = join(projectDir, 'SCRIPT.md');
  if (!existsSync(md)) throw new Error('voice needs script.json or SCRIPT.md');
  const src = readFileSync(md, 'utf8');
  const section = /## Script[^\n]*\n(.*?)\n## /s.exec(src);
  if (!section) throw new Error('SCRIPT.md has no "## Script" section');
  return section[1].split('\n').map((t) => t.trim()).filter(Boolean).map((text, n) => ({ beat: null, lines: [{ n, text }] }));
}

export async function synthesizeKokoro({ projectDir, project }) {
  const language = project.voice?.language ?? project.language ?? 'en';
  if (language !== 'en') throw new Error('kokoro is English-only; set project.voice.provider to "elevenlabs" for Hindi');
  const py = findPython();
  if (!py) throw new Error('voice needs Python 3.12 (set FABLEON_PYTHON or create .venv)');
  const speed = project.voice?.speed ?? 1.2;
  const voice = project.voice?.voice ?? 'am_michael';
  await run(py, [join(ROOT, 'voice', 'make_voice.py'), String(speed), voice], { cwd: join(ROOT, 'voice'), env: { ...process.env, PROJECT_DIR: projectDir } });
  const words = readJson(join(projectDir, 'words.json'));
  return { words, warnings: [], characters: 0, costUsd: 0, calls: [], cached: false, model: 'kokoro', voiceId: voice, usage: { calls: 0, cached: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 } };
}

export async function synthesize({ provider, projectDir, project }) {
  if (provider === 'kokoro') return synthesizeKokoro({ projectDir, project });
  if (provider === 'elevenlabs') {
    if (!project.voice?.voiceId) throw new Error('elevenlabs needs project.voice.voiceId (run: fableon voice audition --project ...)');
    const blocks = scriptBlocks(projectDir);
    if (!blocks.length) throw new Error('voice has no script lines');
    const result = await synthesizeElevenLabs({ projectDir, project, blocks });
    return { ...result, usage: { calls: result.calls.length, cached: result.calls.filter((c) => c.cached).length, promptTokens: 0, completionTokens: 0, costUsd: result.costUsd } };
  }
  throw new Error(`unknown voice provider "${provider}" (choose kokoro or elevenlabs)`);
}
