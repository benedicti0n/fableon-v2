// `fableon export`: copy the publish package and transcode the requested upload profiles.
import { resolve } from 'node:path';
import { exportPackage } from './publish.js';
import { withProjectLock } from './core/lock.js';

export function exportCommand(dirArg, { profiles = 'youtube-short' } = {}) {
  const dir = resolve(dirArg);
  return withProjectLock(dir, 'export', () => exportPackage(dir, { profiles: String(profiles).split(',').map((x) => x.trim()).filter(Boolean) }));
}
