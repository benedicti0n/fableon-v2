// Forced-aligner accuracy on the cached Savitri ElevenLabs take against its character alignment.
// The ElevenLabs word times include pause time around sentence breaks; "clean" words are those not adjacent to a
// reference gap >= 0.1 s, where the character alignment is acoustically reliable. Raw numbers are reported too.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, findPython } from '../cli/src/env.js';

const pct = (sorted, p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
const median = (sorted) => sorted[Math.floor(sorted.length / 2)];
const ms = (a, b) => Math.round(Math.abs(a - b) * 1000);

export function runAlignerTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const python = findPython();
  if (!python) {
    checks.push({ name: 'aligner skipped', ok: true, detail: 'no python interpreter' });
    return { ok: true, errors, checks, skipped: true };
  }
  const probe = spawnSync(python, ['-c', 'import torch, torchaudio, soundfile, uroman'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    checks.push({ name: 'aligner skipped', ok: true, detail: `local aligner dependencies missing: ${(probe.stderr || '').split('\n').slice(-1)[0]}` });
    return { ok: true, errors, checks, skipped: true };
  }
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-align-'));
  try {
    const out = join(tmp, 'words.json');
    const r = spawnSync(python, [join(ROOT, 'cli/src/voice/align.py'), '--wav', join(ROOT, 'fixtures/savitri-hi/voice.wav'), '--script', join(ROOT, 'fixtures/savitri-hi/script.json'), '--out', out, '--method', 'mms'], { encoding: 'utf8', timeout: 600000 });
    ok('aligner runs', r.status === 0, (r.stderr || r.stdout || '').slice(-300));
    if (r.status !== 0) return { ok: false, errors, checks };
    const aligned = JSON.parse(readFileSync(out, 'utf8'));
    const truth = JSON.parse(readFileSync(join(ROOT, 'fixtures/savitri-hi/words.json'), 'utf8'));
    const words = aligned.words;
    ok('aligner covers every word', words.length === truth.length && words.every((w, i) => w.w === truth[i].w), `${words.length}/${truth.length}`);
    ok('aligner word times ordered', words.every((w, i) => w.b > w.a && (!i || w.a >= words[i - 1].a)), JSON.stringify(words.slice(0, 3)));
    const pauseAdjacent = (i) => (i > 0 && truth[i].a - truth[i - 1].b >= 0.1) || (i + 1 < truth.length && truth[i + 1].a - truth[i].b >= 0.1);
    const clean = words.map((_, i) => i).filter((i) => !pauseAdjacent(i));
    const starts = clean.map((i) => ms(words[i].a, truth[i].a)).sort((a, b) => a - b);
    const ends = clean.map((i) => ms(words[i].b, truth[i].b)).sort((a, b) => a - b);
    const rawStarts = words.map((w, i) => ms(w.a, truth[i].a)).sort((a, b) => a - b);
    const rawEnds = words.map((w, i) => ms(w.b, truth[i].b)).sort((a, b) => a - b);
    ok('aligner start accuracy (clean)', median(starts) <= 50 && pct(starts, 0.95) <= 120, `median ${median(starts)} ms, p95 ${pct(starts, 0.95)} ms on ${clean.length}/${words.length} words`);
    ok('aligner end accuracy (clean)', median(ends) <= 50 && pct(ends, 0.95) <= 120, `median ${median(ends)} ms, p95 ${pct(ends, 0.95)} ms on ${clean.length}/${words.length} words`);
    ok('aligner raw regression bounds', pct(rawStarts, 0.95) <= 350 && pct(rawEnds, 0.95) <= 200, `raw start median ${median(rawStarts)} p95 ${pct(rawStarts, 0.95)}, end median ${median(rawEnds)} p95 ${pct(rawEnds, 0.95)} (ElevenLabs pause times included)`);
    checks.push({ name: 'aligner numbers', ok: true, detail: `clean start ${median(starts)}/${pct(starts, 0.95)} ms, clean end ${median(ends)}/${pct(ends, 0.95)} ms, raw start ${median(rawStarts)}/${pct(rawStarts, 0.95)} ms, raw end ${median(rawEnds)}/${pct(rawEnds, 0.95)} ms` });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, checks };
}
