// `fableon voice check`: one short Hindi sentence through a provider, no project and no secret output.
import { loadDotEnv } from './env.js';
import { checkElevenLabs } from './voice/elevenlabs.js';

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
