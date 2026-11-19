// The director foreground allocator never puts a foreground on an actor's standing mark or on a building.
import { trimForegroundMarks } from '../cli/src/allocator.js';

export function runForegroundTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const marks = ['hermitage.mat', 'hermitage.desk', 'hermitage.hut', 'hermitage.banyan', 'hermitage.clearing'];
  const shot = (fg) => ({ actors: [{ cast: 'bhima', at: 'hermitage.clearing' }], camera: [{ at: '4:0', foreground: fg }] });
  const a = trimForegroundMarks(shot('hermitage.clearing'), marks);
  ok('actor-mark foreground re-picked', a.camera[0].foreground !== 'hermitage.clearing' && a.camera[0].foreground === 'hermitage.mat', JSON.stringify(a.camera));
  const b = trimForegroundMarks(shot('hermitage.hut'), marks);
  ok('building foreground re-picked', b.camera[0].foreground !== 'hermitage.hut' && b.camera[0].foreground === 'hermitage.mat', JSON.stringify(b.camera));
  const c = trimForegroundMarks(shot('hermitage.hut'));
  ok('no safe alternative drops it', c.camera[0].foreground === undefined, JSON.stringify(c.camera));
  return { ok: errors.length === 0, errors, checks };
}
