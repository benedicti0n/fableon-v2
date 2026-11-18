// Voice stage: provider dispatch, then natural/exact length fitting with local pauses, speed and atempo.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { capture, findPython, loadDotEnv, ROOT } from '../env.js';
import { historyPath, readJson, writeJsonArtifact } from '../core/artifacts.js';
import { run } from '../env.js';
import { synthesize } from '../voice/index.js';
import { alignWords } from '../voice/align.js';
import { countWords } from '../../../shared/words.mjs';
import { plannedPauseSeconds, WPS } from './script.js';

const probe = (file) => Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
const scaleWords = (words, k) => words.map((w) => ({ ...w, a: +Math.max(0, w.a * k).toFixed(3), b: +Math.max(0, w.b * k).toFixed(3) }));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export async function runVoice({ projectDir: projectDirArg, project, fit = true, cachedOnly = false }) {
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
  const baseSpeed = Number(voice.pace) || voice.settings?.speed || voice.speed || 1;
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

  const upper = target * 1.12, lower = target * 0.88;
  if (fit && fitMode === 'natural') {
    if (natural <= upper && natural >= lower) {
      steps.push({ step: 'natural within 12 %', seconds: +natural.toFixed(2) });
    } else if (natural > upper) {
      if (planned > 0) {
        const desiredPause = Math.max(planned * 0.6, planned - (natural - upper));
        pauseScale = clamp(desiredPause / planned, 0.6, 1);
        if (pauseScale < 0.999) {
          result = await synthesize({ provider, projectDir, project: { ...project, voice: voiceFor(speed) }, pauseScale });
          natural = probe(voicePath);
          steps.push({ step: `local pauses × ${pauseScale.toFixed(2)}`, seconds: +natural.toFixed(2), saved: +(planned * (1 - pauseScale)).toFixed(2) });
        }
      }
      if (!cachedOnly && natural > upper) {
        const desiredSpeed = Math.min(1.08, clamp(speed * (natural / upper), 0.7, 1.2));
        if (Math.abs(desiredSpeed - speed) > 0.001) {
          speed = desiredSpeed;
          result = await synthesize({ provider, projectDir, project: { ...project, voice: voiceFor(speed) }, pauseScale });
          natural = probe(voicePath);
          steps.push({ step: `provider speed ${speed.toFixed(3)}`, seconds: +natural.toFixed(2) });
        }
      }
      if (natural > upper) {
        let tempo = natural / upper;
        if (speed * tempo > 1.08) tempo = 1.08 / speed;
        if (tempo > 1.06) throw new Error(`voice is ${natural.toFixed(2)} s; more than 6 % atempo would be needed after pauses and speed (natural fit allows 12 %); change the script to about ${Math.round((target - planned * 0.6) * (rate ?? project.voice?.rate?.delivered?.wordsPerSecond ?? WPS))} words`);
        if (tempo > 1.001) {
          atempo = tempo;
          const tmp = join(projectDir, 'voice.fit.wav');
          await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voicePath, '-filter:a', `atempo=${atempo.toFixed(6)}`, tmp], { cwd: ROOT });
          const old = join(projectDir, 'voice.wav');
          const dest = historyPath(projectDir, 'voice', 'voice.wav'); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(old, dest);
          copyFileSync(tmp, old);
          steps.push({ step: `atempo ${atempo.toFixed(4)}`, seconds: +(natural / atempo).toFixed(2) });
          natural = natural / atempo;
        }
      }
    } else {
      let tempo = natural / lower;
      if (tempo < 0.94) throw new Error(`voice is ${natural.toFixed(2)} s; slowing more than 6 % is not allowed in natural fit; change the script to about ${Math.round((target - planned * 0.6) * (rate ?? project.voice?.rate?.delivered?.wordsPerSecond ?? WPS))} words`);
      if (Math.abs(tempo - 1) > 0.001) {
        atempo = tempo;
        const tmp = join(projectDir, 'voice.fit.wav');
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voicePath, '-filter:a', `atempo=${atempo.toFixed(6)}`, tmp], { cwd: ROOT });
        const old = join(projectDir, 'voice.wav');
        const dest = historyPath(projectDir, 'voice', 'voice.wav'); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(old, dest);
        copyFileSync(tmp, old);
        steps.push({ step: `atempo ${atempo.toFixed(4)}`, seconds: +(natural / atempo).toFixed(2) });
        natural = natural / atempo;
      }
    }
  } else if (fit) {
    const delta = Math.abs(natural - target) / target;
    if (delta > 0.10) throw new Error(`voice is ${natural.toFixed(2)} s, ${(delta * 100).toFixed(1)} % from ${target} s (outside 10 %); change the script to about ${Math.round(target * (rate ?? project.voice?.rate?.delivered?.wordsPerSecond ?? WPS))} words or pass --fit off`);
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
  let words = result.words?.length ? result.words : readJson(wordsPath);
  let alignment = null;
  let timesAreFinal = false;
  const wantAlign = script && provider !== 'elevenlabs' && voice.align !== false;
  if (wantAlign) {
    try {
      const aligned = await alignWords({ projectDir, wavPath: voicePath, script, method: voice.alignMethod ?? 'auto' });
      words = aligned.words;
      alignment = { method: aligned.method, wordCount: words.length, warnings: aligned.warnings ?? [] };
      timesAreFinal = true;
      steps.push({ step: `forced aligner ${aligned.method}`, words: words.length });
    } catch (e) {
      alignment = { method: 'provider-fallback', error: String(e.message ?? e).split('\n').slice(0, 4).join(' ') };
      steps.push({ step: 'forced aligner failed; provider timings kept', error: alignment.error });
    }
  }
  if (provider === 'sarvam' && voice.trim !== false && words.length) {
    const first = Math.min(...words.map((w) => w.a));
    const last = Math.max(...words.map((w) => w.b));
    const start = Math.max(0, first - 0.05);
    const end = Math.min(probe(voicePath), last + 0.20);
    if (start > 0.005 || end < probe(voicePath) - 0.005) {
      const tmp = join(projectDir, 'voice.trim.wav');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voicePath, '-af', `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS`, tmp], { cwd: ROOT });
      copyFileSync(tmp, voicePath);
      words = words.map((w) => ({ ...w, a: +Math.max(0, w.a - start).toFixed(3), b: +Math.max(0, w.b - start).toFixed(3) }));
      timesAreFinal = true;
      steps.push({ step: 'trim lead/tail', lead: +start.toFixed(3), tail: +(probe(voicePath) - (last - start)).toFixed(3) });
    }
  }
  if (provider === 'sarvam' && words.length) {
    const py = findPython();
    if (py) {
      writeJsonArtifact(projectDir, 'voice', 'words.json', words, 'words');
      try {
        const out = capture(py, [join(ROOT, 'cli', 'src', 'voice', 'guard_pauses.py'), voicePath, wordsPath], { cwd: ROOT });
        const guard = JSON.parse(out.trim().split('\n').at(-1));
        words = readJson(wordsPath);
        steps.push({ step: 'hindi pause guard', ...guard });
        alignment = { ...(alignment ?? {}), guard };
        timesAreFinal = true;
      } catch (e) {
        steps.push({ step: 'hindi pause guard failed', error: String(e.message ?? e).slice(0, 200) });
      }
    }
  }
  if (provider === 'sarvam' && voice.normalize !== false && words.length) {
    const py = findPython();
    if (py) {
      const out = capture(py, [join(ROOT, 'cli', 'src', 'voice', 'normalize_voice.py'), voicePath], { cwd: ROOT });
      const metrics = JSON.parse(out.trim().split('\n').at(-1));
      steps.push({ step: 'normalize voice', ...metrics });
      alignment = { ...(alignment ?? {}), normalize: metrics };
    }
  }
  const finalDuration = probe(voicePath);
  const deliveredWords = script ? script.lines.reduce((n, l) => n + countWords(l.text), 0) : 0;
  const deliveredChars = script ? script.lines.reduce((n, l) => n + Array.from(l.text).length, 0) : 0;
  if (deliveredWords && finalDuration > 0) {
    project.voice = project.voice ?? {};
    project.voice.rate = { ...(project.voice.rate ?? {}), delivered: { wordsPerSecond: +(deliveredWords / finalDuration).toFixed(3), charactersPerSecond: +(deliveredChars / finalDuration).toFixed(3) } };
    writeJsonArtifact(projectDir, 'voice', 'project.json', project, 'project');
  }
  writeJsonArtifact(projectDir, 'voice', 'words.json', timesAreFinal ? words : scaleWords(words, atempo !== 1 ? 1 / atempo : 1), 'words');
  natural = finalDuration;
  return {
    natural,
    target,
    fitted: atempo !== 1,
    fit: { mode: fitMode, steps },
    provider,
    language,
    alignment,
    warnings: result.warnings ?? [],
    characters: result.characters ?? 0,
    costUsd: result.costUsd ?? 0,
    usage: result.usage ?? null,
  };
}
