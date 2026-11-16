// Round-2 delivery auditions: a Savitri-style Hindi excerpt with pauses/emphasis, default vs expressive.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { capture, loadDotEnv, run } from '../env.js';
import { requestSpeech, voiceApiKey } from './elevenlabs.js';
import { renderDeliveryLine, toneSettings } from './delivery.js';
import { VOICE_SR, silencePcm } from './wav.js';

export const ROUND2_LINES = [
  { n: 0, beat: 'hook', gloss: 'A princess argued Death into a corner.', text: 'राजकुमारी ने मौत को बहस में हरा दिया।', delivery: { tone: 'deadpan', pauseBefore: 0.4, emphasis: ['मौत'] } },
  { n: 1, beat: 'setting', gloss: 'Savitri chose her own husband; Narada named the one defect.', text: 'सावित्री ने पति खुद चुना, नारद ने एक ही कमी बताई।', delivery: { tone: 'matter-of-fact', pauseBefore: 0.25, emphasis: ['एक'] } },
  { n: 2, beat: 'action', gloss: 'Satyavan was going to die within a year, and she still said yes.', text: 'सत्यवान साल भर में मरने वाला था, फिर भी उसने हाँ कह दी।', delivery: { tone: 'warm', pauseBefore: 0.3, emphasis: ['हाँ'] } },
  { n: 3, beat: 'deadpan', gloss: 'Good news: Yama let her ask for any boon.', text: 'अच्छी खबर: यम ने कोई भी वरदान माँगने दिया।', delivery: { tone: 'deadpan', pauseBefore: 0.5, pauses: [{ after: 'खबर', s: 0.25 }], emphasis: ['कोई भी'] } },
  { n: 4, beat: 'deadpan', gloss: 'Bad news: she did not ask for her husband’s life.', text: 'बुरी खबर: उसने अपने पति की जान नहीं माँगी।', delivery: { tone: 'deadpan', pauseBefore: 0.5, pauses: [{ after: 'खबर', s: 0.25 }], emphasis: ['जान'] } },
  { n: 5, beat: 'twist', gloss: 'Yama granted a hundred sons, forgetting they need a father.', text: 'यम ने सौ बेटों का वरदान दिया, भूल गया कि बेटों को बाप चाहिए।', delivery: { tone: 'mock-serious', pauseBefore: 0.4, emphasis: ['बाप'] } },
];

const TAKES = [
  { voice: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO', model: 'eleven_multilingual_v2', variant: 'default' },
  { voice: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO', model: 'eleven_multilingual_v2', variant: 'expressive' },
  { voice: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO', model: 'eleven_v3', variant: 'default' },
  { voice: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO', model: 'eleven_v3', variant: 'expressive' },
  { voice: 'George', id: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_v3', variant: 'default' },
  { voice: 'George', id: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_v3', variant: 'expressive' },
  { voice: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO', model: 'eleven_v3', variant: 'clean' },
];

const chars = (s) => Array.from(String(s)).length;
const slug = (s) => String(s).normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'take';
const silence = (s) => silencePcm(s);

async function toPcm(audioBase64, dir, tag) {
  const raw = join(dir, `tmp-${tag}-${randomBytes(3).toString('hex')}.mp3`);
  const out = raw.replace(/\.mp3$/, '.raw');
  writeFileSync(raw, Buffer.from(audioBase64, 'base64'));
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(VOICE_SR), out]);
    return readFileSync(out);
  } finally {
    rmSync(raw, { force: true }); rmSync(out, { force: true });
  }
}

async function encodeMp3(pcm, file) {
  const raw = file.replace(/\.mp3$/, '.raw');
  writeFileSync(raw, pcm);
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(VOICE_SR), '-ac', '1', '-i', raw, '-codec:a', 'libmp3lame', '-b:a', '128k', file]);
  } finally { rmSync(raw, { force: true }); }
}

export async function runRound2(projectDir) {
  loadDotEnv();
  const key = voiceApiKey();
  if (!key) {
    console.log('provider: elevenlabs');
    console.log('key: MISSING (ELEVENLABS_API_KEY)');
    return { ok: false, key: false };
  }
  const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
  if (project.language !== 'hi') throw new Error('round-2 auditions require a Hindi project');
  const out = join(projectDir, 'voice', 'auditions', 'round2');
  mkdirSync(out, { recursive: true });
  const planned = TAKES.reduce((n, t) => n + ROUND2_LINES.reduce((m, l) => m + chars(t.variant === 'clean' ? l.text : renderDeliveryLine(l, t.model).text), 0), 0);
  if (planned > 3000) throw new Error(`round-2 auditions would use ${planned} characters (limit 3000)`);
  const rows = [];
  let totalChars = 0, totalCost = 0;
  for (const take of TAKES) {
    const file = `${slug(take.model)}__${slug(take.voice)}__${take.variant}.mp3`;
    const voice = { ...(project.voice ?? {}), model: take.model };
    const pcm = [];
    let takeChars = 0, takeCost = 0;
    for (const [i, line] of ROUND2_LINES.entries()) {
      const clean = take.variant === 'clean';
      const settings = clean
        ? { ...(project.voice?.settings ?? {}), outputFormat: 'mp3_44100_128', languageCode: 'hi' }
        : { ...toneSettings(voice, line.delivery?.tone, { expressive: take.variant === 'expressive' }), outputFormat: 'mp3_44100_128', languageCode: 'hi' };
      const rendered = clean ? { text: line.text, spokenText: line.text } : renderDeliveryLine(line, take.model);
      const prev = i > 0 ? ROUND2_LINES[i - 1].text : null;
      const next = i + 1 < ROUND2_LINES.length ? ROUND2_LINES[i + 1].text : null;
      const res = await requestSpeech({ projectDir, model: take.model, voiceId: take.id, text: rendered.text, settings, previousText: prev, nextText: next, maxChars: 3000, spent: totalChars, stage: 'voice-audition' });
      takeChars += res.chars; takeCost += res.costUsd;
      const pause = clean ? 0.08 : (line.delivery?.pauseBefore ?? 0.08);
      pcm.push(silence(pause));
      pcm.push(await toPcm(res.audioBase64, out, `${take.variant}-${i}`));
    }
    const audioPcm = Buffer.concat(pcm);
    const duration = audioPcm.length / (2 * VOICE_SR);
    await encodeMp3(audioPcm, join(out, file));
    totalChars += takeChars; totalCost += takeCost;
    rows.push({ file, voice: take.voice, id: take.id, model: take.model, variant: take.variant, characters: takeChars, costUsd: takeCost, duration });
    console.log(`made ${file}  ${duration.toFixed(2)}s  ${takeChars} chars  $${takeCost.toFixed(4)}`);
  }
  const lines = [
    '# Round-2 delivery auditions — Savitri (Hindi)',
    '',
    'Sample excerpt (with delivery marks):',
    '',
    ...ROUND2_LINES.flatMap((l) => [`- **${l.beat}** ${l.text}`, `  - gloss: ${l.gloss}`, `  - delivery: ${JSON.stringify(l.delivery)}`]),
    '',
    'Variants: **default** = normal tone settings; **expressive** = stability 0.25 / style 0.35; **clean** = Callum × v3 with no delivery marks (control).',
    'Pauses before punchlines are inserted locally for exact timing; in-line pauses use the model tag/break. Emphasis is an ellipsis (v3) or 0.12 s break (v2).',
    '',
    '| file | voice | model | variant | characters | cost | duration |',
    '|---|---|---|---|---:|---:|---:|',
    ...rows.map((r) => `| ${r.file} | ${r.voice} | ${r.model} | ${r.variant} | ${r.characters} | $${r.costUsd.toFixed(4)} | ${r.duration.toFixed(2)} s |`),
    '',
    `Total: ${rows.length} takes, ${totalChars} characters, $${totalCost.toFixed(4)}.`,
    '',
    'Listen to the round2 mp3s and choose voice + model + variant. Do not commit the mp3s.',
    '',
  ];
  writeFileSync(join(out, 'round2.md'), lines.join('\n'));
  console.log(`round2: ${out} (${rows.length} takes, ${totalChars} chars, $${totalCost.toFixed(4)})`);
  return { ok: true, dir: out, rows, characters: totalChars, costUsd: totalCost };
}
