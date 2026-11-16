// Core artifact/state tests: hashing, edited detection, approval invalidation and history.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newProject } from '../cli/src/core/new-project.js';
import { approve, computeHash, statusOf } from '../cli/src/core/state.js';
import { stageByName } from '../cli/src/core/stages.js';
import { writeJsonArtifact, writeTextArtifact } from '../cli/src/core/artifacts.js';

export function runCoreTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-core-'));
  try {
    const { project } = newProject(tmp, { topic: 'The Moon Cheese', seconds: 20, voice: 'am_michael' });
    ok('new layout', ['project.json', 'brief.md', 'research/sources', '.fableon/cache', 'logs'].every((p) => existsSync(join(tmp, p))));
    const brief = stageByName('brief'), research = stageByName('research');
    const h1 = computeHash(tmp, project, brief), r1 = computeHash(tmp, project, research);
    ok('missing brief', statusOf(tmp, project, brief).status === 'missing');
    writeTextArtifact(tmp, 'brief', 'brief.md', '# My brief\n\nA user-written brief.\n');
    ok('edited detection', statusOf(tmp, project, brief).status === 'edited');
    approve(tmp, project, brief.name);
    ok('approved', statusOf(tmp, project, brief).status === 'approved');
    writeTextArtifact(tmp, 'brief', 'brief.md', '# My brief\n\nA changed brief.\n');
    ok('approval invalidated', !statusOf(tmp, project, brief).approved);
    writeJsonArtifact(tmp, 'project', 'project.json', { ...project, topic: 'A different topic' }, 'project');
    const p2 = JSON.parse(readFileSync(join(tmp, 'project.json'), 'utf8'));
    ok('hash changes with project', computeHash(tmp, p2, brief) !== h1);
    ok('downstream hash changes', computeHash(tmp, p2, research) !== r1);
    const p3 = { ...p2, autopilot: true };
    ok('unrelated key ignored', computeHash(tmp, p3, brief) === computeHash(tmp, p2, brief));
    const p4 = { ...p2, models: { default: { provider: 'mock', model: 'mock-v2' } } };
    ok('model setting in hash', computeHash(tmp, p4, brief) !== computeHash(tmp, p2, brief));
    const hist = join(tmp, '.fableon', 'history', 'brief');
    const files = existsSync(hist) ? readdirSync(hist) : [];
    ok('history on overwrite', files.length > 0, files.join(','));
    const histFiles = files.flatMap((d) => { const p = join(hist, d, 'brief.md'); return existsSync(p) ? [readFileSync(p, 'utf8')] : []; });
    ok('history contains old text', histFiles.some((t) => t.includes('A user-written brief.')));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
