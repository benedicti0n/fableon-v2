// Production queue: preset batch creation, collision-safe ids, persistence and pause controls.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    const hard = ['fact-check facts failed', 'DISK_LOW: need 3 GB', 'provider failed after all fallbacks', 'QA failed'];
    for (const err of hard) {
      const q3 = new ProductionQueue(root, fakeJobs, hub, { interval: 999999 }); q3.stop();
      const item = q3.items[0];
      q3.paused = false; item.status = 'running'; item.jobId = 'fake-job';
      q3.jobs = { list: () => [], get: () => ({ status: 'failed', error: err }), create: () => ({ id: 'x' }), cancel: async () => ({}) };
      await q3.tick();
      ok(`hard stop: ${err.slice(0, 24)}`, item.status === 'failed' && item.note === err, JSON.stringify(item));
    }
    const q4 = new ProductionQueue(root, fakeJobs, hub, { interval: 999999 }); q4.stop();
    const budgetItem = q4.items[0];
    budgetItem.status = 'running'; budgetItem.jobId = 'fake-job'; budgetItem.budgetUsd = 0.001;
    q4.paused = false;
    const calls = join(root, budgetItem.project, 'logs', 'calls.jsonl');
    writeFileSync(calls, JSON.stringify({ ts: new Date().toISOString(), stage: 'e2e', provider: 'deepseek', model: 'x', costUsd: 0.01, cached: false, ok: true }) + '\n');
    q4.jobs = { list: () => [], get: () => ({ status: 'done' }), create: () => ({ id: 'x' }), cancel: async () => ({}) };
    await q4.tick();
    ok('100 percent budget pause/fail', budgetItem.status === 'failed' && /budget exceeded/.test(budgetItem.note ?? ''), JSON.stringify(budgetItem));
  } finally { rmSync(root, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
