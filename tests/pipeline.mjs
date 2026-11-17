// Offline pipeline test: a tiny mock project through brief, research, script and fact-check.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { newProject } from '../cli/src/core/new-project.js';
import { PipelineRunner } from '../cli/src/core/runner.js';
import { readJson, writeJsonArtifact } from '../cli/src/core/artifacts.js';
import { statusTable, approve } from '../cli/src/core/state.js';
import { recordFactcheckOverride } from '../cli/src/stages/factcheck.js';

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
  const webTmp = mkdtempSync(join(tmpdir(), 'fableon-web-'));
  const oldTavily = process.env.TAVILY_API_KEY;
  const oldFetch = globalThis.fetch;
  try {
    const created = newProject(tmp, { topic: 'The Moon Cheese', seconds: 20, voice: 'am_michael' });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'), join(tmp, 'research', 'sources', 'moon.md'));
    const project = { ...created.project, voice: { ...created.project.voice, rate: { wordsPerSecond: 4.4 } }, models: { default: { provider: 'mock', model: 'mock-v1' } }, autopilot: true };
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
    ok('factcheck craft advisory', review.lines.find((l) => l.n === 2)?.craft === 'weak' && review.lines.every((l) => l.hash), JSON.stringify(review.lines.find((l) => l.n === 2)));
    ok('factcheck confirmation cleared line 4', review.lines.find((l) => l.n === 4)?.verdict === 'ok');
    ok('factcheck confirmed flag revised', review.lines.find((l) => l.n === 1)?.verdict === 'ok');
    const words = JSON.parse(readFileSync(join(tmp, 'script.json'), 'utf8')).lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    ok('word target', Math.abs(words - 80) / 80 <= 0.07, String(words));

    const before = readFileSync(join(tmp, 'logs', 'calls.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"cached":false')).length;
    const force = new PipelineRunner(tmp, project, { to: 'factcheck', only: 'factcheck', autopilot: true, force: true });
    await force.run();
    const after = readFileSync(join(tmp, 'logs', 'calls.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"cached":false')).length;
    ok('cache hit on force re-run', before === after, `${before} -> ${after}`);
    ok('incremental factcheck no re-review', before === after, `${before} -> ${after}`);

    const approved = statusTable(tmp);
    ok('all run stages fresh', ['brief', 'research', 'script', 'factcheck'].every((s) => approved.rows.find((r) => r.stage === s)?.status === 'fresh'));
    ok('pronunciation TODO', approved.todos.includes('Mira'), approved.todos.join(','));
    ok('status craft advisory', approved.craft.some((c) => c.n === 2), JSON.stringify(approved.craft));

    const castRun = new PipelineRunner(tmp, project, { to: 'cast', only: 'cast', autopilot: true, force: true });
    await castRun.run();
    const castJson = readJson(join(tmp, 'cast.json'), 'cast');
    const assetsJson = readJson(join(tmp, 'assets.todo.json'), 'assets');
    ok('cast schema', castJson.characters.length === 1 && castJson.characters[0].id === 'mira', JSON.stringify(castJson));
    ok('cast mustHave', castJson.characters[0].mustHave.includes('red-attire'), JSON.stringify(castJson.characters[0].mustHave));
    ok('cast sheet', existsSync(join(tmp, 'cast', 'cast-sheet.jpg')), 'cast/cast-sheet.jpg');
    ok('cast assets todo', Array.isArray(assetsJson.assets), JSON.stringify(assetsJson));
    const castStatus = statusTable(tmp).rows.find((r) => r.stage === 'cast');
    ok('cast fresh', castStatus?.status === 'fresh', JSON.stringify(castStatus));

    // Hand edit: script is edited; fact-check is stale and the approved hash is invalidated.
    approve(tmp, project, 'script');
    const edited = JSON.parse(readFileSync(join(tmp, 'script.json'), 'utf8'));
    edited.lines[2].text = 'They polished the moon with very soft cloths.';
    writeFileSync(join(tmp, 'script.json'), JSON.stringify(edited, null, 2) + '\n');
    const table = statusTable(tmp);
    ok('edited detection', table.rows.find((r) => r.stage === 'script')?.status === 'edited');
    ok('downstream stale', table.rows.find((r) => r.stage === 'factcheck')?.status === 'stale');
    ok('cast stale after script edit', table.rows.find((r) => r.stage === 'cast')?.status === 'stale');
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

    // Optional web research: mock model queries + a mocked Tavily response (same quote check as files).
    const w = newProject(webTmp, { topic: 'The Moon Cheese', seconds: 20, voice: 'am_michael' });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'), join(webTmp, 'research', 'sources', 'moon.md'));
    const wp = { ...w.project, research: { web: true, maxSources: 8 }, models: { default: { provider: 'mock', model: 'mock-v1' } }, autopilot: true };
    writeProject(webTmp, wp);
    process.env.FABLEON_MOCK_DIR = join(ROOT, 'tests', 'fixtures', 'llm', 'web');
    process.env.TAVILY_API_KEY = 'tvly-test-never-log-this';
    const tavilyCalls = [];
    globalThis.fetch = async (url, init = {}) => {
      const body = JSON.parse(init.body ?? '{}');
      tavilyCalls.push({ url: String(url), auth: init.headers?.Authorization, body });
      const n = tavilyCalls.length;
      return new Response(JSON.stringify({
        query: body.query,
        results: [{ title: `Moon source ${n}`, url: `https://example.org/moon-${n}`, score: 0.9, content: 'In the old village of Vela, the moon was said to be made of green cheese, and the villagers polished it every spring.' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await new PipelineRunner(webTmp, wp, { to: 'research', autopilot: true }).run();
    globalThis.fetch = oldFetch;
    const ws = readJson(join(webTmp, 'research', 'sources.json'), 'sources');
    const wf = readJson(join(webTmp, 'research', 'facts.json'), 'facts');
    const webSources = ws.sources.filter((s) => s.kind === 'web');
    ok('web sources saved', webSources.length === 2 && webSources.every((s) => s.url && s.content && s.sha256), JSON.stringify(ws.sources.map((s) => s.kind)));
    ok('web quote verified', wf.facts.find((f) => f.id === 'F1')?.verified === true);
    ok('web fake quote unverified', wf.facts.find((f) => f.id === 'F2')?.verified === false);
    ok('tavily requests', tavilyCalls.length === 2 && tavilyCalls.every((c) => c.url === 'https://api.tavily.com/search' && c.auth === 'Bearer tvly-test-never-log-this' && c.body.search_depth === 'basic' && c.body.max_results >= 1), JSON.stringify(tavilyCalls.map((c) => c.url)));
    ok('tavily key not logged', !readFileSync(join(webTmp, 'logs', 'calls.jsonl'), 'utf8').includes('tvly-test-never-log-this'));
  } finally {
    if (oldMock === undefined) delete process.env.FABLEON_MOCK_DIR; else process.env.FABLEON_MOCK_DIR = oldMock;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    if (oldTavily === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = oldTavily;
    globalThis.fetch = oldFetch;
    rmSync(tmp, { recursive: true, force: true });
    rmSync(gateTmp, { recursive: true, force: true });
    rmSync(webTmp, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, checks };
}
