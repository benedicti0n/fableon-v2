// Round-3 Sarvam auditions: Nachiket across Bulbul v4 Flash, plain vs performance-marked, two paces.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir } from '../project.js';
import { synthesizeSarvam, SARVAM_V4, NACHIKET } from './sarvam.js';

const EXCERPT = [0, 12, 13, 14, 17, 18, 19, 20];
const PACES = [1.10, 1.25];

export async function runRound3(dirArg) {
  const dir = projectDir(dirArg);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const script = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));
  const lines = EXCERPT.map((n) => script.lines.find((l) => l.n === n)).filter(Boolean);
  if (lines.length !== EXCERPT.length) throw new Error('round3: script is missing one of the eight excerpt lines');
  const out = join(dir, 'voice', 'auditions', 'round3');
  mkdirSync(out, { recursive: true });
  const projectFor = (pace, marked) => ({ ...project, voice: { ...(project.voice ?? {}), provider: 'sarvam', model: SARVAM_V4, voiceId: NACHIKET, language: 'hi', pace, performance: marked, settings: { ...(project.voice?.settings ?? {}) } } });
  const rows = [];
  for (const marked of [false, true]) for (const pace of PACES) {
    const r = await synthesizeSarvam({ projectDir: dir, project: projectFor(pace, marked), lines, marked, pace });
    const file = join(out, `sarvam-v4-flash__nachiket__${marked ? 'marked' : 'plain'}__${pace.toFixed(2)}.wav`);
    copyFileSync(join(dir, 'voice.wav'), file);
    rows.push({ provider: 'sarvam', model: SARVAM_V4, voice: 'nachiket', variant: marked ? 'performance-marked' : 'plain', pace, file, seconds: +r.duration.toFixed(2), characters: r.characters, costInr: r.costInr, costUsd: r.costUsd, words: r.words.length });
  }
  const ref = join(dir, 'voice', 'auditions', 'round2', 'eleven-v3__callum__clean.mp3');
  if (existsSync(ref)) copyFileSync(ref, join(out, 'reference__callum-v3__round2-clean.mp3'));
  const md = ['# Round-3 auditions', '', `Excerpt lines: ${EXCERPT.join(', ')}. No new ElevenLabs call; the Callum reference is a copy of the cached round-2 take.`, '', '| file | model | voice | variant | pace | seconds | chars | cost ₹ |', '|---|---|---|---|---:|---:|---:|---:|', ...rows.map((r) => `| ${r.file.split('/').pop()} | ${r.model} | ${r.voice} | ${r.variant} | ${r.pace.toFixed(2)} | ${r.seconds} | ${r.characters} | ${r.costInr.toFixed(2)} |`), '', 'Nachiket is a Bulbul v4 Flash persona (`nachiket_hi_devotional`); the v3 short-name catalog does not contain him. The marked variant splits at the line pause marks and inserts exact local silences (0.15–0.6 s); Bulbul has no SSML.', ''].join('\n') + '\n';
  writeFileSync(join(out, 'round3.md'), md);
  return { ok: rows.length === 4, dir: out, rows, md: join(out, 'round3.md') };
}
