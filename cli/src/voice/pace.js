// Local, free voice pace rebuild: reference pause policy, pitch-preserving tempo and monotonic word scaling.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { capture, ROOT, run } from '../env.js';
import { atomicWrite, backupBeforeWrite, readJson, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { normalizeWord } from '../../../shared/words.mjs';
import { applyPauseCuts, decodePcm, DEFAULT_MODEL, DEFAULT_VOICE_ID, requestHash, wordsFromAlignment } from './elevenlabs.js';
import { isV3, renderDeliveryBlock } from './delivery.js';
import { VOICE_SR, wavFromPcm } from './wav.js';

export const DEFAULT_PACES = [1.10, 1.15, 1.20];
export const PACE_POLICY = { dramatic: 0.35, other: 0.12, beatGap: 0.15 };
const probe = (file) => Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));

/** The exact request the cached base take was made with (single v3 request, local pauses). */
export function baseTakeRequest({ project, lines }) {
  const voice = project.voice ?? {};
  const model = voice.model ?? DEFAULT_MODEL;
  if (!isV3(model)) throw new Error(`voice pace rebuild reads a single cached ${model} take; only eleven_v3/v4 single-take projects are supported`);
  if (!lines?.length) throw new Error('voice pace rebuild needs script lines');
  const voiceId = voice.voiceId || DEFAULT_VOICE_ID;
  const settings = {
    stability: voice.settings?.stability ?? 0.5,
    similarity_boost: voice.settings?.similarity_boost ?? 0.75,
    style: voice.settings?.style ?? 0,
    use_speaker_boost: voice.settings?.use_speaker_boost ?? true,
    speed: Math.max(0.7, Math.min(1.2, voice.settings?.speed ?? 1)),
  };
  const outputFormat = voice.settings?.outputFormat ?? 'mp3_44100_128';
  const single = renderDeliveryBlock(lines, model, { localPauses: true });
  const hash = requestHash({ provider: 'elevenlabs', model, voiceId, text: single.text, settings, outputFormat, previousText: null, nextText: null });
  return { model, voiceId, settings, outputFormat, single, hash, cachePath: join('.fableon', 'voice-cache', `${hash}.json`) };
}

/** Load the cached base take and its word timeline. Makes no provider request. */
export async function loadCachedBaseTake({ projectDir, project, lines }) {
  const info = baseTakeRequest({ project, lines });
  const file = join(projectDir, info.cachePath);
  if (!existsSync(file)) throw new Error(`voice pace: cached base take not found (${info.cachePath}); it was not generated from this script/settings. No provider call was made.`);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const original = record.alignment?.characters?.join('') === info.single.spokenText;
  const alignment = original ? record.alignment : record.normalizedAlignment;
  if (!alignment?.characters?.join('') || alignment.characters.join('') !== info.single.spokenText) {
    throw new Error('voice pace: the cached take alignment does not match this script; rerun the voice stage once to refresh the take');
  }
  const pcm = await decodePcm(record.audioBase64, projectDir, 'pace');
  const mapped = wordsFromAlignment({ blockText: info.single.spokenText, lines: info.single.lines, alignment, blockStart: 0, blockDuration: pcm.length / (2 * VOICE_SR) });
  if (!mapped.words.length) throw new Error('voice pace: cached alignment produced no words');
  return { ...info, record, pcm, words: mapped.words, warnings: mapped.warnings, duration: pcm.length / (2 * VOICE_SR), path: file };
}

/** Reference pace: only the hook's punchline, the deadpan second line and the twist keep a dramatic pause. */
export function referencePauseCuts(words, lines, policy = PACE_POLICY) {
  const cuts = [];
  const hook = lines.find((l) => l.beat === 'hook') ?? null;
  const deadpan = lines.filter((l) => l.beat === 'deadpan');
  const deadpanSecond = deadpan[1] ?? null;
  const twist = [...lines].reverse().find((l) => l.beat === 'twist') ?? null;
  for (const line of lines) {
    const indexes = words.map((w, i) => (w.line === line.n ? i : -1)).filter((i) => i >= 0);
    if (!indexes.length) continue;
    const before = Number(line.delivery?.pauseBefore ?? 0);
    if (before > 0) {
      if (line.n === lines[0]?.n) {
        cuts.push({ index: indexes[0], seconds: 0, kind: 'start', reason: `line ${line.n} leading pause removed` });
      } else {
        const dramatic = line.n === deadpanSecond?.n || line.n === twist?.n;
        const limit = dramatic ? policy.dramatic : policy.beatGap;
        cuts.push({ index: indexes[0], seconds: Math.min(before, limit), kind: dramatic ? 'dramatic' : 'beat-gap', reason: `line ${line.n} ${dramatic ? 'dramatic' : 'beat'} pauseBefore` });
      }
    }
    const pauses = line.delivery?.pauses ?? [];
    for (let i = 0; i < pauses.length; i++) {
      const p = pauses[i];
      const after = indexes.find((idx) => normalizeWord(words[idx].w) === normalizeWord(p.after));
      if (after === undefined) {
        cuts.push({ warning: `line ${line.n} pause word "${p.after}" not found`, seconds: 0, index: indexes[0], kind: 'missing', reason: `line ${line.n} pause after "${p.after}"` });
        continue;
      }
      const hookPunchline = hook?.n === line.n && i === pauses.length - 1;
      const limit = hookPunchline ? policy.dramatic : policy.other;
      cuts.push({ index: after + 1, seconds: Math.min(Number(p.s), limit), kind: hookPunchline ? 'dramatic' : 'pause', reason: `line ${line.n} ${hookPunchline ? 'hook punchline' : 'pause'} after "${p.after}"` });
    }
  }
  return cuts.filter((c) => c.warning || c.seconds > 0 || c.kind === 'start');
}

/** Scale word times by 1/pace and keep them complete, inside the take and strictly monotonic. */
export function scaleWordsForPace(words, pace, duration = null) {
  const k = 1 / pace;
  let prev = 0;
  return words.map((w) => {
    let a = Math.max(prev, +(w.a * k).toFixed(3));
    let b = Math.max(a + 0.001, +(w.b * k).toFixed(3));
    if (duration != null) {
      a = Math.min(a, Math.max(0, duration - 0.001));
      b = Math.min(Math.max(b, a + 0.001), duration);
    }
    prev = b;
    return { ...w, a: +a.toFixed(3), b: +b.toFixed(3) };
  });
}

function applyPolicy(base, lines, policy) {
  const cuts = referencePauseCuts(base.words, lines, policy);
  const inserted = applyPauseCuts(base.pcm, base.words, cuts);
  return { pcm: inserted.pcm, words: inserted.words, cuts, warnings: inserted.warnings };
}

function cutsSummary(cuts) {
  const byIndex = new Map();
  for (const c of cuts) if (!c.warning && c.seconds > 0) byIndex.set(c.index, Math.max(byIndex.get(c.index) ?? 0, c.seconds));
  const count = (kind) => cuts.filter((c) => c.kind === kind && c.seconds > 0).length;
  return { total: [...byIndex.values()].reduce((n, s) => n + s, 0), dramatic: count('dramatic'), other: count('pause'), beatGaps: count('beat-gap'), points: byIndex.size };
}

async function writePacedWav(pcm, pace, dest) {
  const tmp = join(dest + `.src-${process.pid}.wav`);
  try {
    atomicWrite(tmp, wavFromPcm(pcm));
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-filter:a', `atempo=${Number(pace).toFixed(6)}`, '-ar', String(VOICE_SR), '-ac', '1', dest], { cwd: ROOT });
  } finally { rmSync(tmp, { force: true }); }
  return probe(dest);
}

const wordCount = (lines) => lines.reduce((n, l) => n + String(l.text).split(/\s+/).filter(Boolean).length, 0);
const mdTable = (rows) => [`| ${['pace', 'file', 'length', 'words/s', 'dramatic', 'other', 'beat gaps'].join(' | ')} |`, `| ${Array(7).fill('---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

/** Write the three pitch-preserving variants and voice/pace/pace.md from the cached take. */
export async function buildPaceVariants({ projectDir, project, lines, paces = DEFAULT_PACES, policy = PACE_POLICY }) {
  const base = await loadCachedBaseTake({ projectDir, project, lines });
  const list = [...new Set(paces.map(Number).filter((p) => p > 0.5 && p < 2))].sort((a, b) => a - b);
  if (!list.length) throw new Error('voice pace: no valid paces (0.5-2.0)');
  const dir = join(projectDir, 'voice', 'pace');
  mkdirSync(dir, { recursive: true });
  const variants = [];
  for (const pace of list) {
    const applied = applyPolicy(base, lines, policy);
    const file = join(dir, `${pace.toFixed(2)}.wav`);
    const duration = await writePacedWav(applied.pcm, pace, file);
    variants.push({ pace, file, duration, wordsPerSecond: +(wordCount(lines) / duration).toFixed(3), cuts: cutsSummary(applied.cuts), words: scaleWordsForPace(applied.words, pace, duration) });
  }
  const rows = variants.map((v) => [v.pace.toFixed(2), `voice/pace/${v.pace.toFixed(2)}.wav`, `${v.duration.toFixed(2)} s`, v.wordsPerSecond.toFixed(3), v.cuts.dramatic, v.cuts.other, v.cuts.beatGaps]);
  const md = `# Voice pace variants\n\nSource: cached ElevenLabs base take \`${base.hash}\` (${base.model}, voice ${base.voiceId}), **${base.duration.toFixed(2)} s**, ${wordCount(lines)} words, ${(wordCount(lines) / base.duration).toFixed(3)} words/s. No provider request: audio and alignment were decoded from the local cache.\n\nPause policy (reference): dramatic <= ${policy.dramatic.toFixed(2)} s only at the hook punchline, the deadpan second line and the twist; every other pause <= ${policy.other.toFixed(2)} s; beat gaps <= ${policy.beatGap.toFixed(2)} s. Tempo is pitch-preserving \`atempo\` on the whole take, so pauses scale with it.\n\n${mdTable(rows)}\n\nPick one with \`fableon voice pace --project ${projectDir.split('/').slice(-2).join('/')} --choose <pace>\`; that writes voice.wav, words.json and \`voice.pace\` / \`voice.pauses\` in project.json.\n`;
  writeTextArtifact(projectDir, 'voice', 'voice/pace/pace.md', md);
  return { base, variants, md: join(dir, 'pace.md') };
}

/** Apply the chosen pace: write voice.wav, scaled monotonic words.json and project.json fields. */
export async function choosePace({ projectDir, project, lines, pace, policy = PACE_POLICY }) {
  const p = Number(pace);
  if (!(p > 0.5 && p < 2)) throw new Error(`voice pace: choose a pace between 0.5 and 2.0 (got ${pace})`);
  const base = await loadCachedBaseTake({ projectDir, project, lines });
  const applied = applyPolicy(base, lines, policy);
  const tmp = join(projectDir, '.fableon', 'voice-tmp', `chosen-${Date.now()}.wav`);
  const duration = await writePacedWav(applied.pcm, p, tmp);
  const wav = readFileSync(tmp);
  rmSync(tmp, { force: true });
  backupBeforeWrite(projectDir, 'voice', 'voice.wav', wav);
  atomicWrite(join(projectDir, 'voice.wav'), wav);
  const words = scaleWordsForPace(applied.words, p, duration);
  writeJsonArtifact(projectDir, 'voice', 'words.json', words, 'words');
  const chars = lines.reduce((n, l) => n + Array.from(l.text).length, 0);
  project.voice = project.voice ?? {};
  project.voice.pace = p;
  project.voice.pauses = { dramatic: policy.dramatic, other: policy.other, beatGap: policy.beatGap };
  project.voice.paceApplied = 'local';
  project.voice.rate = { ...(project.voice.rate ?? {}), delivered: { wordsPerSecond: +(wordCount(lines) / duration).toFixed(3), charactersPerSecond: +(chars / duration).toFixed(3) } };
  writeJsonArtifact(projectDir, 'voice', 'project.json', project, 'project');
  return { pace: p, path: join(projectDir, 'voice.wav'), duration, words, base, cuts: cutsSummary(applied.cuts) };
}
