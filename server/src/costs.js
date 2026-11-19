// Cost ledger and budgets: every calls.jsonl row is normalized without prompts or keys.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { atomicWrite } from '../../cli/src/core/artifacts.js';
import { collectUsage, providerChecks, summarize } from '../../cli/src/usage.js';

const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const findLogs = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) findLogs(p, out); else if (e.name === 'calls.jsonl') out.push(p);
  }
  return out;
};
export const BUDGET_DEFAULT = { monthlyUsd: 30, providers: {}, filmUsd: 2, thresholds: [50, 80, 100], inrPerUsd: 88, fees: { sarvam: 18, elevenlabs: 3, deepseek: 3, gemini: 3, openai: 3 }, displayCurrency: 'INR', sarvamBalance: { inr: null, at: null } };
export const budgetsPath = (root) => join(root, '.fableon', 'budgets.json');
export function getBudgets(root) { return { ...BUDGET_DEFAULT, ...json(budgetsPath(root), {}) }; }
export function saveBudgets(root, data) { const next = { ...getBudgets(root), ...data }; mkdirSync(join(root, '.fableon'), { recursive: true }); atomicWrite(budgetsPath(root), JSON.stringify(next, null, 2) + '\n'); return next; }

export function ledger(root, month = new Date().toISOString().slice(0, 7)) {
  const budgets = getBudgets(root);
  const rows = [];
  const projects = new Map();
  for (const file of findLogs(root)) {
    const projectDir = dirname(dirname(file));
    const projectRel = relative(root, projectDir) || '.';
    if (!projects.has(projectRel)) projects.set(projectRel, json(join(projectDir, 'project.json'), {}));
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let l; try { l = JSON.parse(line); } catch { continue; }
      if (String(l.ts ?? '').slice(0, 7) !== month) continue;
      const project = projects.get(projectRel);
      const inr = Number(l.costInr ?? 0);
      const costUsd = l.costUsd == null && inr ? inr / (budgets.inrPerUsd || 88) : Number(l.costUsd ?? 0);
      const estimated = l.costUsd == null && !inr;
      rows.push({
        id: `${projectRel}:${rows.length + 1}`, ts: l.ts, project: projectRel, stage: l.stage ?? l.op ?? '?', op: l.stage ?? l.op ?? '?',
        provider: l.provider ?? 'unknown', model: l.model ?? '', characters: Number(l.characters ?? 0), promptTokens: Number(l.promptTokens ?? 0), completionTokens: Number(l.completionTokens ?? 0),
        cached: !!l.cached, costUsd: +costUsd.toFixed(6), costInr: inr || null, currency: inr ? 'INR' : 'USD', estimated,
        autopilot: !!project.autopilot, voiceId: l.voiceId ?? null, requestHash: l.requestHash ?? null,
      });
    }
  }
  return rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

export function summary(root, month = new Date().toISOString().slice(0, 7)) {
  const budgets = getBudgets(root);
  const rows = ledger(root, month);
  const rate = budgets.inrPerUsd || 88;
  const fee = (p) => (Number(budgets.fees?.[p] ?? 0) || 0) / 100;
  const eff = (r) => r.costUsd * (1 + fee(r.provider));
  const byProvider = new Map(), byStage = new Map(), byDay = new Map(), byProject = new Map();
  for (const r of rows) {
    const p = byProvider.get(r.provider) ?? { provider: r.provider, usd: 0, effectiveUsd: 0, calls: 0, cached: 0, characters: 0 };
    p.usd += r.costUsd; p.effectiveUsd += eff(r); p.calls++; if (r.cached) p.cached++; p.characters += r.characters; byProvider.set(r.provider, p);
    const s = byStage.get(r.stage) ?? { stage: r.stage, usd: 0, calls: 0 }; s.usd += r.costUsd; s.calls++; byStage.set(r.stage, s);
    const d = byDay.get(String(r.ts).slice(0, 10)) ?? { day: String(r.ts).slice(0, 10), usd: 0, providers: {} }; d.usd += r.costUsd; d.providers[r.provider] = (d.providers[r.provider] ?? 0) + r.costUsd; byDay.set(d.day, d);
    const pr = byProject.get(r.project) ?? { project: r.project, usd: 0, stages: {}, providers: {}, auditions: 0, cacheSavings: 0 };
    pr.usd += r.costUsd; pr.stages[r.stage] = (pr.stages[r.stage] ?? 0) + r.costUsd; pr.providers[r.provider] = (pr.providers[r.provider] ?? 0) + r.costUsd;
    if (/audition|voice-check/.test(r.stage)) pr.auditions++;
    byProject.set(r.project, pr);
  }
  const spend = rows.reduce((n, r) => n + r.costUsd, 0);
  const effective = rows.reduce((n, r) => n + eff(r), 0);
  const cached = rows.filter((r) => r.cached).length;
  const avg = new Map();
  for (const r of rows.filter((x) => !x.cached)) { const a = avg.get(r.provider) ?? { n: 0, cost: 0 }; a.n++; a.cost += r.costUsd; avg.set(r.provider, a); }
  const cacheSavings = rows.filter((r) => r.cached).reduce((n, r) => n + (avg.get(r.provider)?.n ? avg.get(r.provider).cost / avg.get(r.provider).n : 0), 0);
  const jobsFile = join(root, '.fableon-server', 'jobs.jsonl');
  const machine = new Map();
  if (existsSync(jobsFile)) for (const line of readFileSync(jobsFile, 'utf8').split('\n')) { if (!line.trim()) continue; try { const j = JSON.parse(line); if (j.project && j.startedAt && j.finishedAt) machine.set(j.project, (machine.get(j.project) ?? 0) + (Date.parse(j.finishedAt) - Date.parse(j.startedAt)) / 60000); } catch { /* skip */ } }
  const deep = summarize(collectUsage(resolve(root), { since: `${month}-01` }));
  const day = Math.max(1, new Date().getDate());
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const queueFile = join(root, '.fableon', 'queue.json');
  const queued = json(queueFile, { items: [] }).items ?? [];
  const forecast = rows.length ? (spend / day) * days + queued.filter((i) => ['queued', 'running', 'waiting'].includes(i.status)).reduce((n, i) => n + Number(i.estimate?.highUsd ?? 0), 0) : 0;
  const filmCount = new Set(rows.map((r) => r.project)).size;
  const minutes = (deep.eleven.seconds ?? 0) / 60;
  const alerts = [];
  const budgetLimit = Number(budgets.monthlyUsd ?? 0);
  if (budgetLimit > 0) {
    const pct = (spend / budgetLimit) * 100;
    const fired = json(join(root, '.fableon', 'cost-alerts.json'), {})?.[month] ?? [];
    const next = new Set(fired);
    for (const t of budgets.thresholds ?? [50, 80, 100]) if (pct >= t && !next.has(t)) { next.add(t); alerts.push({ threshold: t, pct: +pct.toFixed(1), spend: +spend.toFixed(4), limit: budgetLimit }); }
    if (alerts.length) { const all = { ...(json(join(root, '.fableon', 'cost-alerts.json'), {}) ?? {}), [month]: [...next] }; mkdirSync(join(root, '.fableon'), { recursive: true }); atomicWrite(join(root, '.fableon', 'cost-alerts.json'), JSON.stringify(all, null, 2) + '\n'); }
  }
  return {
    month, rows, spend: +spend.toFixed(6), effective: +effective.toFixed(6), budget: budgets.monthlyUsd, budgetLeft: +(budgets.monthlyUsd - spend).toFixed(6), forecast: +forecast.toFixed(4),
    cacheSavings: +cacheSavings.toFixed(4), cacheCalls: cached,
    byProvider: [...byProvider.values()].sort((a, b) => b.usd - a.usd), byStage: [...byStage.values()].sort((a, b) => b.usd - a.usd), byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    byProject: [...byProject.values()].sort((a, b) => b.usd - a.usd).map((p) => ({ ...p, minutes: (Number((json(join(root, p.project, 'project.json'), {}).seconds ?? 0)) / 60), machineMinutes: +(machine.get(p.project) ?? 0).toFixed(2) })),
    averages: { perFilm: +(spend / Math.max(1, filmCount)).toFixed(4), perMinute: +(spend / Math.max(0.01, minutes)).toFixed(4) },
    budgets, alerts, totals: { films: filmCount, minutes: +minutes.toFixed(2), rows: rows.length },
  };
}

export function csv(rows) {
  const head = ['ts', 'project', 'stage', 'provider', 'model', 'characters', 'prompt_tokens', 'completion_tokens', 'cached', 'currency', 'cost', 'estimated', 'autopilot'];
  return [head.join(','), ...rows.map((r) => [r.ts, r.project, r.stage, r.provider, r.model, r.characters, r.promptTokens, r.completionTokens, r.cached ? 1 : 0, r.currency, r.costUsd, r.estimated ? 1 : 0, r.autopilot ? 1 : 0].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') + '\n';
}

export async function balances(root) { return providerChecks(); }
