// `fableon compile`: expand board.json into storyboard.json, then validate the v1 result.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileProject } from './authoring.js';
import { validateStoryboard } from './validate.js';

export function compileCommand(dirArg) {
  const { dir, storyboard, stats } = compileProject(dirArg);
  const file = join(dir, 'storyboard.json');
  writeFileSync(file, JSON.stringify(storyboard, null, 2) + '\n');
  const r = validateStoryboard(dir);
  if (!r.ok) throw new Error(`compiled storyboard did not validate (${r.errors.length} error(s))`);
  console.log(`compile: ${file} (${storyboard.shots.length} shots, ${stats.raw} raw escape(s))`);
  return { file, stats };
}
