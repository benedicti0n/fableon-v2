// The script budget uses the selected voice's rate, not the English fixture default.
import { voiceRate } from '../cli/src/voice/rate.js';

export function runVoiceRateTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const hi = { language: 'hi', voice: { provider: 'sarvam', model: 'bulbul:v4-flash', voiceId: 'nachiket_hi_devotional', language: 'hi', pace: 1.10 } };
  const r = voiceRate(hi);
  ok('Nachiket rate is not the English default', r.wordsPerSecond < 3 && r.wordsPerSecond > 2.4, JSON.stringify(r));
  const delivered = voiceRate({ ...hi, voice: { ...hi.voice, rate: { delivered: { wordsPerSecond: 2.682 } } } });
  ok('delivered rate wins', delivered.wordsPerSecond === 2.682 && delivered.source === 'delivered', JSON.stringify(delivered));
  const english = voiceRate({ language: 'en', voice: { provider: 'kokoro' } });
  ok('English fallback is usable', english.wordsPerSecond > 2.5, JSON.stringify(english));
  return { ok: errors.length === 0, errors, checks };
}
