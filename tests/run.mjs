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
import { runPaceTests } from './pace.mjs';
import { runFormulaTests } from './formula.mjs';
import { runDirectorTests } from './director.mjs';
import { runSoundTests } from './sound.mjs';
import { runProviderTests } from './providers.mjs';
import { runAllocatorTests } from './allocator.mjs';
import { runBakeoffTests } from './bakeoff.mjs';
import { runSarvamTests } from './voice_sarvam.mjs';
import { runPerformanceTests } from './performance.mjs';
import { runAlignerTests } from './aligner.mjs';
import { runVoiceQaTests } from './voice_qa.mjs';
import { runGuardPauseTests } from './guard_pauses.mjs';
import { runLookTests } from './look.mjs';
import { runLookQaTests } from './lookqa.mjs';
import { runLockTests } from './lock.mjs';
import { runCleanTests } from './clean.mjs';
import { runVoiceRateTests } from './voice_rate.mjs';
import { runCastPlaceTests } from './cast_places.mjs';
import { runGlowTests } from './glow.mjs';
import { runGlowDiscTests } from './glow_disc.mjs';
import { runForegroundTests } from './foreground.mjs';
import { runDepthMaskTests } from './depth_mask.mjs';
import { runStateTests } from './state.mjs';
import { runEventsTests } from './events.mjs';
import { runServerTests } from './server.mjs';
import { runStudioTests } from './studio.mjs';
import { runFinalTests } from './final.mjs';
import { runFinishLookTests } from './look-finish.mjs';
import { runPublishTests } from './publish.mjs';

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
  const pace = await runPaceTests();
  check('voice pace rebuild', pace.ok, `${pace.checks.filter((c) => c.ok).length}/${pace.checks.length} checks`);
  const formula = runFormulaTests();
  check('script formula', formula.ok, `${formula.checks.filter((c) => c.ok).length}/${formula.checks.length} checks`);
  const director = await runDirectorTests();
  check('director camera', director.ok, `${director.checks.filter((c) => c.ok).length}/${director.checks.length} checks`);
  const sound = await runSoundTests();
  check('sound cues + mix', sound.ok, `${sound.checks.filter((c) => c.ok).length}/${sound.checks.length} checks`);
  const providers = await runProviderTests();
  check('provider registry', providers.ok, `${providers.checks.filter((c) => c.ok).length}/${providers.checks.length} checks`);
  const allocator = runAllocatorTests();
  check('director allocator', allocator.ok, `${allocator.checks.filter((c) => c.ok).length}/${allocator.checks.length} checks`);
  const bakeoff = runBakeoffTests();
  check('bakeoff scoring', bakeoff.ok, `${bakeoff.checks.filter((c) => c.ok).length}/${bakeoff.checks.length} checks`);
  const sarvam = await runSarvamTests();
  check('Sarvam TTS', sarvam.ok, `${sarvam.checks.filter((c) => c.ok).length}/${sarvam.checks.length} checks`);
  const performance = runPerformanceTests();
  check('performance direction', performance.ok, `${performance.checks.filter((c) => c.ok).length}/${performance.checks.length} checks`);
  const aligner = runAlignerTests();
  check('forced aligner', aligner.ok, aligner.skipped ? aligner.checks[0].detail : `${aligner.checks.filter((c) => c.ok).length}/${aligner.checks.length} checks; ${aligner.checks.find((c) => c.name === 'aligner numbers')?.detail ?? ''}`);
  const voiceQa = runVoiceQaTests();
  check('voice QA', voiceQa.ok, `${voiceQa.checks.filter((c) => c.ok).length}/${voiceQa.checks.length} checks`);
  const guard = runGuardPauseTests();
  check('hindi pause guard', guard.ok, `${guard.checks.filter((c) => c.ok).length}/${guard.checks.length} checks`);
  const look = runLookTests();
  check('look rules', look.ok, `${look.checks.filter((c) => c.ok).length}/${look.checks.length} checks`);
  const lookqa = runLookQaTests();
  check('look QA', lookqa.ok, `${lookqa.checks.filter((c) => c.ok).length}/${lookqa.checks.length} checks`);
  const lock = runLockTests();
  check('approved lock', lock.ok, `${lock.checks.filter((c) => c.ok).length}/${lock.checks.length} checks`);
  const clean = runCleanTests();
  check('clean', clean.ok, `${clean.checks.filter((c) => c.ok).length}/${clean.checks.length} checks`);
  const rate = runVoiceRateTests();
  check('voice-aware budget', rate.ok, `${rate.checks.filter((c) => c.ok).length}/${rate.checks.length} checks`);
  const places = runCastPlaceTests();
  check('cast places', places.ok, `${places.checks.filter((c) => c.ok).length}/${places.checks.length} checks`);
  const glow = runGlowTests();
  check('glow mask', glow.ok, `${glow.checks.filter((c) => c.ok).length}/${glow.checks.length} checks`);
  const disc = runGlowDiscTests();
  check('glow disc', disc.ok, `${disc.checks.filter((c) => c.ok).length}/${disc.checks.length} checks`);
  const fg = runForegroundTests();
  check('foreground allocator', fg.ok, `${fg.checks.filter((c) => c.ok).length}/${fg.checks.length} checks`);
  const dm = runDepthMaskTests();
  check('depth mask', dm.ok, `${dm.checks.filter((c) => c.ok).length}/${dm.checks.length} checks`);
  const st = runStateTests();
  check('state migration + lock', st.ok, `${st.checks.filter((c) => c.ok).length}/${st.checks.length} checks`);
  const ev = await runEventsTests();
  check('ops + CLI events', ev.ok, `${ev.checks.filter((c) => c.ok).length}/${ev.checks.length} checks`);
  const sv = await runServerTests();
  check('server API', sv.ok, `${sv.checks.filter((c) => c.ok).length}/${sv.checks.length} checks`);
  const studio = await runStudioTests();
  check('studio read models', studio.ok, `${studio.checks.filter((c) => c.ok).length}/${studio.checks.length} checks`);
  const final = await runFinalTests();
  check('final cache plan', final.ok, `${final.checks.filter((c) => c.ok).length}/${final.checks.length} checks`);
  const finishLook = await runFinishLookTests();
  check('world-only finish look', finishLook.ok, `${finishLook.checks.filter((c) => c.ok).length}/${finishLook.checks.length} checks`);
  const publish = await runPublishTests();
  check('publish package', publish.ok, `${publish.checks.filter((c) => c.ok).length}/${publish.checks.length} checks`);
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
