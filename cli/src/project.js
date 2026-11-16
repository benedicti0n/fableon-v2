// Project folder helpers: quality presets, input validation, and the Phase 1 gate that only the fixture timeline is drawable.
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ENGINE, ROOT } from './env.js';

export const QUALITY = {
  preview: { size: '540x960', label: 'preview 540x960' },
  final: { size: '1440x2560', label: 'final 1440x2560' },
};

export function quality(name = 'preview') {
  const q = QUALITY[name];
  if (!q) throw new Error(`unknown --quality ${name} (choose preview or final)`);
  return q;
}

export function projectDir(arg) {
  if (!arg) throw new Error('missing --project <dir>');
  const dir = resolve(arg);
  if (!existsSync(dir)) throw new Error(`project not found: ${dir} (run: fableon init <name> --from fixtures/adi-parva)`);
  return dir;
}

export function requireFile(dir, name, hint) {
  const p = join(dir, name);
  if (!existsSync(p)) throw new Error(`${dir} has no ${name}${hint ? ` (${hint})` : ''}`);
  return p;
}

// The renderer's timeline is compiled in (engine/src/words.json) until Phase 2. Refuse to render a different film
// instead of silently drawing the fixture under someone else's audio.
export function assertFixtureTimeline(dir) {
  const mine = readFileSync(requireFile(dir, 'words.json'), 'utf8');
  const fixture = readFileSync(join(ENGINE, 'src', 'words.json'), 'utf8');
  if (mine !== fixture) {
    throw new Error(`${join(dir, 'words.json')} differs from engine/src/words.json — legacy shots need the compiled timeline (custom projects arrive in Phase 2B)`);
  }
}

/** A storyboard with legacy shots depends on the compiled-in timeline; a fully ported one may use its own words. */
export function assertRenderable(dir) {
  const sbPath = join(dir, 'storyboard.json');
  if (!existsSync(sbPath)) { assertFixtureTimeline(dir); return null; }
  const sb = JSON.parse(readFileSync(sbPath, 'utf8'));
  if ((sb.shots ?? []).some((s) => s.legacy)) assertFixtureTimeline(dir);
  return sb;
}

// Copy a project's inputs into work/<name>/. Derived folders (reference stills, audio, render, qa) stay out.
export function initProject(name, from) {
  if (!name || /[\\/]/.test(name) || name === '.' || name === '..') throw new Error('init needs a simple project name (no slashes)');
  const src = resolve(ROOT, from);
  if (!existsSync(src)) throw new Error(`source project not found: ${src}`);
  const dest = join(ROOT, 'work', name);
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} already exists and is not empty`);
  mkdirSync(dest, { recursive: true });
  const skip = new Set(['reference-stills', 'audio', 'render', 'qa', 'stills']);
  const copied = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(src, rel), { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const r = join(rel, e.name);
      if (e.isDirectory()) walk(r);
      else { mkdirSync(join(dest, rel), { recursive: true }); copyFileSync(join(src, r), join(dest, r)); copied.push(r); }
    }
  };
  walk('');
  return { dir: dest, copied: copied.sort(), from: basename(src) };
}
