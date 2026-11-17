// Phase 1 regression suite: engine typecheck, rendered stills vs fixture references, and the mix's duration/loudness.
// usage: npm test   (Node 20+, the Python env from README, Playwright Chromium)
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NPM, RENDER_CJS, ROOT, capture, findPython, run } from '../cli/src/env.js';
import { runGolden } from './golden.mjs';
import { runMotionTests } from './motion.test.mjs';
import { runStartAnchors } from './start-anchors.mjs';
import { runValidator } from './validator.mjs';
import { runCatalog } from './catalog.mjs';
import { runAuthoring } from './authoring.mjs';
import { runSolver } from './solver.mjs';
import { runFramesTests } from './frames.mjs';
import { runVisibility } from './visibility.mjs';
import { runSchemaTests } from './schema.mjs';
import { runPartial } from './partial.mjs';
import { runMeasured } from './measured.mjs';
import { runMeasurement } from './measurement.mjs';
import { runEditing } from './editing.mjs';
import { runFixtureMatch } from './fixture.mjs';
import { runPipelineTests } from './pipeline.mjs';
import { runCoreTests } from './core.mjs';
import { runWordTests } from './words.mjs';
import { runVoiceTests } from './voices.mjs';
import { runHindiTests } from './hindi.mjs';
import { runCastTests } from './cast.mjs';
import { runShotplanTests } from './shotplan.mjs';
import { runBoardTests } from './board.mjs';
import { runUsageTests } from './usage.mjs';
import { runModelTests } from './models.mjs';

const MAD_LIMIT = 6.0;
const DURATION = 121.30, DURATION_TOL = 0.05;
const LOUDNESS = -14.5, LOUDNESS_TOL = 0.5;

const refDir = join(ROOT, 'fixtures', 'adi-parva', 'reference-stills');
const frames = readdirSync(refDir)
  .filter((f) => /^frame_\d+\.jpg$/.test(f))
  .map((f) => Number(f.slice(6, -4)))
  .sort((a, b) => a - b);
const py = findPython();

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
};

async function typecheck() {
  console.log('\n== engine typecheck ==');
  await run(NPM, ['run', 'typecheck', '--workspace', '@fableon/engine'], { cwd: ROOT });
  check('typecheck', true);
}

async function stills() {
  console.log('\n== stills regression ==');
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-stills-'));
  try {
    await run(process.execPath, [RENDER_CJS, 'stills', '--out', join(tmp, 'f_'), '--frames', frames.join(','), '--project', join(ROOT, 'fixtures', 'adi-parva'), '--size', '540x960', '--msaa', '0'], { cwd: ROOT });
    const r = JSON.parse(capture(py, [join(ROOT, 'tests', 'compare_stills.py'), tmp, refDir]));
    for (const x of r.frames) console.log(`  frame ${x.frame}: mean abs diff ${x.mad.toFixed(3)} (limit ${MAD_LIMIT})`);
    check('stills', r.max <= MAD_LIMIT, `max ${r.max} <= ${MAD_LIMIT} on 0-255 grayscale`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function audio() {
  console.log('\n== audio regression ==');
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-audio-'));
  try {
    for (const f of ['voice.wav', 'words.json', 'shots.json']) copyFileSync(join(ROOT, 'fixtures', 'adi-parva', f), join(tmp, f));
    await run(py, [join(ROOT, 'audio', 'mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: tmp } });
    const m = JSON.parse(capture(py, [join(ROOT, 'tests', 'audio_metrics.py'), join(tmp, 'audio', 'mix.wav')]));
    const dOk = Math.abs(m.duration - DURATION) <= DURATION_TOL;
    const lOk = Math.abs(m.loudness - LOUDNESS) <= LOUDNESS_TOL;
    check('audio duration', dOk, `${m.duration.toFixed(3)} s (want ${DURATION.toFixed(2)} ± ${DURATION_TOL})`);
    check('audio loudness', lOk, `${m.loudness.toFixed(2)} LUFS (want ${LOUDNESS} ± ${LOUDNESS_TOL})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  if (!py) throw new Error('no Python found (set FABLEON_PYTHON or create .venv)');
  if (frames.length !== 9) throw new Error(`expected 9 reference stills, found ${frames.length}`);
  await typecheck();
  await stills();
  await audio();
  const catalog = runCatalog();
  check('catalog metadata', catalog.ok, `${catalog.sets} sets, ${catalog.marks} marks, ${catalog.volumes} volumes, ${catalog.measures} measures`);
  const authoring = runAuthoring();
  check('authoring', authoring.ok, `${authoring.checks.filter((c) => c.ok).length}/${authoring.checks.length} checks`);
  const solver = runSolver();
  check('framing solver', solver.ok, `${solver.checks.filter((c) => c.ok).length}/${solver.checks.length} checks`);
  const frameCheck = runFramesTests();
  check('frames validator', frameCheck.ok, `${frameCheck.checks.filter((c) => c.ok).length}/${frameCheck.checks.length} checks`);
  const visibility = runVisibility();
  check('visibility solver', visibility.ok, `${visibility.checks.filter((c) => c.ok).length}/${visibility.checks.length} checks`);
  const schemaTests = runSchemaTests();
  check('strict schema', schemaTests.ok, `${schemaTests.checks.filter((c) => c.ok).length}/${schemaTests.checks.length} checks`);
  const partial = runPartial();
  check('partial boards', partial.ok, `${partial.checks.filter((c) => c.ok).length}/${partial.checks.length} checks`);
  const measured = await runMeasured();
  check('measured frames', measured.ok, `${measured.checks.filter((c) => c.ok).length}/${measured.checks.length} checks`);
  const measurement = await runMeasurement();
  check('measurement fixes', measurement.ok, `${measurement.checks.filter((c) => c.ok).length}/${measurement.checks.length} checks`);
  const editing = await runEditing();
  check('editing rules', editing.ok, `${editing.checks.filter((c) => c.ok).length}/${editing.checks.length} checks`);
  const fixtureMatch = runFixtureMatch();
  check('director fixture match', fixtureMatch.ok, `${fixtureMatch.checks.filter((c) => c.ok).length}/${fixtureMatch.checks.length} checks`);
  const pipeline = await runPipelineTests();
  check('pipeline offline', pipeline.ok, `${pipeline.checks.filter((c) => c.ok).length}/${pipeline.checks.length} checks`);
  const core = runCoreTests();
  check('pipeline core', core.ok, `${core.checks.filter((c) => c.ok).length}/${core.checks.length} checks`);
  const words = runWordTests();
  check('unicode words + anchors', words.ok, `${words.checks.filter((c) => c.ok).length}/${words.checks.length} checks`);
  const voices = await runVoiceTests();
  check('voice providers', voices.ok, `${voices.checks.filter((c) => c.ok).length}/${voices.checks.length} checks`);
  const hindi = runHindiTests();
  check('hindi script craft', hindi.ok, `${hindi.checks.filter((c) => c.ok).length}/${hindi.checks.length} checks`);
  const cast = runCastTests();
  check('cast design', cast.ok, `${cast.checks.filter((c) => c.ok).length}/${cast.checks.length} checks`);
  const shotplan = runShotplanTests();
  check('shot plan checks', shotplan.ok, `${shotplan.checks.filter((c) => c.ok).length}/${shotplan.checks.length} checks`);
  const board = await runBoardTests();
  check('board writer', board.ok, `${board.checks.filter((c) => c.ok).length}/${board.checks.length} checks`);
  const usage = runUsageTests();
  check('usage aggregation', usage.ok, `${usage.checks.filter((c) => c.ok).length}/${usage.checks.length} checks`);
  const models = await runModelTests();
  check('model fallback', models.ok, `${models.checks.filter((c) => c.ok).length}/${models.checks.length} checks`);
  const validator = await runValidator();
  check('validator', validator.ok, `${validator.cases.filter((c) => c.ok).length}/${validator.cases.length} cases`);
  const starts = runStartAnchors();
  check('shot starts', starts.ok, `${starts.rows.length} anchors resolve to the old frames`);
  const motion = await runMotionTests();
  check('motion math', motion.ok, `${motion.checks.filter((c) => c.ok).length}/${motion.checks.length} checks`);
  const golden = await runGolden();
  for (const x of golden.shots) console.log(`  shot ${String(x.shot).padStart(2, '0')} frame ${x.frame}: mean abs diff ${x.mad.toFixed(3)} (limit ${golden.limit})`);
  check('golden frames', golden.ok, `${golden.frames} shot midpoints, max ${golden.max.toFixed(3)} <= ${golden.limit}`);
} catch (e) {
  failed++;
  console.error(`\nFAIL suite: ${e.message}`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
