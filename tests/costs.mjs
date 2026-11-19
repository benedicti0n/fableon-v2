// Cost ledger aggregates, monthly alerts and CSV privacy.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summary, csv, saveBudgets } from '../server/src/costs.js';

export async function runCostTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const root = mkdtempSync(join(tmpdir(), 'fableon-costs-'));
  try {
    const dir = join(root, 'film'); mkdirSync(join(dir, 'logs'), { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ version: 1, id: 'film', title: 'Film', seconds: 60, language: 'hi', voice: {}, research: { web: false, maxSources: 1 }, models: { default: { provider: 'deepseek' } }, autopilot: false }));
    const month = new Date().toISOString().slice(0, 7);
    const ts = `${month}-01T10:00:00.000Z`;
    const rows = [
      { ts, stage: 'script', provider: 'deepseek', model: 'deepseek-flash', promptTokens: 100, completionTokens: 50, costUsd: 0.6, cached: false, ok: true },
      { ts, stage: 'voice', provider: 'sarvam', model: 'bulbul', characters: 1000, costUsd: 0.2, costInr: 17.6, cached: false, ok: true },
      { ts, stage: 'voice', provider: 'elevenlabs', model: 'eleven', characters: 0, costUsd: 0, cached: true, ok: true },
    ];
    writeFileSync(join(dir, 'logs', 'calls.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    saveBudgets(root, { monthlyUsd: 1, thresholds: [50, 80, 100], fees: { deepseek: 10, sarvam: 0 }, inrPerUsd: 88 });
    const s = summary(root, month);
    ok('ledger total equals row sum', Math.abs(s.spend - 0.8) < 1e-9, String(s.spend));
    ok('provider aggregates sum to total', Math.abs(s.byProvider.reduce((n, p) => n + p.usd, 0) - s.spend) < 1e-9, JSON.stringify(s.byProvider));
    ok('effective cost applies provider fee', Math.abs(s.effective - 0.86) < 1e-9, String(s.effective));
    ok('thresholds fire on the first summary', s.alerts.length === 2, JSON.stringify(s.alerts));
    const s2 = summary(root, month);
    ok('thresholds fire only once per month', s2.alerts.length === 0, JSON.stringify(s2.alerts));
    const out = csv(s.rows);
    ok('CSV has rows and no prompt or key text', out.split('\n').length >= 4 && !/sk-|api[_-]?key/i.test(out), out.slice(0, 300));
    ok('CSV has provider and cost columns', /provider/.test(out) && /cost/.test(out), out.split('\n')[0]);
  } finally { rmSync(root, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
