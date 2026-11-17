// Voice pace rebuild: reference pause caps, local cached take, pitch-preserving variants and monotonic words.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newProject } from '../cli/src/core/new-project.js';
import { wavFromPcm, VOICE_SR } from '../cli/src/voice/wav.js';
import { baseTakeRequest, buildPaceVariants, choosePace, PACE_POLICY, referencePauseCuts, scaleWordsForPace } from '../cli/src/voice/pace.js';

export async function runPaceTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const words = [
    { w: 'a', a: 0.0, b: 0.1, line: 0 }, { w: 'b', a: 0.1, b: 0.2, line: 0 },
    { w: 'c', a: 0.2, b: 0.3, line: 1 }, { w: 'd', a: 0.3, b: 0.4, line: 2 },
    { w: 'e', a: 0.4, b: 0.5, line: 3 }, { w: 'f', a: 0.5, b: 0.6, line: 4 },
  ];
  const lines = [
    { n: 0, beat: 'hook', text: 'a b', delivery: { pauseBefore: 0.4, pauses: [{ after: 'a', s: 0.6 }, { after: 'b', s: 0.6 }] } },
    { n: 1, beat: 'setting', text: 'c', delivery: { pauseBefore: 0.5, pauses: [{ after: 'c', s: 0.5 }] } },
    { n: 2, beat: 'deadpan', text: 'd', delivery: { pauseBefore: 0.4, pauses: [] } },
    { n: 3, beat: 'deadpan', text: 'e', delivery: { pauseBefore: 0.6, pauses: [{ after: 'e', s: 0.5 }] } },
    { n: 4, beat: 'twist', text: 'f', delivery: { pauseBefore: 0.6, pauses: [{ after: 'f', s: 0.5 }] } },
  ];
  const cuts = referencePauseCuts(words, lines);
  const byReason = (re) => cuts.find((c) => re.test(c.reason));
  ok('hook leading pause removed', cuts.find((c) => c.kind === 'start')?.seconds === 0, JSON.stringify(cuts));
  ok('hook non-punchline pause capped', byReason(/line 0 pause after "a"/)?.seconds === PACE_POLICY.other, JSON.stringify(cuts));
  ok('hook punchline gets the dramatic cap', byReason(/hook punchline after "b"/)?.seconds === PACE_POLICY.dramatic, JSON.stringify(cuts));
  ok('ordinary planned pause capped', byReason(/line 1 pause after "c"/)?.seconds === PACE_POLICY.other, JSON.stringify(cuts));
  ok('beat gap capped', byReason(/line 1 beat pauseBefore/)?.seconds === PACE_POLICY.beatGap, JSON.stringify(cuts));
  ok('first deadpan is not dramatic', byReason(/line 2 beat pauseBefore/)?.seconds === PACE_POLICY.beatGap, JSON.stringify(cuts));
  ok('second deadpan is dramatic', byReason(/line 3 dramatic pauseBefore/)?.seconds === PACE_POLICY.dramatic, JSON.stringify(cuts));
  ok('twist is dramatic', byReason(/line 4 dramatic pauseBefore/)?.seconds === PACE_POLICY.dramatic, JSON.stringify(cuts));
  ok('twist inner pause capped', byReason(/line 4 pause after "f"/)?.seconds === PACE_POLICY.other, JSON.stringify(cuts));

  const scaled = scaleWordsForPace([{ w: 'a', a: 0.5, b: 1.0, line: 0 }, { w: 'b', a: 1.0, b: 1.6, line: 0 }], 1.25, 1.28);
  ok('words scale and clamp', scaled[0].a === 0.4 && scaled[1].b === 1.28 && scaled[1].a >= scaled[0].b, JSON.stringify(scaled));

  const root = mkdtempSync(join(tmpdir(), 'fableon-pace-'));
  try {
    const { project } = newProject(root, { topic: 'Pace test', seconds: 10, language: 'hi' });
    project.voice = { ...project.voice, model: 'eleven_v3', voiceId: 'test-voice', settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 } };
    const scriptLines = [
      { n: 0, beat: 'hook', text: 'one two three four', delivery: { tone: 'deadpan', pauses: [{ after: 'one', s: 0.4 }] } },
      { n: 1, beat: 'setting', text: 'five six', delivery: { tone: 'deadpan' } },
      { n: 2, beat: 'twist', text: 'seven eight', delivery: { tone: 'deadpan', pauseBefore: 0.4 } },
    ];
    const info = baseTakeRequest({ project, lines: scriptLines });
    const text = info.single.spokenText;
    const chars = Array.from(text);
    const dt = 2.0 / chars.length;
    const alignment = {
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => +(i * dt).toFixed(6)),
      character_end_times_seconds: chars.map((_, i) => +((i + 1) * dt).toFixed(6)),
    };
    const audioBase64 = wavFromPcm(Buffer.alloc(VOICE_SR * 2 * 2)).toString('base64');
    const cache = join(root, info.cachePath);
    mkdirSync(join(root, '.fableon', 'voice-cache'), { recursive: true });
    writeFileSync(cache, JSON.stringify({ audioBase64, alignment, normalizedAlignment: alignment, chars: text.length, costUsd: 0, model: 'eleven_v3', voiceId: 'test-voice', outputFormat: 'mp3_44100_128' }));
    const built = await buildPaceVariants({ projectDir: root, project, lines: scriptLines, paces: [1.1, 1.2] });
    ok('cached base loaded', built.base.words.length === 8 && Math.abs(built.base.duration - 2) < 0.01, `${built.base.words.length} words, ${built.base.duration} s`);
    ok('variants written', built.variants.length === 2 && built.variants.every((v) => existsSync(v.file)), JSON.stringify(built.variants.map((v) => v.file)));
    ok('variants speed up', built.variants[0].duration < 3.0 && built.variants[1].duration < built.variants[0].duration, built.variants.map((v) => v.duration).join(','));
    ok('pace.md written', existsSync(join(root, 'voice', 'pace', 'pace.md')) && readFileSync(join(root, 'voice', 'pace', 'pace.md'), 'utf8').includes('1.10'), 'voice/pace/pace.md');
    const chosen = await choosePace({ projectDir: root, project, lines: scriptLines, pace: 1.15 });
    const written = JSON.parse(readFileSync(join(root, 'words.json'), 'utf8'));
    const saved = JSON.parse(readFileSync(join(root, 'project.json'), 'utf8'));
    const monotonic = written.every((w, i) => w.b > w.a && (!i || w.a >= written[i - 1].b));
    ok('chosen voice + complete words', existsSync(join(root, 'voice.wav')) && written.length === 8 && monotonic && written.at(-1).b <= chosen.duration + 0.002, JSON.stringify(written));
    ok('project stores pace + pauses', saved.voice.pace === 1.15 && saved.voice.pauses.dramatic === 0.35 && saved.voice.paceApplied === 'local' && saved.voice.rate.delivered.wordsPerSecond > 3, JSON.stringify({ pace: saved.voice.pace, pauses: saved.voice.pauses }));
  } finally { rmSync(root, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
