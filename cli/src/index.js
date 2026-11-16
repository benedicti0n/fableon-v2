// fableon CLI entry point. Phase 1 commands: doctor + the fixture pipeline (init, shots, stills, render, audio,
// assemble, qa, voice, all).
import { Command } from 'commander';
import { runDoctor } from './doctor.js';

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

  program.parse(argv);
}
