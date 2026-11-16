// Offline pipeline test: a tiny mock project through brief, research, script and fact-check.
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { newProject } from '../cli/src/core/new-project.js';
import { PipelineRunner } from '../cli/src/core/runner.js';
import { readJson, writeJsonArtifact } from '../cli/src/core/artifacts.js';
import { statusTable, approve } from '../cli/src/core/state.js';

const writeProject = (dir, project) => writeJsonArtifact(dir, 'test', 'project.json', project, 'project');

export async function runPipelineTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const oldMock = process.env.FABLEON_MOCK_DIR;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  process.env.FABLEON_MOCK_DIR = join(ROOT, 'tests', 'fixtures', 'llm');
  process.env.DEEPSEEK_API_KEY = 'sk-test-never-log-this';
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-pipeline-'));
  const gateTmp = mkdtempSync(join(tmpdir(), 'fableon-gate-'));
  try {
    const created = newProject(tmp, { topic: 'The Moon Cheese', seconds: 20, voice: 'am_michael' });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'), join(tmp, 'research', 'sources', 'moon.md'));
    const project = { ...created.project, models: { default: { provider: 'mock', model: 'mock-v1' } }, autopilot: true };
    writeProject(tmp, project);
    const runner = new PipelineRunner(tmp, project, { to: 'factcheck', autopilot: true });
    await runner.run();

    const facts = readJson(join(tmp, 'research', 'facts.json'), 'facts');
    ok('facts schema + counts', facts.facts.length === 2, JSON.stringify(facts.facts.map((f) => f.id)));
    ok('fake quote unverified', facts.facts.find((f) => f.id === 'F2')?.verified === false);
    ok('real quote verified', facts.facts.find((f) => f.id === 'F1')?.verified === true);
    const script = readJson(join(tmp, 'script.json'), 'script');
    ok('script schema', script.lines.length === 10, String(script.lines.length));
    ok('script repaired', script.lines.every((l) => l.text.split(/\s+/).length <= 22) && script.lines.every((l) => l.look.set === 'village'));
    ok('script revised', script.lines[1].text.includes('one long ladder'), script.lines[1].text);
    const review = readJson(join(tmp, 'script.review.json'), 'review');
    ok('factcheck review schema', review.lines.every((l) => l.verdict === 'ok'), JSON.stringify(review.lines.map((l) => l.verdict)));
    const words = JSON.parse(readFileSync(join(tmp, 'script.json'), 'utf8')).lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    ok('word target', Math.abs(words - 75) / 75 <= 0.07, String(words));

    const before = readFileSync(join(tmp, 'logs', 'calls.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"cached":false')).length;
    const force = new PipelineRunner(tmp, project, { to: 'factcheck', autopilot: true, force: true });
    await force.run();
    const after = readFileSync(join(tmp, 'logs', 'calls.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"cached":false')).length;
    ok('cache hit on force re-run', before === after, `${before} -> ${after}`);

    const approved = statusTable(tmp);
    ok('all run stages fresh', ['brief', 'research', 'script', 'factcheck'].every((s) => approved.rows.find((r) => r.stage === s)?.status === 'fresh'));
    ok('pronunciation TODO', approved.todos.includes('Mira'), approved.todos.join(','));

    // Hand edit: script is edited; fact-check is stale and the approved hash is invalidated.
    approve(tmp, project, 'script');
    const edited = JSON.parse(readFileSync(join(tmp, 'script.json'), 'utf8'));
    edited.lines[2].text = 'They polished the moon with very soft cloths.';
    writeFileSync(join(tmp, 'script.json'), JSON.stringify(edited, null, 2) + '\n');
    const table = statusTable(tmp);
    ok('edited detection', table.rows.find((r) => r.stage === 'script')?.status === 'edited');
    ok('downstream stale', table.rows.find((r) => r.stage === 'factcheck')?.status === 'stale');
    ok('approval invalidated', table.rows.find((r) => r.stage === 'script')?.approved === 'no');

    const cacheText = readdirSync(join(tmp, '.fableon', 'cache')).map((f) => readFileSync(join(tmp, '.fableon', 'cache', f), 'utf8')).join('\n');
    const logText = readFileSync(join(tmp, 'logs', 'calls.jsonl'), 'utf8');
    ok('no secret in cache/log', !cacheText.includes('sk-test-never-log-this') && !logText.includes('sk-test-never-log-this'));

    // Approval gate on a fresh second project: brief runs, research must wait.
    const g = newProject(gateTmp, { topic: 'The Moon Cheese', seconds: 20, voice: 'am_michael' });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'), join(gateTmp, 'research', 'sources', 'moon.md'));
    const gp = { ...g.project, models: { default: { provider: 'mock', model: 'mock-v1' } } };
    writeProject(gateTmp, gp);
    let gateMsg = '';
    try { await new PipelineRunner(gateTmp, gp, { to: 'research' }).run(); } catch (e) { gateMsg = e.message; }
    ok('approval gate', /waiting for brief approval/.test(gateMsg), gateMsg);
  } finally {
    if (oldMock === undefined) delete process.env.FABLEON_MOCK_DIR; else process.env.FABLEON_MOCK_DIR = oldMock;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    rmSync(tmp, { recursive: true, force: true });
    rmSync(gateTmp, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, checks };
}
