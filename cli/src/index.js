// fableon CLI entry point. Phase 1 commands: doctor + the fixture pipeline (init, voice, shots, stills, render, audio,
// assemble, qa, all).
import { Command } from 'commander';
import { runDoctor } from './doctor.js';
import { validateCommand } from './validate.js';
import { compileCommand } from './compile.js';
import { framesCommand } from './frames.js';
import {
  allCommand, assembleCommand, audioCommand, initCommand, qaCommand, renderCommand, shotsCommand, stillsCommand, voiceCommand,
} from './pipeline.js';

export function main(argv = process.argv) {
  const program = new Command();
  program
    .name('fableon')
    .description('Local, stage-wise generator for vertical cartoon story shorts')
    .version('0.1.0');

  program
    .command('doctor')
    .description('check Node, Python, packages, ffmpeg, Chromium/WebGL, engine dist and disk space')
    .action(() => { runDoctor(); });

  program
    .command('validate')
    .description('validate a project storyboard (schema, catalog, word anchors, time order)')
    .requiredOption('--project <dir>', 'project folder')
    .option('--deep', 'also run the in-frame/occlusion check')
    .action((opts) => validateCommand(opts.project, opts.deep));

  program
    .command('frames')
    .description('check every named camera subject against the safe area and scenery occlusion')
    .requiredOption('--project <dir>', 'project folder')
    .action((opts) => { try { framesCommand(opts.project); } catch (e) { console.error(`fableon: ${e.message}`); process.exit(1); } });

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
    .requiredOption('--frames <list>', 'comma-separated frame numbers, e.g. 60,640')
    .option('--quality <quality>', 'preview (540x960) or final (1440x2560)', 'preview')
    .action((opts) => stillsCommand(opts.project, opts.frames, opts.quality));

  program
    .command('render')
    .description('render all shots to render/seg_XX.mp4 (resumable)')
    .requiredOption('--project <dir>', 'project folder')
    .option('--quality <quality>', 'preview (540x960) or final (1440x2560)', 'preview')
    .option('--workers <n>', 'parallel segment workers', '2')
    .option('--detach', 'keep rendering after this process exits')
    .action((opts) => renderCommand(opts.project, { qualityName: opts.quality, workers: Number(opts.workers), detach: !!opts.detach }));

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
    .command('voice')
    .description('regenerate narration and word timings with Kokoro (optional for the fixture)')
    .requiredOption('--project <dir>', 'project folder')
    .option('--speed <speed>', 'Kokoro speaking speed', '1.35')
    .option('--voice <voice>', 'Kokoro voice id', 'am_michael')
    .action((opts) => voiceCommand(opts.project, opts.speed, opts.voice));

  program
    .command('all')
    .description('shots -> render -> audio -> assemble -> qa')
    .requiredOption('--project <dir>', 'project folder')
    .option('--quality <quality>', 'preview (540x960) or final (1440x2560)', 'preview')
    .option('--workers <n>', 'parallel segment workers', '2')
    .action((opts) => allCommand(opts.project, { qualityName: opts.quality, workers: Number(opts.workers) }));

  return program.parseAsync(argv);
}
