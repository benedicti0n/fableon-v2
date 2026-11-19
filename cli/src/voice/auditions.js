// Hindi voice auditions: discover account/library voices, synthesize one sample per voice/model, write mp3s + a table.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { capture, loadDotEnv } from '../env.js';
import { basename } from 'node:path';
import { emitStage } from '../core/events.js';
import { atomicWrite } from '../core/artifacts.js';
import { voiceApiKey, voicePricePer1k } from './elevenlabs.js';

const BASE = 'https://api.elevenlabs.io';
const PREFERRED_MODELS = ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_v3'];
export const AUDITION_TEXT = 'सावित्री ने यम से कहा, "मेरे पति के प्राण लौटा दो।" यम मुस्कुराया और बोला, "पहले कोई अच्छा कारण बताओ।"';
const MAX_AUDITION_CHARS = 3000;
const chars = (s) => Array.from(String(s)).length;
const slug = (s) => String(s).normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'voice';

const headers = (key) => ({ 'xi-api-key': key });
const getJson = async (url, key) => {
  const r = await fetch(url, { headers: headers(key), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`GET ${url} failed: HTTP ${r.status}`);
  return r.json();
};

function scoreVoice(v) {
  const verified = (v.verified_languages ?? []).some((l) => l.language === 'hi') || v.labels?.language === 'hi';
  const use = v.labels?.use_case ?? '';
  return (verified ? 100 : 0) + (use === 'narrative_story' ? 20 : use === 'informative_educational' ? 10 : 0) + (v.category === 'premade' ? 1 : 0);
}

export function pickCandidates(voices, n) {
  return [...voices]
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || String(a.name).localeCompare(String(b.name)))
    .slice(0, n)
    .map((v) => ({
      id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender ?? null,
      useCase: v.labels?.use_case ?? null,
      hindiVerified: (v.verified_languages ?? []).some((l) => l.language === 'hi') || v.labels?.language === 'hi',
      source: 'account',
    }));
}

export async function discover({ voices = 4 } = {}) {
  const key = voiceApiKey();
  if (!key) throw new Error('elevenlabs: ELEVENLABS_API_KEY is missing (set it in the environment or .env)');
  const [account, shared, models] = await Promise.all([
    getJson(`${BASE}/v2/voices?page_size=100`, key),
    getJson(`${BASE}/v1/shared-voices?language=hi&use_cases=narrative_story&page_size=50&include_custom_rates=false`, key).catch(() => ({ voices: [], total_count: 0 })),
    getJson(`${BASE}/v1/models`, key),
  ]);
  const usable = (account.voices ?? []).filter((v) => !(v.sharing?.original_voice_id && !v.is_owner));
  const candidates = pickCandidates(usable, voices);
  const hindiModels = (models ?? []).filter((m) => m.can_do_text_to_speech && (m.languages ?? []).some((l) => l.language_id === 'hi')).map((m) => m.model_id);
  return {
    candidates,
    models: hindiModels.filter((m) => PREFERRED_MODELS.includes(m)).length ? PREFERRED_MODELS.filter((m) => hindiModels.includes(m)) : hindiModels.slice(0, 3),
    shared: { total: shared.total_count ?? 0, note: 'library voices listed; TTS on a library voice not added to the account returned HTTP 402 in the live check' },
  };
}

function log(projectDir, entry) {
  const p = join(projectDir, 'logs', 'calls.jsonl');
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(entry) + '\n');
}

async function take({ projectDir, key, model, voiceId, text }) {
  const settings = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };
  const body = { text, model_id: model, voice_settings: settings, apply_text_normalization: 'auto' };
  const hash = createHash('sha256').update(JSON.stringify({ provider: 'elevenlabs', model, voiceId, text, settings, outputFormat: 'mp3_44100_128' })).digest('hex');
  const cache = join(projectDir, '.fableon', 'voice-cache', `audition-${hash}.json`);
  let audioBase64, billed, costUsd, cached = false, ms = 0;
  if (existsSync(cache)) {
    ({ audioBase64, billed, costUsd } = JSON.parse(readFileSync(cache, 'utf8')));
    cached = true;
    log(projectDir, { ts: new Date().toISOString(), stage: 'voice-audition', provider: 'elevenlabs', model, voiceId, requestHash: hash, cached, ms: 0, characters: 0, costUsd: 0, ok: true });
  } else {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers(key) }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 200); } catch { /* status only */ }
      throw new Error(`HTTP ${r.status}${detail ? `: ${detail}` : ''}`);
    }
    const j = await r.json();
    if (!j.audio_base64) throw new Error('no audio_base64');
    audioBase64 = j.audio_base64;
    billed = chars(text);
    costUsd = (billed / 1000) * voicePricePer1k(model);
    ms = Date.now() - t0;
    atomicWrite(cache, JSON.stringify({ audioBase64, billed, costUsd, model, voiceId }) + '\n');
    log(projectDir, { ts: new Date().toISOString(), stage: 'voice-audition', provider: 'elevenlabs', model, voiceId, requestHash: hash, cached: false, ms, characters: billed, costUsd, ok: true });
  }
  return { audioBase64, billed, costUsd, cached, ms };
}

export async function runAuditions(projectDir, { voices = 4, models = null } = {}) {
  loadDotEnv();
  const projectId = basename(projectDir);
  emitStage(projectId, 'voice-audition', { op: 'voice-audition', status: 'running' });
  const key = voiceApiKey();
  if (!key) {
    console.log('provider: elevenlabs');
    console.log('key: MISSING (ELEVENLABS_API_KEY)');
    return { ok: false, key: false };
  }
  const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
  if (project.language !== 'hi') throw new Error('auditions currently require a Hindi project (language "hi")');
  const found = await discover({ voices });
  const chosenModels = models?.length ? models : found.models;
  if (!chosenModels.length) throw new Error('no Hindi-capable text-to-speech model found');
  const planned = found.candidates.length * chosenModels.length * chars(AUDITION_TEXT);
  if (planned > MAX_AUDITION_CHARS) throw new Error(`auditions would use ${planned} characters (limit ${MAX_AUDITION_CHARS}); lower --voices or --models`);
  const out = join(projectDir, 'voice', 'auditions');
  mkdirSync(out, { recursive: true });
  const rows = [], errors = [];
  let totalChars = 0, totalCost = 0;
  for (const model of chosenModels) {
    for (const voice of found.candidates) {
      const file = `${slug(model)}__${slug(voice.name)}.mp3`;
      try {
        const t = await take({ projectDir, key, model, voiceId: voice.id, text: AUDITION_TEXT });
        writeFileSync(join(out, file), Buffer.from(t.audioBase64, 'base64'));
        const duration = Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', join(out, file)]));
        totalChars += t.billed; totalCost += t.costUsd;
        rows.push({ file, voice: voice.name, id: voice.id, source: voice.source, hindiVerified: voice.hindiVerified, model, characters: t.billed, costUsd: t.costUsd, duration, cached: t.cached });
        console.log(`${t.cached ? 'cached' : 'made  '} ${file}  ${duration.toFixed(2)}s  ${t.billed} chars  $${t.costUsd.toFixed(4)}`);
      } catch (e) {
        errors.push({ voice: voice.name, id: voice.id, model, error: e.message });
        console.log(`FAILED ${model} / ${voice.name}: ${e.message}`);
      }
    }
  }
  const lines = [
    `# Voice auditions — ${project.title} (${project.language})`,
    '',
    `Sample (same for every take): ${AUDITION_TEXT}`,
    '',
    `Models: ${chosenModels.join(', ')}`,
    `Account voices: ${found.candidates.map((v) => `${v.name} (${v.id}, ${v.source}, Hindi verified: ${v.hindiVerified ? 'yes' : 'no'})`).join('; ')}`,
    `Shared library: ${found.shared.total} Hindi narrative voices found; ${found.shared.note}.`,
    '',
    '| file | voice | id | source | Hindi verified | model | characters | cost | duration |',
    '|---|---|---|---|---|---|---:|---:|---:|',
    ...rows.map((r) => `| ${r.file} | ${r.voice} | ${r.id} | ${r.source} | ${r.hindiVerified ? 'yes' : 'no'} | ${r.model} | ${r.characters} | $${r.costUsd.toFixed(4)} | ${r.duration.toFixed(2)} s |`),
    ...(errors.length ? ['', '## Failed takes', ...errors.map((e) => `- ${e.model} / ${e.voice} (${e.id}): ${e.error}`)] : []),
    '',
    `Total: ${rows.length} takes, ${totalChars} characters, $${totalCost.toFixed(4)}.`,
    '',
    'Listen to the mp3s in this folder and choose one voice + model. Do not commit the mp3s.',
    '',
  ];
  writeFileSync(join(out, 'auditions.md'), lines.join('\n'));
  console.log(`auditions: ${out} (${rows.length} takes, ${totalChars} chars, $${totalCost.toFixed(4)})`);
  emitStage(projectId, 'voice-audition', { op: 'voice-audition', status: rows.length ? 'done' : 'failed' });
  return { ok: rows.length > 0, dir: out, rows, errors, characters: totalChars, costUsd: totalCost, models: chosenModels, voices: found.candidates };
}
