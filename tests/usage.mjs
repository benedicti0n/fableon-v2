// Usage aggregation: all calls.jsonl, mock excluded, since filter, character estimate without cached audio.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectUsage, summarize } from '../cli/src/usage.js';

export function runUsageTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const root = mkdtempSync(join(tmpdir(), 'fableon-usage-test-'));
  try {
    mkdirSync(join(root, 'work', 'a', 'logs'), { recursive: true });
    mkdirSync(join(root, 'work', 'a', 'node_modules', 'dep', 'logs'), { recursive: true });
    const ds = [
      { ts: '2026-11-16T10:00:00Z', stage: 'script', provider: 'deepseek', model: 'deepseek-flash', cached: false, promptTokens: 1000, cacheHitTokens: 200, cacheMissTokens: 800, completionTokens: 100, reasoningTokens: 0, costUsd: 0.001 },
      { ts: '2026-11-17T10:00:00Z', stage: 'factcheck', provider: 'deepseek', model: 'deepseek-v4-pro', cached: true, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0 },
    ];
    const el = [
      { ts: '2026-11-16T11:00:00Z', stage: 'voice-audition', provider: 'elevenlabs', model: 'eleven_v3', voiceId: 'N2lVS1w4EtoT3dr4eOWO', requestHash: 'h1', cached: false, characters: 111.2, costUsd: 0.01 },
      { ts: '2026-11-16T11:01:00Z', stage: 'voice-audition', provider: 'elevenlabs', model: 'eleven_v3', voiceId: 'N2lVS1w4EtoT3dr4eOWO', requestHash: 'h1', cached: true, characters: 0, costUsd: 0 },
    ];
    const mock = [{ ts: '2026-11-16T12:00:00Z', stage: 'script', provider: 'mock', model: 'mock-v1', cached: false, costUsd: 999 }];
    writeFileSync(join(root, 'work', 'a', 'logs', 'calls.jsonl'), [...ds, ...el, ...mock].map((x) => JSON.stringify(x)).join('\n') + '\n');
    writeFileSync(join(root, 'work', 'a', 'node_modules', 'dep', 'logs', 'calls.jsonl'), JSON.stringify({ provider: 'deepseek', costUsd: 999 }) + '\n');
    const all = collectUsage(root);
    const totals = summarize(all);
    ok('deepseek calls split', all.deep.length === 2 && all.deep.find((r) => r.stage === 'script')?.live === 1 && all.deep.find((r) => r.stage === 'factcheck')?.cached === 1, JSON.stringify(all.deep));
    ok('deepseek tokens and peak cost', totals.deep.prompt === 1000 && totals.deep.hit === 200 && totals.deep.miss === 800 && totals.deep.completion === 100 && totals.deep.cost === 0.001, JSON.stringify(totals.deep));
    ok('eleven characters and estimate', totals.eleven.characters === 111.2 && Math.abs(totals.eleven.seconds - 10) < 0.001 && totals.eleven.estimated === 1, JSON.stringify(totals.eleven));
    ok('mock excluded', all.mock.calls === 1 && totals.deep.cost === 0.001 && totals.eleven.cost === 0.01, JSON.stringify(all.mock));
    ok('node_modules skipped', all.files.length === 1, JSON.stringify(all.files));
    const filtered = collectUsage(root, { since: '2026-11-17' });
    ok('since filter', filtered.deep.length === 1 && filtered.deep[0].cached === 1, JSON.stringify(filtered.deep));
  } finally { rmSync(root, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
