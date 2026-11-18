// Approved outputs are read-only: autopilot never overwrites them, explicit non-autopilot --force can.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approve, assertWritable, isApprovedLocked, markScriptRevised } from '../cli/src/core/state.js';

export function runLockTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const dir = mkdtempSync(join(tmpdir(), 'fableon-lock-'));
  try {
    const project = { version: 1, id: 'lock', title: 'Lock', topic: 't', seconds: 30, language: 'hi', voice: { provider: 'sarvam' }, research: { web: false, maxSources: 8 }, models: { default: { provider: 'deepseek', model: null } }, autopilot: false };
    writeFileSync(join(dir, 'project.json'), JSON.stringify(project));
    writeFileSync(join(dir, 'script.json'), JSON.stringify({ version: 1, lines: [] }));
    writeFileSync(join(dir, 'SCRIPT.md'), '# locked\n');
    approve(dir, project, 'script');
    ok('approved output detected', isApprovedLocked(dir, project, 'script'), 'not locked');
    let auto = '';
    try { assertWritable(dir, project, 'script', { autopilot: true, force: true }); } catch (e) { auto = e.message; }
    ok('autopilot cannot overwrite', /read-only in autopilot/.test(auto), auto);
    let noForce = '';
    try { assertWritable(dir, project, 'script', { autopilot: false, force: false }); } catch (e) { noForce = e.message; }
    ok('non-force cannot overwrite', /approved/.test(noForce), noForce);
    assertWritable(dir, project, 'script', { autopilot: false, force: true });
    ok('explicit force can overwrite', true);
    let revised = '';
    try { markScriptRevised(dir); } catch (e) { revised = e.message; }
    ok('markScriptRevised is locked', /approved/.test(revised), revised);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
