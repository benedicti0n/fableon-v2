// Offline voice tests: alignment -> words, ElevenLabs request/cache/billing (fetch mocked), Unicode Hindi.
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synthesizeElevenLabs, wordsFromAlignment } from '../cli/src/voice/elevenlabs.js';
import { wavFromPcm, VOICE_SR } from '../cli/src/voice/wav.js';
import { normalizeWord } from '../shared/words.mjs';
import { AUDITION_TEXT, pickCandidates } from '../cli/src/voice/auditions.js';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const alignmentFor = (text, secondsPerChar = 0.05) => {
  const characters = Array.from(text);
  let t = 0;
  return {
    characters,
    character_start_times_seconds: characters.map(() => { const s = t; t += secondsPerChar; return +s.toFixed(3); }),
    character_end_times_seconds: characters.map((_, i) => +((i + 1) * secondsPerChar).toFixed(3)),
  };
};

export async function runVoiceTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };

  const text = 'The moon is cheese. It shines.';
  const a = alignmentFor(text);
  const mapped = wordsFromAlignment({ blockText: text, lines: [{ n: 3, start: 0, end: text.length }], alignment: a, blockStart: 2, blockDuration: 4 });
  ok('alignment words', mapped.words.length === 6, String(mapped.words.length));
  ok('alignment line', mapped.words.every((w) => w.line === 3), JSON.stringify(mapped.words.map((w) => w.line)));
  ok('alignment offset', mapped.words[0].a >= 2, JSON.stringify(mapped.words[0]));
  ok('alignment monotonic', mapped.words.every((w, i) => i === 0 || w.a >= mapped.words[i - 1].a - 0.001), JSON.stringify(mapped.words));

  const short = wordsFromAlignment({ blockText: 'The moon is cheese.', lines: [{ n: 0, start: 0, end: 18 }], alignment: alignmentFor('The moon is.'), blockStart: 0, blockDuration: 1 });
  ok('interpolation warning', short.words.length === 4 && short.warnings.some((w) => /interpolated/.test(w)), JSON.stringify(short.warnings));
  ok('interpolation monotonic', short.words.every((w, i) => i === 0 || w.a >= short.words[i - 1].a - 0.001), JSON.stringify(short.words));

  const hi = 'यम ने कहा।';
  const h = wordsFromAlignment({ blockText: hi, lines: [{ n: 7, start: 0, end: hi.length }], alignment: alignmentFor(hi), blockStart: 0, blockDuration: 1 });
  ok('hindi alignment words', h.words.length === 3 && h.words.every((w) => w.line === 7), JSON.stringify(h.words));
  ok('hindi normalised', h.words.some((w) => normalizeWord(w.w) === 'यम'), JSON.stringify(h.words.map((w) => w.w)));

  const sample = [
    { voice_id: 'a', name: 'Alpha', category: 'premade', labels: { use_case: 'conversational', gender: 'male' }, verified_languages: [{ language: 'en' }] },
    { voice_id: 'b', name: 'Bravo', category: 'premade', labels: { use_case: 'narrative_story', gender: 'female' }, verified_languages: [{ language: 'hi' }] },
    { voice_id: 'c', name: 'Charlie', category: 'premade', labels: { use_case: 'informative_educational', gender: 'male' }, verified_languages: [{ language: 'hi' }] },
  ];
  const picked = pickCandidates(sample, 2);
  ok('audition voice ranking', picked[0].name === 'Bravo' && picked[1].name === 'Charlie', JSON.stringify(picked));
  ok('audition sample budget', AUDITION_TEXT.length > 30 && AUDITION_TEXT.length * 6 * 3 < 3000, `${AUDITION_TEXT.length} chars`);

  const oldFetch = globalThis.fetch;
  const oldKey = process.env.ELEVENLABS_API_KEY;
  const dir = mkdtempSync(join(tmpdir(), 'fableon-voice-'));
  try {
    process.env.ELEVENLABS_API_KEY = 'eleven-test-not-real';
    const pcm = Buffer.alloc(VOICE_SR * 2); // 1 s of silence
    const audioBase64 = wavFromPcm(pcm).toString('base64');
    const text = 'नमस्ते दुनिया।';
    const chars = Array.from(text).length;
    const words = alignmentFor(text);
    let calls = 0;
    globalThis.fetch = async (url, init = {}) => {
      calls++;
      ok('eleven request url', String(url).includes('/v1/text-to-speech/v1/with-timestamps'), String(url));
      ok('eleven auth header', init.headers?.['xi-api-key'] === 'eleven-test-not-real', 'header');
      const body = JSON.parse(init.body ?? '{}');
      ok('eleven hindi body', body.text === text && body.model_id === 'eleven_multilingual_v2', init.body);
      return new Response(JSON.stringify({ audio_base64: audioBase64, alignment: words, normalized_alignment: words }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const project = {
      language: 'hi',
      voice: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'v1', language: 'hi', maxCharsPerRun: 100, settings: { outputFormat: 'wav_24000', stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 } },
    };
    const blocks = [{ beat: 'hook', lines: [{ n: 0, text: 'नमस्ते दुनिया।' }] }];
    const first = await synthesizeElevenLabs({ projectDir: dir, project, blocks });
    ok('eleven wav written', existsSync(join(dir, 'voice.wav')), 'voice.wav');
    ok('eleven words', first.words.length === 2 && first.words[0].w.startsWith('नमस्ते'), JSON.stringify(first.words));
    ok('eleven billed', first.characters === chars && first.costUsd > 0, `${first.characters}/${chars} $${first.costUsd}`);
    const second = await synthesizeElevenLabs({ projectDir: dir, project, blocks });
    ok('eleven cache', calls === 1 && second.cached === true && second.characters === 0, `${calls} calls, ${second.cached}, ${second.characters}`);
    const log = readFileSync(join(dir, 'logs', 'calls.jsonl'), 'utf8');
    ok('voice log characters', log.includes(`"characters":${chars}`) && /"cached":true/.test(log), log.slice(0, 200));
    ok('voice log no key', !log.includes('eleven-test-not-real'), 'secret');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
    rmSync(dir, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors, checks };
}
