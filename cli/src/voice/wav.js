// 24 kHz mono PCM helpers for voice providers. audio/mix.py expects a readable WAV (it resamples 24 kHz to 48 kHz).
export const VOICE_SR = 24000;

export function wavFromPcm(pcm, sampleRate = VOICE_SR, channels = 1) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const silencePcm = (seconds, sampleRate = VOICE_SR) => Buffer.alloc(Math.round(seconds * sampleRate) * 2);
