// Voice stage: run Kokoro, optionally fit to the project length with pitch-preserving ffmpeg atempo.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { capture, findPython, run, ROOT } from '../env.js';
import { historyPath, readJson, writeJsonArtifact } from '../core/artifacts.js';
import { WPS } from './script.js';

const probe = (file) => Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
const scaleWords = (words, k) => words.map((w) => ({ ...w, a: +Math.max(0, w.a * k).toFixed(3), b: +Math.max(0, w.b * k).toFixed(3) }));

export async function runVoice({ projectDir: projectDirArg, project, fit = true }) {
  const projectDir = resolve(projectDirArg);
  const py = findPython();
  if (!py) throw new Error('voice needs Python 3.12 (set FABLEON_PYTHON or create .venv)');
  if (!existsSync(join(projectDir, 'SCRIPT.md'))) throw new Error('voice needs SCRIPT.md');
  await run(py, [join(ROOT, 'voice', 'make_voice.py'), String(project.voice.speed), project.voice.voice], { cwd: join(ROOT, 'voice'), env: { ...process.env, PROJECT_DIR: projectDir } });
  const voice = join(projectDir, 'voice.wav'), wordsPath = join(projectDir, 'words.json');
  if (!existsSync(voice) || !existsSync(wordsPath)) throw new Error('voice did not write voice.wav/words.json');
  const natural = probe(voice);
  const target = Number(project.seconds);
  const delta = Math.abs(natural - target) / target;
  if (fit && delta > 0.10) throw new Error(`voice is ${natural.toFixed(2)} s, ${(delta * 100).toFixed(1)} % from ${target} s (outside 10 %); change the script to about ${Math.round(target * WPS)} words or pass --fit off`);
  if (fit) {
    const atempo = natural / target;
    const tmp = join(projectDir, 'voice.fit.wav');
    if (Math.abs(atempo - 1) > 0.001) {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voice, '-filter:a', `atempo=${atempo.toFixed(6)}`, tmp], { cwd: ROOT });
      const old = join(projectDir, 'voice.wav');
      const dest = historyPath(projectDir, 'voice', 'voice.wav'); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(old, dest);
      copyFileSync(tmp, old);
    }
  }
  // Kokoro can report a negative start for the first word; clamp it and validate the timings.
  const words = readJson(wordsPath);
  writeJsonArtifact(projectDir, 'voice', 'words.json', scaleWords(words, fit ? target / natural : 1), 'words');
  return { natural, target, fitted: fit && Math.abs(natural - target) / target > 0.001 };
}
