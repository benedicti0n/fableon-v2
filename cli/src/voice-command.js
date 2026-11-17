// `fableon voice check`: one short Hindi sentence through a provider, no project and no secret output.
// `fableon voice pace`: rebuild the cached take with the reference pause policy and three local tempo variants.
import { join, resolve } from 'node:path';
import { loadDotEnv } from './env.js';
import { readJson } from './core/artifacts.js';
import { checkElevenLabs } from './voice/elevenlabs.js';
import { buildPaceVariants, choosePace, DEFAULT_PACES } from './voice/pace.js';

export async function voiceCheckCommand(opts = {}) {
  loadDotEnv();
  const provider = opts.provider ?? 'elevenlabs';
  if (provider !== 'elevenlabs') throw new Error(`voice check supports elevenlabs (got "${provider}")`);
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log('provider: elevenlabs');
    console.log('key: MISSING (ELEVENLABS_API_KEY)');
    return { ok: false, key: false };
  }
  const r = await checkElevenLabs({ voiceId: opts.voiceId || process.env.ELEVENLABS_VOICE_ID || undefined, model: opts.model });
  console.log('provider: elevenlabs');
  console.log('key: SET (ELEVENLABS_API_KEY)');
  console.log(`model: ${r.model}`);
  console.log(`voice: ${r.voiceId}`);
  console.log(`characters billed: ${r.characters}`);
  console.log(`cost: $${r.costUsd.toFixed(6)}`);
  for (const w of r.words) console.log(`  ${w.w}  ${w.a.toFixed(2)}s-${w.b.toFixed(2)}s (line ${w.line})`);
  return r;
}

export async function voicePaceCommand(projectDirArg, opts = {}) {
  const projectDir = resolve(projectDirArg);
  const project = readJson(join(projectDir, 'project.json'));
  const script = readJson(join(projectDir, 'script.json'));
  const lines = script.lines ?? [];
  if (!lines.length) throw new Error('voice pace needs script.json lines');
  if (opts.choose != null) {
    const r = await choosePace({ projectDir, project, lines, pace: Number(opts.choose) });
    console.log(`voice pace: chose ${r.pace.toFixed(2)}; wrote voice.wav (${r.duration.toFixed(2)} s), words.json (${r.words.length} words) and voice.pace in project.json`);
    console.log(`  pauses: ${r.cuts.dramatic} dramatic, ${r.cuts.other} other, ${r.cuts.beatGaps} beat; base take ${r.base.hash.slice(0, 12)}`);
    return r;
  }
  const paces = opts.paces ? String(opts.paces).split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)) : DEFAULT_PACES;
  const r = await buildPaceVariants({ projectDir, project, lines, paces });
  console.log(`voice pace: base take ${r.base.hash.slice(0, 12)} is ${r.base.duration.toFixed(2)} s, ${r.base.words.length} words; no provider request`);
  for (const v of r.variants) console.log(`  ${v.pace.toFixed(2)}  ${v.duration.toFixed(2)} s  ${v.wordsPerSecond.toFixed(3)} words/s  voice/pace/${v.pace.toFixed(2)}.wav`);
  console.log(`voice pace: wrote voice/pace/pace.md; choose one with --choose <pace>`);
  return r;
}
