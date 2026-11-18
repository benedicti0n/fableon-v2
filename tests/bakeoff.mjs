// Bake-off scoring: formula pass/errors and content metrics are computed from fixed case data, no provider call.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { scoreFactcheck, scoreScript } from '../cli/src/bakeoff.js';

export function runBakeoffTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const dir = join(ROOT, 'fixtures', 'savitri-hi');
  const data = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(dir, 'research', 'facts.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const score = scoreScript(data, { project, facts, catalog });
  ok('bakeoff scores a legacy fixture', score.pass === false && score.errors.some((e) => /lines has/.test(e)), JSON.stringify(score));
  ok('bakeoff content metrics', score.lines === 21 && score.words > 200 && score.hookWords > 0, JSON.stringify(score));
  ok('bakeoff failure fields', score.pass === false && score.errors.length > 0, JSON.stringify(score.errors));
  const empty = scoreScript({ lines: [] }, { project, facts, catalog });
  ok('bakeoff empty script fails', empty.pass === false && empty.lines === 0, JSON.stringify(empty));
  const seeded = [{ n: 0, kind: 'unsupported' }, { n: 1, kind: 'distorted' }, { n: 2, kind: 'unsupported' }, { n: 3, kind: 'distorted' }, { n: 4, kind: 'unsupported' }, { n: 5, kind: 'invented' }];
  const review = { lines: seeded.map((x) => ({ n: x.n, verdict: x.n === 5 ? 'ok' : 'unsupported' })) };
  const fc = scoreFactcheck(review, seeded, [6, 7]);
  ok('seeded factcheck recall', fc.recall === +(5 / 6).toFixed(3) && fc.falsePositives === 0, JSON.stringify(fc));
  const fp = scoreFactcheck({ lines: [...review.lines, { n: 6, verdict: 'distorted' }] }, seeded, [6, 7]);
  ok('seeded factcheck false positives', fp.falsePositives === 1 && fp.falsePositiveLines[0] === 6, JSON.stringify(fp));
  return { ok: errors.length === 0, errors, checks };
}
