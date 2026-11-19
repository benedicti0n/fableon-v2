// `fableon script-lines`: rewrite only selected script lines with director notes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDotEnv } from './env.js';
import { projectDir } from './project.js';
import { ModelRouter } from './models/router.js';
import { reviseScriptLines } from './stages/script.js';
import { withProjectLock } from './core/lock.js';

export async function scriptLinesCommand(dirArg, opts = {}) {
  loadDotEnv();
  const dir = projectDir(dirArg);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const lines = String(opts.lines ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n));
  if (!lines.length) throw new Error('script-lines needs --lines 3,7');
  const notes = String(opts.notes ?? '').trim();
  const force = !!opts.force;
  const result = await withProjectLock(dir, 'script-lines', async () => {
    const router = new ModelRouter(dir, project, { noCache: !!opts.noCache });
    return reviseScriptLines({ projectDir: dir, project, router, lines, notes, force });
  });
  console.log(`script-lines: ${result.changed ? 'rewrote' : 'kept'} line(s) ${result.lines.join(', ')}${notes ? ` — ${notes}` : ''}`);
  return result;
}
