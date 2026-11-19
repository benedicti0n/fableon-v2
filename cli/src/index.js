// fableon CLI entry point. Phase 1 commands: doctor + the fixture pipeline (init, voice, shots, stills, render, audio,
// assemble, qa, all).
import { Command } from 'commander';
import { runDoctor } from './doctor.js';
import { listOps } from './core/ops.js';
import { printError } from './core/errors.js';
import { takeEventsFlag, eventsEnabled, emitJob, finishJob, setCurrentJob } from './core/events.js';
import { acquireLock } from './core/lock.js';
import { resolve } from 'node:path';
import { validateCommand } from './validate.js';
import { compileCommand } from './compile.js';
import { framesCommand } from './frames.js';
import { schemaCommand } from './schema.js';
import { catalogCardCommand } from './catalog-card.js';
import { reviewCommand } from './review.js';
import { newCommand, statusCommand, approveCommand } from './core/commands.js';
import { runCommand } from './run-command.js';
import { castCommand } from './cast-command.js';
import { shotplanCommand } from './shotplan-command.js';
import { scriptLinesCommand } from './script-lines-command.js';
import { boardCommand } from './board-command.js';
import { usageCommand } from './usage.js';
import { runBakeoff } from './bakeoff.js';
import { lookdevCommand } from './lookdev.js';
import { lookcheckCommand } from './lookcheck.js';
import { cleanCommand, freeBytes } from './clean.js';
import { modelsCommand } from './models-command.js';
import { voiceBudgetCommand, voiceCheckCommand, voicePaceCommand } from './voice-command.js';
import { runAuditions } from './voice/auditions.js';
import { runRound2 } from './voice/round2.js';
import { runRound3 } from './voice/round3.js';
import {
  allCommand, assembleCommand, audioCommand, initCommand, qaCommand, renderCommand, shotsCommand, stillsCommand, voiceCommand,
} from './pipeline.js';

export function main(argv = process.argv) {
  const { argv: cleanArgv, events } = takeEventsFlag(argv);
  if (events) {
    setCurrentJob(process.env.FABLEON_JOB_ID ?? null);
    process.once('SIGTERM', () => { if (!finishJob('cancelled', { message: 'cancelled' })) return; setTimeout(() => process.exit(143), 250); });
  }
  const program = new Command();
  program
    .name('fableon')
    .description('Local, stage-wise generator for vertical cartoon story shorts')
    .version('0.1.0');

  program
    .command('serve')
    .description('start the local backend API on 127.0.0.1')
    .option('--port <n>', 'port', '4317')
    .option('--root <dir>', 'project root', 'work')
    .option('--open', 'open the token URL in the browser')
    .option('--dev', 'accept the Vite dev origin')
    .action(async (opts) => {
      try {
        const { startServer } = await import('@fableon/server');
        await startServer({ port: Number(opts.port), root: opts.root, open: !!opts.open, dev: !!opts.dev });
      } catch (e) { printError(e); process.exit(1); }
    });

  program
    .command('doctor')
    .description('check Node, Python, packages, ffmpeg, Chromium/WebGL, engine dist and disk space')
    .action(() => { runDoctor(); });

  const WRITE_COMMANDS = new Set(['run', 'approve', 'cast', 'shotplan', 'board', 'render', 'audio', 'assemble', 'qa', 'all', 'stills', 'lookdev', 'lookcheck', 'review', 'clean', 'voice', 'compile', 'schema', 'frames']);
  let actionLock = null;
  program.hook('preAction', (thisCommand, actionCommand) => {
    const opts = actionCommand.opts?.() ?? {};
    if (WRITE_COMMANDS.has(actionCommand.name()) && opts.project) actionLock = acquireLock(resolve(opts.project), actionCommand.name());
  });
  program.hook('postAction', () => { actionLock?.release(); actionLock = null; });

  program
    .command('ops')
    .description('list the shared operations registry')
    .option('--list', 'list operations')
    .option('--json', 'machine-readable json')
    .action((opts) => {
      const rows = listOps();
      if (opts.json) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return; }
      console.log('name              kind   heavy  cancellable  description');
      console.log('----------------  -----  -----  -----------  -----------');
      for (const o of rows) console.log(`${o.name.padEnd(16)} ${o.kind.padEnd(6)} ${String(o.heavy).padEnd(6)} ${String(o.cancellable).padEnd(12)} ${o.description}`);
    });

  program
    .command('mock-sleep')
    .description('test-only heavy job')
    .option('--ms <n>', 'sleep duration', '1000')
    .action(async (opts) => { await new Promise((r) => setTimeout(r, Number(opts.ms ?? 1000))); console.log('mock-sleep done'); });

  program
    .command('new <dir>')
    .description('create a new brief → research → script → fact-check → voice project')
    .requiredOption('--topic <text>', 'story topic')
    .option('--seconds <n>', 'target length in seconds', '90')
    .option('--voice <id>', 'Kokoro voice id', 'am_michael')
    .option('--language <code>', 'narration language: en or hi', 'en')
    .action((dir, opts) => newCommand(dir, opts));

  program
    .command('status')
    .description('show pipeline stage status, approvals, tokens and pronunciation TODOs')
    .requiredOption('--project <dir>', 'project folder')
    .action((opts) => statusCommand(opts.project));

  program
    .command('approve')
    .description('approve the current output of one pipeline stage')
    .requiredOption('--project <dir>', 'project folder')
    .requiredOption('--stage <name>', 'stage name')
    .option('--override <reason>', 'accept the currently flagged fact-check lines and record why')
    .action((opts) => approveCommand(opts.project, opts.stage, opts.override ?? null));

  program
    .command('run')
    .description('run pipeline stages in dependency order')
    .requiredOption('--project <dir>', 'project folder')
    .option('--to <stage>', 'last stage to run', 'voice')
    .option('--only <stage>', 'run only this stage')
    .option('--force', 'overwrite hand-edited outputs')
    .option('--autopilot', 'do not stop for approvals')
    .option('--no-cache', 'bypass the model response cache')
    .option('--fit <mode>', 'voice fit on|off', 'on')
    .option('--cached-only', 'fit the voice from the cached base take without a new provider call')
    .action(async (opts) => { try { await runCommand(opts.project, opts); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('cast')
    .description('design the cast, write asset gaps and render the cast sheet')
    .requiredOption('--project <dir>', 'project folder')
    .option('--notes <text>', 'director notes; reruns the cast stage with them')
    .action(async (opts) => { try { await castCommand(opts.project, opts); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('shotplan')
    .description('turn the script, words, cast and asset gaps into a deterministic shot plan')
    .requiredOption('--project <dir>', 'project folder')
    .option('--notes <text>', 'director notes; reruns the shot-plan stage with them')
    .action(async (opts) => { try { await shotplanCommand(opts.project, opts); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('script-lines')
    .description('rewrite only selected script lines with director notes')
    .requiredOption('--project <dir>', 'project folder')
    .requiredOption('--lines <list>', 'comma-separated line numbers')
    .option('--notes <text>', 'director notes')
    .option('--force', 'rewrite even if the script is approved')
    .option('--no-cache', 'bypass the model cache')
    .action(async (opts) => { try { await scriptLinesCommand(opts.project, opts); } catch (e) { printError(e); process.exit(1); } });

  program
    .command('board')
    .description('write and measured-repair the authoring board from the approved shot plan')
    .requiredOption('--project <dir>', 'project folder')
    .option('--shot <id>', 're-render only this shot segment after the board run')
    .option('--notes <text>', 'director notes; reruns the board stage')
    .action(async (opts) => { try { await boardCommand(opts.project, opts); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('clean')
    .description('remove regenerable render segments, old voice auditions and preview stills')
    .option('--project <dir>', 'one project (default: every work/ project)')
    .option('--dry-run', 'list the files and space without deleting')
    .action((opts) => {
      try {
        const before = freeBytes();
        const r = cleanCommand(opts.project ?? null, { dryRun: !!opts.dryRun });
        const mb = (r.bytes / 1024 / 1024).toFixed(1);
        console.log(`clean: ${r.files.length} file(s), ${mb} MB${opts.dryRun ? ' (dry run)' : ''}`);
        for (const f of r.files.slice(0, 80)) console.log(`  ${f}`);
        if (r.files.length > 80) console.log(`  … ${r.files.length - 80} more`);
        if (before != null) { const after = freeBytes(); console.log(`disk free: ${(before / 1e9).toFixed(2)} GB -> ${(after / 1e9).toFixed(2)} GB`); }
      } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
    });

  program
    .command('lookcheck')
    .description('measure warm/cool split, glow, luma stats, face brightness and crowding per scene')
    .requiredOption('--project <dir>', 'project folder')
    .option('--video <name>', 'animatic (default), final, or a path')
    .action(async (opts) => {
      try {
        const r = await lookcheckCommand(opts.project, opts.video ?? 'animatic');
        console.log(`lookcheck: ${r.warnings.length} warning(s); ${r.file}`);
      } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
    });

  program
    .command('lookdev')
    .description('render a look-dev sheet for every scene (planner pick + 2 alternatives)')
    .requiredOption('--project <dir>', 'project folder')
    .option('--out <dir>', 'output directory (default docs/reports/phase-3f)')
    .action(async (opts) => {
      try {
        const r = await lookdevCommand(opts.project, opts.out ?? null);
        console.log(`lookdev: ${r.scenes.length} scene(s) × 3 moods; ${r.outs.join(', ')}`);
      } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
    });

  program
    .command('bakeoff')
    .description('run one stage across candidate models on fixed cached cases')
    .requiredOption('--stage <name>', 'stage to bake off (script first)')
    .option('--models <list>', 'comma-separated model ids or labels')
    .option('--cases <list>', 'comma-separated project folders')
    .option('--budget <usd>', 'hard spend ceiling', '5')
    .action(async (opts) => {
      try {
        const models = opts.models ? opts.models.split(',').map((x) => x.trim()).filter(Boolean) : null;
        const cases = opts.cases ? opts.cases.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.startsWith('/') ? x : `${process.cwd()}/${x}`) : null;
        const r = await runBakeoff({ stage: opts.stage, models, cases, budget: Number(opts.budget) });
        console.log(`bakeoff: ${r.rows.length} runs, spent $${r.spent.toFixed(4)}; ${r.outDir}`);
      } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
    });

  program
    .command('usage')
    .description('aggregate Fableon provider usage from every calls.jsonl and read the provider balances')
    .option('--since <date>', 'only calls on or after YYYY-MM-DD')
    .option('--json', 'print machine-readable json instead of tables')
    .action(async (opts) => { try { await usageCommand(opts); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('models')
    .description('list, check or catalog provider models')
    .argument('<mode>', 'list, check or catalog')
    .requiredOption('--provider <name>', 'deepseek, openrouter, sarvam, openai-compatible or mock')
    .option('--model <id>', 'model id')
    .option('--base-url <url>', 'OpenAI-compatible base URL')
    .option('--key-env <name>', 'API key environment variable')
    .action(async (mode, opts) => { try { await modelsCommand(mode, opts.provider, opts); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('validate')
    .description('validate a project storyboard (schema, catalog, word anchors, time order)')
    .requiredOption('--project <dir>', 'project folder')
    .option('--deep', 'also run the in-frame/occlusion check')
    .option('--fast', 'use the analytical in-frame checker')
    .action((opts) => validateCommand(opts.project, opts.deep, opts.fast));

  program
    .command('schema')
    .description('write a per-project specialised authoring schema')
    .requiredOption('--project <dir>', 'project folder')
    .option('--out <file>', 'output schema file')
    .option('--shot <id>', 'write a slim per-shot board schema')
    .action((opts) => schemaCommand(opts.project, opts.out, opts.shot ?? null));

  program
    .command('catalog-card')
    .description('print a compact catalog card for director prompts')
    .option('--out <file>', 'write the card to a file')
    .action((opts) => catalogCardCommand(opts.out));

  program
    .command('review')
    .description('write a labelled side-by-side review sheet for selected shots')
    .requiredOption('--project <dir>', 'project folder')
    .option('--compare <dir>', 'comparison project folder')
    .option('--shots <ids>', 'comma-separated shot ids')
    .option('--out <file>', 'output sheet path or split directory')
    .option('--coverage', 'include coverage ID images')
    .option('--split', 'also write one image per shot')
    .action((opts) => reviewCommand(opts.project, opts.compare, opts.shots, opts.out, { coverage: opts.coverage, split: opts.split }));

  program
    .command('frames')
    .description('render object-ID coverage and check measured size, visibility, blockers, edges and editing rules')
    .requiredOption('--project <dir>', 'project folder')
    .option('--fast', 'use the analytical in-frame checker')
    .action(async (opts) => { try { await framesCommand(opts.project, opts.fast); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

  program
    .command('compile')
    .description('expand an authoring board.json into storyboard.json and validate it')
    .requiredOption('--project <dir>', 'project folder')
    .action((opts) => compileCommand(opts.project));

  program
    .command('init <name>')
    .description('create work/<name>/ from a fixture project')
    .option('--from <dir>', 'source project directory', 'fixtures/adi-parva')
    .action((name, opts) => initCommand(name, opts.from));

  program
    .command('shots')
    .description('write shots.json, qa_meta.json and cuts.json for a project')
    .requiredOption('--project <dir>', 'project folder (e.g. work/adi)')
    .action((opts) => shotsCommand(opts.project));

  program
    .command('stills')
    .description('render selected frames as JPEG stills')
    .requiredOption('--project <dir>', 'project folder')
    .option('--frames <list>', 'frame numbers or start,mid,end', 'start,mid,end')
    .option('--shots <ids>', 'only these shot ids, e.g. S14,S27')
    .option('--quality <quality>', 'preview (540x960) or final (1440x2560)', 'preview')
    .action((opts) => stillsCommand(opts.project, opts.frames, opts.quality, opts.shots));

  program
    .command('render')
    .description('render all shots to render/seg_XX.mp4 (resumable)')
    .requiredOption('--project <dir>', 'project folder')
    .option('--quality <quality>', 'preview (540x960) or final (1440x2560)', 'preview')
    .option('--workers <n>', 'parallel segment workers', '2')
    .option('--shots <ids>', 'render only these shot ids, e.g. S14,S27')
    .option('--detach', 'keep rendering after this process exits')
    .action((opts) => renderCommand(opts.project, { qualityName: opts.quality, workers: Number(opts.workers), detach: !!opts.detach, shots: opts.shots }));

  program
    .command('audio')
    .description('synthesize the score, sound effects and final mix')
    .requiredOption('--project <dir>', 'project folder')
    .action((opts) => audioCommand(opts.project));

  program
    .command('assemble')
    .description('concatenate the shot clips and mux the final mix into final.mp4')
    .requiredOption('--project <dir>', 'project folder')
    .action((opts) => assembleCommand(opts.project));

  program
    .command('qa')
    .description('run frame QA and write qa/summary.md')
    .requiredOption('--project <dir>', 'project folder')
    .action((opts) => qaCommand(opts.project));

  program
    .command('voice [mode]')
    .description('fixture Kokoro narration, or a voice provider mode: check | audition | pace | budget')
    .option('--project <dir>', 'project folder')
    .option('--speed <speed>', 'Kokoro speaking speed', '1.35')
    .option('--voice <voice>', 'Kokoro voice id', 'am_michael')
    .option('--provider <name>', 'voice provider', 'elevenlabs')
    .option('--model <id>', 'provider model id')
    
    .option('--voice-id <id>', 'provider voice id')
    .option('--voices <n>', 'number of audition voices', '4')
    .option('--models <list>', 'comma-separated audition models')
    .option('--round <n>', 'audition round (1 or 2)', '1')
    .option('--paces <list>', 'pace variants to rebuild', '1.10,1.15,1.20')
    .option('--choose <pace>', 'apply one pace to voice.wav and words.json')
    .action(async (mode, opts) => {
      if (mode === 'check') {
        try { const r = await voiceCheckCommand(opts); if (!r.ok) process.exitCode = 1; }
        catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
        return;
      }
      if (mode === 'budget') { try { await voiceBudgetCommand(); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } return; }
      if (mode === 'pace') {
        if (!opts.project) { console.error('fableon: missing --project <dir>'); process.exit(1); }
        try { await voicePaceCommand(opts.project, opts); }
        catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
        return;
      }
      if (mode === 'audition') {
        if (!opts.project) { console.error('fableon: missing --project <dir>'); process.exit(1); }
        try {
          const models = opts.models ? opts.models.split(',').map((x) => x.trim()).filter(Boolean) : null;
          const r = opts.round === '3' ? await runRound3(opts.project) : opts.round === '2' ? await runRound2(opts.project) : await runAuditions(opts.project, { voices: Number(opts.voices ?? 4), models });
          if (opts.round === '3' && r.ok) console.log(`round 3: ${r.rows.length} takes, ${r.md}`);
          if (!r.ok) process.exitCode = 1;
        } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); }
        return;
      }
      if (!opts.project) { console.error('fableon: missing --project <dir>'); process.exit(1); }
      voiceCommand(opts.project, opts.speed, opts.voice);
    });

  program
    .command('all')
    .description('shots -> render -> audio -> assemble -> qa')
    .requiredOption('--project <dir>', 'project folder')
    .option('--quality <quality>', 'preview (540x960) or final (1440x2560)', 'preview')
    .option('--workers <n>', 'parallel segment workers', '2')
    .action((opts) => allCommand(opts.project, { qualityName: opts.quality, workers: Number(opts.workers) }));

  return program.parseAsync(cleanArgv).catch((e) => {
    printError(e);
    if (eventsEnabled()) emitJob('failed', { error: e?.toJSON?.() ?? { message: String(e) } });
    process.exitCode = 1;
  });
}
