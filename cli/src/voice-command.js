// `fableon voice check`: one short Hindi sentence through a provider, no project and no secret output.
// `fableon voice pace`: rebuild the cached take with the reference pause policy and three local tempo variants.
import { join, resolve } from 'node:path';
import { loadDotEnv } from './env.js';
import { readJson } from './core/artifacts.js';
import { checkElevenLabs } from './voice/elevenlabs.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join as pjoin } from 'node:path';
import { ROOT } from './env.js';
import { buildPaceVariants, choosePace, DEFAULT_PACES } from './voice/pace.js';

export async function voiceCheckCommand(opts = {}) {
  loadDotEnv();
  const provider = opts.provider ?? 'elevenlabs';
  if (provider !== 'elevenlabs') throw new Error(`voice check supports elevenlabs (got "${provider}")`);
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log('provider: elevenlabs');
    console.log('key: MISSING (ELEVENLABS_API_KEY)');
    return { ok: false, key: false };
  }
  const r = await checkElevenLabs({ voiceId: opts.voiceId || process.env.ELEVENLABS_VOICE_ID || undefined, model: opts.model });
  console.log('provider: elevenlabs');
  console.log('key: SET (ELEVENLABS_API_KEY)');
  console.log(`model: ${r.model}`);
  console.log(`voice: ${r.voiceId}`);
  console.log(`characters billed: ${r.characters}`);
  console.log(`cost: $${r.costUsd.toFixed(6)}`);
  for (const w of r.words) console.log(`  ${w.w}  ${w.a.toFixed(2)}s-${w.b.toFixed(2)}s (line ${w.line})`);
  return r;
}

export async function voicePaceCommand(projectDirArg, opts = {}) {
  const projectDir = resolve(projectDirArg);
  const project = readJson(join(projectDir, 'project.json'));
  const script = readJson(join(projectDir, 'script.json'));
  const lines = script.lines ?? [];
  if (!lines.length) throw new Error('voice pace needs script.json lines');
  if (opts.choose != null) {
    const r = await choosePace({ projectDir, project, lines, pace: Number(opts.choose) });
    console.log(`voice pace: chose ${r.pace.toFixed(2)}; wrote voice.wav (${r.duration.toFixed(2)} s), words.json (${r.words.length} words) and voice.pace in project.json`);
    console.log(`  pauses: ${r.cuts.dramatic} dramatic, ${r.cuts.other} other, ${r.cuts.beatGaps} beat; base take ${r.base.hash.slice(0, 12)}`);
    return r;
  }
  const paces = opts.paces ? String(opts.paces).split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)) : DEFAULT_PACES;
  const r = await buildPaceVariants({ projectDir, project, lines, paces });
  console.log(`voice pace: base take ${r.base.hash.slice(0, 12)} is ${r.base.duration.toFixed(2)} s, ${r.base.words.length} words; no provider request`);
  for (const v of r.variants) console.log(`  ${v.pace.toFixed(2)}  ${v.duration.toFixed(2)} s  ${v.wordsPerSecond.toFixed(3)} words/s  voice/pace/${v.pace.toFixed(2)}.wav`);
  console.log(`voice pace: wrote voice/pace/pace.md; choose one with --choose <pace>`);
  return r;
}


/** Read-only credit meter: ElevenLabs subscription + Sarvam logged spend (the API exposes no balance). */
export async function voiceBudgetCommand() {
  loadDotEnv();
  const out = { elevenlabs: null, sarvam: null };
  if (process.env.ELEVENLABS_API_KEY) {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.ok) { const j = await r.json(); out.elevenlabs = { plan: j.tier ?? j.status, used: j.character_count, limit: j.character_limit, remaining: j.character_limit - j.character_count, reset: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null }; }
    else out.elevenlabs = { error: `HTTP ${r.status}` };
  }
  const logs = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const p = pjoin(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'calls.jsonl') logs.push(p); } };
  walk(ROOT);
  let inr = 0, chars = 0;
  for (const f of logs) for (const line of readFileSync(f, 'utf8').split('\n')) { if (!line.trim()) continue; try { const l = JSON.parse(line); if (l.provider === 'sarvam' && !l.cached) { inr += l.costInr ?? 0; chars += l.characters ?? 0; } } catch { /* ignore */ } }
  out.sarvam = { loggedCharacters: chars, loggedInr: +inr.toFixed(2), budgetInr: 200, note: 'Sarvam does not expose a balance endpoint; this is the logged Phase 3E spend.' };
  console.log('voice budget');
  console.log(`ElevenLabs: ${out.elevenlabs ? `${out.elevenlabs.plan} ${out.elevenlabs.used}/${out.elevenlabs.limit}, ${out.elevenlabs.remaining} remaining, reset ${out.elevenlabs.reset}` : 'not checked'}`);
  console.log(`Sarvam: ${chars} logged characters, ₹${inr.toFixed(2)} logged of ₹200 Phase 3E budget (no provider balance endpoint)`);
  console.log('OpenRouter: unused in Phase 3E (zero credits); DeepSeek/OpenAI/Gemini are provider-billed, not part of this voice meter.');
  return out;
}
