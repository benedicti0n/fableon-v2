// Performance direction: deterministic pause/stress/pace limits and script overlay.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performanceErrors } from '../cli/src/stages/performance.js';
import { scriptBlocks } from '../cli/src/voice/index.js';

export function runPerformanceTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const script = { lines: [{ n: 0, text: 'एक राजकुमारी ने शादी की।', beat: 'hook', delivery: { tone: 'deadpan' } }, { n: 1, text: 'सावित्री ने जीत ली।', beat: 'payoff', delivery: { tone: 'deadpan' } }] };
  const project = { seconds: 50, language: 'hi' };
  const good = { version: 1, lines: [{ n: 0, tone: 'deadpan', pace: 1.05, pauses: [{ after: 'राजकुमारी', s: 0.35 }], stress: ['शादी'] }, { n: 1, tone: 'mock-serious', pace: 1.0, pauses: [{ after: 'जीत', s: 0.3 }], stress: ['जीत'] }] };
  ok('performance valid', performanceErrors(good, script, project).length === 0, performanceErrors(good, script, project).join('; '));
  const tooMany = structuredClone(good); tooMany.lines[0].stress = ['एक', 'राजकुमारी', 'शादी'];
  ok('performance stress limit', performanceErrors(tooMany, script, project).some((e) => /maxItems|stress/.test(e)), performanceErrors(tooMany, script, project).join('; '));
  const missing = structuredClone(good); missing.lines.pop();
  ok('performance every line', performanceErrors(missing, script, project).some((e) => /missing 1/.test(e)), performanceErrors(missing, script, project).join('; '));
  const badPause = structuredClone(good); badPause.lines[0].pauses[0].s = 0.9;
  ok('performance pause ceiling', performanceErrors(badPause, script, project).length > 0, performanceErrors(badPause, script, project).join('; '));
  const badWord = structuredClone(good); badWord.lines[0].pauses[0].after = 'नहीं';
  ok('performance pause word', performanceErrors(badWord, script, project).some((e) => /not in the line/.test(e)), performanceErrors(badWord, script, project).join('; '));
  const total = structuredClone(good); total.lines[0].pauses = Array.from({ length: 8 }, () => ({ after: 'राजकुमारी', s: 0.6 }));
  ok('performance 8% total', performanceErrors(total, script, project).some((e) => /8%/.test(e)), performanceErrors(total, script, project).join('; '));
  const dir = mkdtempSync(join(tmpdir(), 'fableon-perf-'));
  try {
    writeFileSync(join(dir, 'script.json'), JSON.stringify(script));
    writeFileSync(join(dir, 'performance.json'), JSON.stringify(good));
    const blocks = scriptBlocks(dir);
    ok('performance overlay', blocks[0].lines[0].delivery.pauses[0].s === 0.35 && blocks[0].lines[0].delivery.emphasis[0] === 'शादी', JSON.stringify(blocks[0].lines[0].delivery));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
