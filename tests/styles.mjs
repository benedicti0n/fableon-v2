// Style packs: the toon3d contract, project migration, skill import and a full flat-card run.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../cli/src/env.js';
import { newProject } from '../cli/src/core/new-project.js';
import { PipelineRunner } from '../cli/src/core/runner.js';
import { writeJsonArtifact } from '../cli/src/core/artifacts.js';
import { checkStyleContract, ensureProjectStyle, importStyle, listStyles, styleId } from '../cli/src/styles.js';

export async function runStyleTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-styles-'));
  const oldMock = process.env.FABLEON_MOCK_DIR;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  const oldFinalSize = process.env.FABLEON_FINAL_SIZE;
  const imported = [];
  const incomings = [];
  try {
    const toon = checkStyleContract('toon3d');
    ok('toon3d passes the style contract', toon.ok, toon.errors.join('; '));
    const flat = checkStyleContract('flat-card');
    ok('flat-card test pack passes the style contract', flat.ok, flat.errors.join('; '));

    const product = listStyles();
    ok('only ready product packs are listed', product.some((s) => s.id === 'toon3d') && !product.some((s) => s.id === 'flat-card'), JSON.stringify(product.map((s) => s.id)));
    const withTest = listStyles({ includeTest: true });
    ok('the test pack is hidden unless asked for', withTest.some((s) => s.id === 'flat-card'), JSON.stringify(withTest.map((s) => s.id)));
    const preset = JSON.parse(readFileSync(join(ROOT, 'presets', 'daily-short-hi.json'), 'utf8'));
    ok('built-in preset carries toon3d', preset.style === 'toon3d', String(preset.style));

    const old = join(tmp, 'old-project');
    mkdirSync(old, { recursive: true });
    const legacy = { version: 1, id: 'old-project', style: undefined };
    writeFileSync(join(old, 'project.json'), JSON.stringify(legacy, null, 2) + '\n');
    const migrated = ensureProjectStyle(old, legacy);
    ok('a project without style migrates to toon3d', styleId(migrated) === 'toon3d' && JSON.parse(readFileSync(join(old, 'project.json'), 'utf8')).style === 'toon3d', JSON.stringify(migrated));

    // Import a skill folder: text only, PORTING.md, licence, not-ready pack.
    const skill = join(tmp, 'My Skill');
    mkdirSync(join(skill, 'references'), { recursive: true });
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: my-skill\n---\n# My Skill\n\nA flat poster look with bold ink.\n');
    writeFileSync(join(skill, 'LICENSE'), 'MIT License\nCopyright (c) 2026 Test\n');
    writeFileSync(join(skill, 'references', 'private.jpg'), 'not really an image');
    const imp = importStyle({ from: skill, name: 'My Skill' });
    imported.push(imp.id); incomings.push(imp.incoming);
    const pack = join(ROOT, 'styles', imp.id);
    const porting = readFileSync(join(pack, 'PORTING.md'), 'utf8');
    ok('skill import scaffolds a not-ready pack', JSON.parse(readFileSync(join(pack, 'style.json'), 'utf8')).status === 'not-ready' && existsSync(join(pack, 'adapter.mjs')), imp.id);
    ok('skill import records the licence', /MIT License/.test(porting) || /MIT License/.test(JSON.parse(readFileSync(join(pack, 'style.json'), 'utf8')).source.licence), porting.slice(0, 120));
    ok('skill import writes PORTING.md with every section', ['What the skill does', 'What maps to the contract', 'What is missing', 'Porting tasks'].every((h) => porting.includes(h)), porting.slice(0, 200));
    ok('skill import never copies reference media', !existsSync(join(pack, 'references', 'private.jpg')) && !existsSync(join(ROOT, 'styles', '_incoming', imp.id.replace(/^my-skill.*/, 'my-skill'), 'references', 'private.jpg')), 'references copied');

    // A second pack through the shared pipeline: brief -> final, flat cards only.
    process.env.FABLEON_MOCK_DIR = join(ROOT, 'tests', 'fixtures', 'llm');
    process.env.DEEPSEEK_API_KEY = 'sk-test-never-log-this';
    process.env.FABLEON_FINAL_SIZE = '360x640';
    const dir = join(tmp, 'flat-film');
    const created = newProject(dir, { topic: 'The Moon Cheese', seconds: 20, language: 'en', voice: 'am_michael', style: 'flat-card' });
    mkdirSync(join(dir, 'research', 'sources'), { recursive: true });
    copyFileSync(join(ROOT, 'tests', 'fixtures', 'pipeline', 'mini', 'sources', 'moon.md'), join(dir, 'research', 'sources', 'moon.md'));
    const project = {
      ...created.project,
      style: 'flat-card',
      voice: { provider: 'mock', language: 'en', align: false, fit: 'exact', rate: { wordsPerSecond: 4.4 } },
      models: { default: { provider: 'mock', model: 'mock-v1' } },
      autopilot: true,
    };
    writeJsonArtifact(dir, 'test', 'project.json', project, 'project');
    // The recorded mock shot plan is anchored to the same two-line edits the studio journey makes.
    await new PipelineRunner(dir, project, { to: 'factcheck', autopilot: true }).run();
    const script = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));
    script.lines[0].text = 'The moon was a wheel of green cheese.';
    script.lines[1].text = 'Every spring, villagers climbed the hill with one long ladder.';
    writeFileSync(join(dir, 'script.json'), JSON.stringify(script, null, 2) + '\n');
    await new PipelineRunner(dir, project, { from: 'cast', to: 'final', autopilot: true }).run();
    ok('flat-card runs the shared pipeline to final', existsSync(join(dir, 'final.mp4')) && existsSync(join(dir, 'final-qa.md')), dir);
    const qa = existsSync(join(dir, 'final-qa.md')) ? readFileSync(join(dir, 'final-qa.md'), 'utf8') : '';
    ok('flat-card final QA passes with its own frozen limit', /Verdict: PASS/.test(qa), qa.split('\n').slice(0, 3).join(' | '));
    const shotSegs = existsSync(join(dir, 'render', 'final', 'segments')) ? readdirSync(join(dir, 'render', 'final', 'segments')) : [];
    ok('flat-card wrote final shot segments', shotSegs.some((f) => /\.mp4$/.test(f)), shotSegs.join(','));
    ok('style id is carried in the project', JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).style === 'flat-card', readFileSync(join(dir, 'project.json'), 'utf8').slice(0, 80));
  } finally {
    if (oldMock === undefined) delete process.env.FABLEON_MOCK_DIR; else process.env.FABLEON_MOCK_DIR = oldMock;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    if (oldFinalSize === undefined) delete process.env.FABLEON_FINAL_SIZE; else process.env.FABLEON_FINAL_SIZE = oldFinalSize;
    for (const id of imported) rmSync(join(ROOT, 'styles', id), { recursive: true, force: true });
    for (const dir of incomings) rmSync(dir, { recursive: true, force: true });
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, checks };
}
