// Voice QA metrics: a synthetic take with a long lead, trailing silence, digital zeros and a mid-file tone.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, findPython } from '../cli/src/env.js';
import { wavFromPcm } from '../cli/src/voice/wav.js';

export function runVoiceQaTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const py = findPython();
  if (!py) { checks.push({ name: 'voice QA skipped', ok: true, detail: 'no python' }); return { ok: true, errors, checks, skipped: true }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-voiceqa-'));
  try {
    const sr = 48000, n = sr * 2, pcm = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const v = t >= 0.5 && t < 1.5 ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 12000) : 0;
      pcm.writeInt16LE(v, i * 2);
    }
    writeFileSync(join(dir, 'voice.wav'), wavFromPcm(pcm, sr));
    writeFileSync(join(dir, 'words.json'), JSON.stringify([{ w: 'एक', a: 0.5, b: 1.5, line: 0 }]));
    const r = spawnSync(py, [join(ROOT, 'tools', 'qa', 'voice_qa.py'), dir], { encoding: 'utf8' });
    ok('voice QA fails a bad take', r.status === 1, (r.stdout || r.stderr || '').slice(-200));
    const q = JSON.parse(readFileSync(join(dir, 'voice-qa.json'), 'utf8'));
    ok('voice QA silence share', Math.abs(q.silenceShare - 0.5) < 0.02, JSON.stringify(q.silenceShare));
    ok('voice QA lead/tail', q.leadIn === 0.5 && q.tail === 0.5, JSON.stringify({ lead: q.leadIn, tail: q.tail }));
    ok('voice QA digital zeros', q.digitalZeroRuns.length >= 1 && q.clippedSamples === 0, JSON.stringify(q.digitalZeroRuns));
    ok('voice QA sample rate', q.sampleRate === sr, String(q.sampleRate));
    ok('voice QA reports errors', q.errors.length >= 3, JSON.stringify(q.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
