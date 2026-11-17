// Model defaults and the explicit per-stage fallback: config resolution, one retry after repairs fail, logged as a fallback.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fallbackForStage, modelForStage } from '../cli/src/core/model-config.js';
import { ModelRouter } from '../cli/src/models/router.js';

export async function runModelTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const repo = {
    default: { provider: 'testdeep', model: null },
    stageDefaults: {
      script: { provider: 'testdeep', model: 'small', temperature: 0.5, fallback: { provider: 'testdeep', model: 'big' } },
      cast: { provider: 'testdeep', model: 'small', temperature: 0.4 },
    },
    maxRepairs: 0,
    prices: {},
  };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-models-'));
  try {
    const project = { models: {} };
    const script = modelForStage(project, 'script', repo);
    ok('stage default', script.model === 'small' && script.provider === 'testdeep', JSON.stringify(script));
    const fb = fallbackForStage(project, 'script', repo);
    ok('fallback resolves', fb?.model === 'big' && fb?.provider === 'testdeep', JSON.stringify(fb));
    ok('no fallback without entry', fallbackForStage(project, 'cast', repo) === null, JSON.stringify(fallbackForStage(project, 'cast', repo)));
    ok('explicit model wins over fallback', fallbackForStage({ models: { script: { model: 'manual' } } }, 'script', repo) === null, 'explicit model should not silently fall back');
    ok('explicit fallback allowed', fallbackForStage({ models: { script: { model: 'manual', fallback: { provider: 'testdeep', model: 'big' } } } }, 'script', repo)?.model === 'big', 'explicit fallback');
    ok('mock has no fallback', fallbackForStage({ models: { default: { provider: 'mock', model: 'mock-v1' } } }, 'script', repo) === null, 'mock should never fall back');

    const router = new ModelRouter(tmp, project);
    router.repo = repo;
    const seen = [];
    router.request = async (stage, model, messages, params, config) => {
      seen.push({ model, thinking: params.thinking ?? null });
      return { content: JSON.stringify({ model, ok: model === 'big' }), finishReason: 'stop', usage: { prompt_tokens: 3, completion_tokens: 2 }, attempts: 1 };
    };
    const { data } = await router.callJson('script', [{ role: 'user', content: 'Return json for the test.' }], { validate: (d) => (d.ok ? [] : ['not the fallback answer']) });
    ok('fallback answer used', data.model === 'big' && data.ok === true, JSON.stringify(data));
    ok('fallback called once after primary', seen.length === 2 && seen[0].model === 'small' && seen[1].model === 'big', JSON.stringify(seen));
    ok('fallback recorded', router.fallbacks.length === 1 && router.stageUsage('script').fallbacks === 1, JSON.stringify(router.fallbacks));
    const log = readFileSync(join(tmp, 'logs', 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const fbLog = log.find((l) => l.fallback === true);
    ok('fallback logged', !!fbLog && fbLog.model === 'big' && fbLog.fallbackFrom === 'small' && fbLog.ok === true, JSON.stringify(fbLog));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
