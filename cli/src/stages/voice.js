// Voice stage: provider dispatch, then optional length fit with pitch-preserving ffmpeg atempo.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { capture, loadDotEnv, ROOT } from '../env.js';
import { historyPath, readJson, writeJsonArtifact } from '../core/artifacts.js';
import { run } from '../env.js';
import { synthesize } from '../voice/index.js';
import { countWords } from '../../../shared/words.mjs';
import { WPS } from './script.js';

const probe = (file) => Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
const scaleWords = (words, k) => words.map((w) => ({ ...w, a: +Math.max(0, w.a * k).toFixed(3), b: +Math.max(0, w.b * k).toFixed(3) }));

export async function runVoice({ projectDir: projectDirArg, project, fit = true }) {
  const projectDir = resolve(projectDirArg);
  loadDotEnv();
  const voice = project.voice ?? {};
  const provider = voice.provider ?? voice.engine ?? 'kokoro';
  const language = voice.language ?? project.language ?? 'en';
  if (!existsSync(join(projectDir, 'SCRIPT.md'))) throw new Error('voice needs SCRIPT.md');
  const target = Number(project.seconds);
  const rate = voice.rate?.wordsPerSecond ?? null;
  let speed = voice.settings?.speed ?? voice.speed ?? 1;
  if (provider === 'elevenlabs' && rate && existsSync(join(projectDir, 'script.json'))) {
    const script = readJson(join(projectDir, 'script.json'));
    const naturalEstimate = script.lines.reduce((n, l) => n + countWords(l.text), 0) / rate;
    speed = Math.max(0.7, Math.min(1.2, speed * (naturalEstimate / target)));
  }
  const voiceWithSpeed = provider === 'elevenlabs'
    ? { ...voice, language, settings: { ...(voice.settings ?? {}), speed } }
    : { ...voice, language };
  const result = await synthesize({ provider, projectDir, project: { ...project, voice: voiceWithSpeed } });
  const voicePath = join(projectDir, 'voice.wav'), wordsPath = join(projectDir, 'words.json');
  if (!existsSync(voicePath)) throw new Error(`${provider} did not write voice.wav`);
  const natural = probe(voicePath);
  const delta = Math.abs(natural - target) / target;
  if (fit && delta > 0.10) throw new Error(`voice is ${natural.toFixed(2)} s, ${(delta * 100).toFixed(1)} % from ${target} s (outside 10 %); change the script to about ${Math.round(target * (rate ?? WPS))} words or pass --fit off`);
  if (fit) {
    const atempo = natural / target;
    const tmp = join(projectDir, 'voice.fit.wav');
    if (Math.abs(atempo - 1) > 0.001) {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voicePath, '-filter:a', `atempo=${atempo.toFixed(6)}`, tmp], { cwd: ROOT });
      const old = join(projectDir, 'voice.wav');
      const dest = historyPath(projectDir, 'voice', 'voice.wav'); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(old, dest);
      copyFileSync(tmp, old);
    }
  }
  // Kokoro can report a negative start for the first word; clamp it and validate the timings.
  const words = result.words?.length ? result.words : readJson(wordsPath);
  writeJsonArtifact(projectDir, 'voice', 'words.json', scaleWords(words, fit ? target / natural : 1), 'words');
  return {
    natural,
    target,
    fitted: fit && Math.abs(natural - target) / target > 0.001,
    provider,
    language,
    warnings: result.warnings ?? [],
    characters: result.characters ?? 0,
    costUsd: result.costUsd ?? 0,
    usage: result.usage ?? null,
  };
}
