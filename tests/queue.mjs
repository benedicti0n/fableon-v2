// Production queue: preset batch creation, collision-safe ids, persistence and pause controls.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductionQueue, listPresets } from '../server/src/queue.js';

export async function runQueueTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const root = mkdtempSync(join(tmpdir(), 'fableon-queue-'));
  const fakeJobs = { list: () => [], get: () => { throw new Error('no job'); }, create: () => { throw new Error('job creation is not used in this test'); }, cancel: async () => ({}) };
  const hub = { broadcast: () => {} };
  try {
    const presets = listPresets(root);
    ok('built-in daily preset exists', presets.some((p) => p.id === 'daily-short-hi' && p.builtIn), JSON.stringify(presets.map((p) => p.id)));
    const q = new ProductionQueue(root, fakeJobs, hub, { interval: 999999 });
    q.stop();
    const batch = await q.createBatch({ presetId: 'daily-short-hi', topics: ['The Moon Cheese', 'The Moon Cheese'], library: [] });
    ok('batch creates one item per topic with collision-safe ids', batch.items.length === 2 && batch.items[0].item.project !== batch.items[1].item.project, JSON.stringify(batch.items.map((x) => x.item.project)));
    ok('batch has a low-high estimate', batch.estimate.lowUsd > 0 && batch.estimate.highUsd >= batch.estimate.lowUsd, JSON.stringify(batch.estimate));
    ok('created project carries the preset voice and gates', existsSync(join(root, batch.items[0].item.project, 'project.json')) && batch.items[0].item.gates.includes('animatic'), JSON.stringify(batch.items[0].item));
    const q2 = new ProductionQueue(root, fakeJobs, hub, { interval: 999999 }); q2.stop();
    ok('queue survives a restart', q2.items.length === 2 && q2.paused === true, JSON.stringify(q2.list()));
    q2.setPaused(false);
    ok('queue starts', q2.paused === false, 'paused');
    q2.setPaused(true);
    ok('queue pauses', q2.paused === true, 'paused');
    const removed = q2.remove(batch.items[0].item.id);
    ok('queued item can be removed', removed && q2.items.length === 1, JSON.stringify(q2.items));
  } finally { rmSync(root, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
