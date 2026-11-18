// Model bake-off: fixed cached case inputs, one stage, candidate models, scored outputs and a blind script sheet.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT } from './env.js';
import { repoModels } from './core/model-config.js';
import { ModelRouter } from './models/router.js';
import { runScript } from './stages/script.js';
import { validateScript } from './stages/script.js';
import { countWords } from '../../shared/words.mjs';

export const SCRIPT_CANDIDATES = [
  { provider: 'deepseek', model: 'deepseek-flash', label: 'DeepSeek Flash (direct)' },
  { provider: 'deepseek', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (direct)' },
  { provider: 'sarvam', model: 'sarvam-105b', label: 'Sarvam 105B' },
  { provider: 'openai', model: 'gpt-5.4-nano-2026-03-17', label: 'GPT-5.4 nano' },
  { provider: 'openai', model: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { provider: 'gemini', model: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { provider: 'gemini', model: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
];
const PROVIDER_BUDGETS = { openai: 3, gemini: 3, deepseek: Infinity, sarvam: 200 / 88 };

const slug = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const catalog = () => { try { return JSON.parse(readFileSync(join(ROOT, 'models.catalog.json'), 'utf8')); } catch { return { models: [] }; } };
const priceOf = (c) => {
  if (c.provider === 'deepseek') return c.model === 'deepseek-v4-pro' ? { input: 1.32, output: 3.96 } : { input: 0.3, output: 1.2 };
  const local = repoModels().prices?.[c.model];
  if (local) return { input: local.input, output: local.output };
  const m = catalog().models.find((x) => x.id === c.model);
  return m?.price ? { input: m.price.input, output: m.price.output } : null;
};

function copyCase(src) {
  const dst = mkdtempSync(join(tmpdir(), 'fableon-bakeoff-'));
  for (const f of ['project.json', 'brief.md', 'pronunciations.json', 'research']) cpSync(join(src, f), join(dst, f), { recursive: true });
  return dst;
}

export function scoreScript(data, { project, facts, catalog, sourceTexts = [] }) {
  let errors;
  try { errors = validateScript(data, { project, facts, catalog, sourceTexts }); } catch (e) { errors = [e.message]; }
  const words = (data.lines ?? []).reduce((n, l) => n + countWords(l.text), 0);
  const beats = (data.lines ?? []).map((l) => l.beat);
  return {
    pass: errors.length === 0,
    errors: errors.slice(0, 12),
    lines: data.lines?.length ?? 0,
    words,
    hookWords: data.lines?.[0] ? countWords(data.lines[0].text) : 0,
    mystery: beats.includes('mystery'),
    pivot: beats.includes('pivot'),
    analogy: beats.includes('analogy'),
    payoff: beats.includes('payoff'),
    advisoryTrue: data.hookAdvisory?.paradoxAsFact === true,
  };
}

export function scoreFactcheck(review, seeded, cleanLines) {
  const byN = new Map((review.lines ?? []).map((l) => [l.n, l]));
  const flagged = (l) => ['unsupported', 'distorted'].includes(l?.verdict);
  const found = seeded.filter((x) => flagged(byN.get(x.n)));
  const falsePositives = cleanLines.filter((n) => flagged(byN.get(n)));
  return { recall: +(found.length / Math.max(1, seeded.length)).toFixed(3), found: found.length, seeded: seeded.length, falsePositives: falsePositives.length, falsePositiveLines: falsePositives };
}

function blindSheet(rows, cases) {
  const lines = ['# Blind Hindi script ranking', '', 'Each model is anonymous. Rank the scripts per case (best first) and note why. Do not open manifest.json until the ranking is recorded.', ''];
  for (const c of cases) {
    const rs = rows.filter((r) => r.case === c && r.script);
    const ordered = rs.map((r) => ({ ...r, sort: createHash('sha256').update(`${c}:${r.model}`).digest('hex') })).sort((a, b) => a.sort.localeCompare(b.sort)).map((r, i) => ({ ...r, label: String.fromCharCode(65 + i) }));
    lines.push(`## Case: ${c}`, '');
    for (const r of ordered) {
      lines.push(`### ${r.label}`, '', r.script.lines.map((l) => `${l.n}. ${l.text}  \n   ${l.gloss ?? ''}`).join('\n'), '');
    }
    lines.push('Ranking: ', '');
  }
  return lines.join('\n');
}

export async function runBakeoff({ stage = 'script', models = null, cases = null, budget = 5 } = {}) {
  if (stage !== 'script') throw new Error(`bakeoff stage "${stage}" is not wired yet (only script)`);
  const selected = (models?.length ? models : SCRIPT_CANDIDATES).map((m) => typeof m === 'string' ? SCRIPT_CANDIDATES.find((x) => x.model === m || x.label === m) : m).filter(Boolean);
  if (!selected.length) throw new Error('bakeoff: no matching models');
  const caseList = cases?.length ? cases : [join(ROOT, 'fixtures', 'savitri-hi'), join(ROOT, 'work', 'bakasura-hi')].filter((p) => existsSync(p));
  const outDir = join(ROOT, 'bakeoff', 'script');
  mkdirSync(outDir, { recursive: true });
  const shortlist = ['# Script bake-off shortlist', '', 'Fixed cases: ' + caseList.map((c) => relative(ROOT, c)).join(', '), '', '| label | provider | model | input $/M | output $/M |', '|---|---|---|---:|---:|', ...selected.map((m) => { const p = priceOf(m) ?? {}; return `| ${m.label ?? m.model} | ${m.provider} | ${m.model} | ${p.input ?? '?'} | ${p.output ?? '?'} |`; })].join('\n') + '\n';
  writeFileSync(join(outDir, 'shortlist.md'), shortlist);
  const rows = [];
  let spent = 0;
  const spentBy = {};
  for (const caseDir of caseList) {
    const caseName = relative(ROOT, caseDir).replace(/[\\/]/g, '-');
    const project0 = JSON.parse(readFileSync(join(caseDir, 'project.json'), 'utf8'));
    const facts = JSON.parse(readFileSync(join(caseDir, 'research', 'facts.json'), 'utf8'));
    const cat = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
    const sourceDir = join(caseDir, 'research', 'sources');
    const sources = existsSync(sourceDir) ? readdirSync(sourceDir).filter((f) => /\.(md|txt|html?)$/i.test(f)).map((f) => readFileSync(join(sourceDir, f), 'utf8')).join('\n') : null;
    for (const cand of selected) {
      const cap = Math.min(budget, PROVIDER_BUDGETS[cand.provider] ?? budget);
      if (spent >= budget || (spentBy[cand.provider] ?? 0) >= cap) { rows.push({ case: caseName, provider: cand.provider, model: cand.model, skipped: 'budget' }); continue; }
      const dir = copyCase(caseDir);
      const t0 = Date.now();
      let result = null, error = null;
      try {
        const project = { ...project0, models: { ...(project0.models ?? {}), script: { provider: cand.provider, model: cand.model, temperature: 0.8, maxTokens: cand.provider === 'sarvam' ? 32000 : 12000, maxRepairs: 5, ...(cand.provider === 'sarvam' ? { jsonMode: false } : {}) } } };
        writeFileSync(join(dir, 'project.json'), JSON.stringify(project, null, 2) + '\n');
        const router = new ModelRouter(dir, project, { noCache: true, logCalls: false });
        result = await runScript({ projectDir: dir, project, router });
        const data = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));
        const score = scoreScript(data, { project, facts, catalog: cat, sourceTexts: sources ? [sources] : [] });
        const usage = router.stageUsage('script');
        const p = priceOf(cand) ?? { input: 0, output: 0 };
        const cost = usage.costUsd ?? ((usage.promptTokens ?? 0) * p.input + (usage.completionTokens ?? 0) * p.output) / 1e6;
        spent += cost;
        spentBy[cand.provider] = (spentBy[cand.provider] ?? 0) + cost;
        const row = {
          case: caseName, provider: cand.provider, model: cand.model, label: cand.label,
          pass: score.pass, errors: score.errors, lines: score.lines, words: score.words, hookWords: score.hookWords,
          mystery: score.mystery, pivot: score.pivot, analogy: score.analogy, payoff: score.payoff, advisoryTrue: score.advisoryTrue,
          calls: usage.calls ?? 0, firstTry: (usage.calls ?? 0) === 1 && score.pass, repairs: Math.max(0, (usage.calls ?? 0) - 1),
          promptTokens: usage.promptTokens ?? 0, completionTokens: usage.completionTokens ?? 0, costUsd: +cost.toFixed(6),
          latencyMs: Date.now() - t0, script: data,
        };
        rows.push(row);
        writeFileSync(join(outDir, `${caseName}--${slug(cand.model)}.json`), JSON.stringify(row, null, 2) + '\n');
      } catch (e) {
        error = e.message.split('\n').slice(0, 8).join('\n');
        rows.push({ case: caseName, provider: cand.provider, model: cand.model, label: cand.label, pass: false, error, calls: 0, firstTry: false, repairs: 0, costUsd: 0, latencyMs: Date.now() - t0 });
      } finally { rmSync(dir, { recursive: true, force: true }); }
      console.log(`${caseName} ${cand.model}: ${error ? 'ERROR' : rows.at(-1).pass ? 'PASS' : 'FAIL'} $${(rows.at(-1).costUsd ?? 0).toFixed(4)}`);
    }
  }
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ stage, budget, spent: +spent.toFixed(6), spentBy, rows }, null, 2) + '\n');
  writeFileSync(join(outDir, 'blind.md'), blindSheet(rows, caseList.map((c) => relative(ROOT, c).replace(/[\\/]/g, '-'))));
  const manifest = {};
  for (const c of new Set(rows.filter((r) => r.script).map((r) => r.case))) {
    const rs = rows.filter((r) => r.case === c && r.script).map((r) => ({ ...r, sort: createHash('sha256').update(`${c}:${r.model}`).digest('hex') })).sort((a, b) => a.sort.localeCompare(b.sort));
    manifest[c] = Object.fromEntries(rs.map((r, i) => [String.fromCharCode(65 + i), { provider: r.provider, model: r.model, label: r.label }]));
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { rows, spent, outDir };
}
