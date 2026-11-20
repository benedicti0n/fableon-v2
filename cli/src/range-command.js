// `fableon range`: generate alternative takes for one time range.
import { basename, resolve } from 'node:path';
import { runRangeTakes } from './ranges.js';
import { withProjectLock } from './core/lock.js';
import { emitProgress } from './core/events.js';

export function rangeCommand(dirArg, { from, to, note = '', count = 2, edges = 'match', frames = false } = {}) {
  const dir = resolve(dirArg);
  const project = basename(dir);
  return withProjectLock(dir, 'range', () => runRangeTakes({
    projectDir: dir, from: Number(from), to: Number(to), note, count: Number(count), edges, frames,
    progress: (p) => emitProgress(project, 'ranges', p.step ?? 'ranges', p.done ?? 0, p.total ?? 0, { op: 'ranges', message: p.message }),
  }));
}
