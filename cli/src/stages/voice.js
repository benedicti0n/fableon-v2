// Voice stage: provider dispatch, then natural/exact length fitting with local pauses, speed and atempo.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { capture, loadDotEnv, ROOT } from '../env.js';
import { historyPath, readJson, writeJsonArtifact } from '../core/artifacts.js';
import { run } from '../env.js';
import { synthesize } from '../voice/index.js';
import { countWords } from '../../../shared/words.mjs';
import { plannedPauseSeconds, WPS } from './script.js';

const probe = (file) => Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
const scaleWords = (words, k) => words.map((w) => ({ ...w, a: +Math.max(0, w.a * k).toFixed(3), b: +Math.max(0, w.b * k).toFixed(3) }));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export async function runVoice({ projectDir: projectDirArg, project, fit = true }) {
  const projectDir = resolve(projectDirArg);
  loadDotEnv();
  const voice = project.voice ?? {};
  const provider = voice.provider ?? voice.engine ?? 'kokoro';
  const language = voice.language ?? project.language ?? 'en';
  if (!existsSync(join(projectDir, 'SCRIPT.md'))) throw new Error('voice needs SCRIPT.md');
  const target = Number(project.seconds);
  const rate = voice.rate?.wordsPerSecond ?? null;
  const fitMode = voice.fit ?? (provider === 'elevenlabs' && /^eleven_v3/.test(voice.model ?? '') ? 'natural' : 'exact');
  const script = existsSync(join(projectDir, 'script.json')) ? readJson(join(projectDir, 'script.json')) : null;
  const planned = script ? plannedPauseSeconds(script) : 0;
  const baseSpeed = voice.settings?.speed ?? voice.speed ?? 1;
  const voiceFor = (speed = baseSpeed) => ({
    ...voice, language,
    settings: { ...(voice.settings ?? {}), ...(provider === 'elevenlabs' ? { speed } : {}) },
  });
  let speed = baseSpeed;
  if (fitMode === 'exact' && provider === 'elevenlabs' && rate && script) {
    const naturalEstimate = script.lines.reduce((n, l) => n + countWords(l.text), 0) / rate;
    speed = clamp(baseSpeed * (naturalEstimate / target), 0.7, 1.2);
  }
  const steps = [];
  let result = await synthesize({ provider, projectDir, project: { ...project, voice: voiceFor(speed) } });
  const voicePath = join(projectDir, 'voice.wav'), wordsPath = join(projectDir, 'words.json');
  if (!existsSync(voicePath)) throw new Error(`${provider} did not write voice.wav`);
  let natural = probe(voicePath);
  steps.push({ step: 'base take', seconds: +natural.toFixed(2) });
  let pauseScale = 1;
  let atempo = 1;

  if (fit && fitMode === 'natural') {
    let delta = Math.abs(natural - target) / target;
    if (delta <= 0.12) {
      steps.push({ step: 'natural within 12 %', seconds: +natural.toFixed(2) });
    } else {
      if (planned > 0) {
        const desiredPause = Math.max(planned * 0.6, planned - (natural - target));
        pauseScale = clamp(desiredPause / planned, 0.6, 1);
        if (pauseScale < 0.999) {
          result = await synthesize({ provider, projectDir, project: { ...project, voice: voiceFor(speed) }, pauseScale });
          natural = probe(voicePath);
          steps.push({ step: `local pauses × ${pauseScale.toFixed(2)}`, seconds: +natural.toFixed(2), saved: +(planned * (1 - pauseScale)).toFixed(2) });
        }
      }
      delta = Math.abs(natural - target) / target;
      if (delta > 0.06) {
        const desiredSpeed = clamp(speed * (natural / target), 0.7, 1.2);
        if (Math.abs(desiredSpeed - speed) > 0.001) {
          speed = desiredSpeed;
          result = await synthesize({ provider, projectDir, project: { ...project, voice: voiceFor(speed) }, pauseScale });
          natural = probe(voicePath);
          steps.push({ step: `provider speed ${speed.toFixed(3)}`, seconds: +natural.toFixed(2) });
        }
      }
      delta = Math.abs(natural - target) / target;
      if (delta > 0.06) throw new Error(`voice is ${natural.toFixed(2)} s, ${(delta * 100).toFixed(1)} % from ${target} s after pauses and speed (natural fit allows 6 % atempo); change the script to about ${Math.round((target - planned * 0.6) * (rate ?? WPS))} words`);
      if (delta > 0.001) {
        atempo = natural / target;
        const tmp = join(projectDir, 'voice.fit.wav');
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voicePath, '-filter:a', `atempo=${atempo.toFixed(6)}`, tmp], { cwd: ROOT });
        const old = join(projectDir, 'voice.wav');
        const dest = historyPath(projectDir, 'voice', 'voice.wav'); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(old, dest);
        copyFileSync(tmp, old);
        steps.push({ step: `atempo ${atempo.toFixed(4)}`, seconds: target });
      }
    }
  } else if (fit) {
    const delta = Math.abs(natural - target) / target;
    if (delta > 0.10) throw new Error(`voice is ${natural.toFixed(2)} s, ${(delta * 100).toFixed(1)} % from ${target} s (outside 10 %); change the script to about ${Math.round(target * (rate ?? WPS))} words or pass --fit off`);
    if (delta > 0.001) {
      atempo = natural / target;
      const tmp = join(projectDir, 'voice.fit.wav');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voicePath, '-filter:a', `atempo=${atempo.toFixed(6)}`, tmp], { cwd: ROOT });
      const old = join(projectDir, 'voice.wav');
      const dest = historyPath(projectDir, 'voice', 'voice.wav'); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(old, dest);
      copyFileSync(tmp, old);
      steps.push({ step: `atempo ${atempo.toFixed(4)}`, seconds: target });
    }
  }
  const finalDuration = probe(voicePath);
  const words = result.words?.length ? result.words : readJson(wordsPath);
  writeJsonArtifact(projectDir, 'voice', 'words.json', scaleWords(words, atempo !== 1 ? 1 / atempo : 1), 'words');
  return {
    natural,
    target,
    fitted: atempo !== 1,
    fit: { mode: fitMode, steps },
    provider,
    language,
    warnings: result.warnings ?? [],
    characters: result.characters ?? 0,
    costUsd: result.costUsd ?? 0,
    usage: result.usage ?? null,
  };
}
