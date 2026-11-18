// Delivered narration rate per provider/voice/pace. The script word budget must use the voice that will actually read
// it, never the English fixture default. Measured rates come from the voice stage (voice.rate.delivered); the table is
// the fallback for a project before its first voice run (Nachiket Hindi ~2.65 words/s at pace 1.10).
export const VOICE_RATES = [
  { provider: "sarvam", model: "bulbul:v4-flash", voice: "nachiket_hi_devotional", language: "hi", pace: 1.10, wordsPerSecond: 2.65 },
  { provider: "sarvam", model: "bulbul:v4-flash", voice: "nachiket_hi_devotional", language: "hi", pace: 1.25, wordsPerSecond: 2.95 },
  { provider: "elevenlabs", model: "eleven_v3", language: "hi", pace: 1.20, wordsPerSecond: 2.90 },
];

export function voiceRate(project) {
  const measured = project.voice?.rate?.delivered?.wordsPerSecond;
  if (measured) return { wordsPerSecond: Number(measured), source: "delivered" };
  const configured = project.voice?.rate?.wordsPerSecond;
  if (configured) return { wordsPerSecond: Number(configured), source: "configured" };
  const v = project.voice ?? {};
  const pace = Number(v.pace ?? v.settings?.speed ?? v.speed ?? 1);
  const exact = VOICE_RATES.find((r) => r.provider === v.provider && r.model === v.model && r.voice === v.voiceId && r.language === (v.language ?? project.language) && Math.abs(r.pace - pace) < 0.011);
  if (exact) return { wordsPerSecond: exact.wordsPerSecond, source: "voice-table" };
  if (v.provider === "sarvam" && (v.language ?? project.language) === "hi") return { wordsPerSecond: 2.65, source: "sarvam-hi-fallback" };
  if ((v.language ?? project.language) === "hi") return { wordsPerSecond: 2.75, source: "hindi-fallback" };
  return { wordsPerSecond: 3.3, source: "language-fallback" };
}
