// Project folder helpers: quality presets, input validation and workspace creation.
import { existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ROOT } from './env.js';
import { FableonError, ERROR_CODES } from './core/errors.js';

export const QUALITY = {
  preview: { size: '540x960', label: 'preview 540x960' },
  final: { size: '1440x2560', label: 'final 1440x2560' },
};

export function quality(name = 'preview') {
  const q = QUALITY[name];
  if (!q) throw new FableonError(ERROR_CODES.BAD_REQUEST, `unknown --quality ${name} (choose preview or final)`, { quality: name });
  return q;
}

export function projectDir(arg) {
  if (!arg) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'missing --project <dir>');
  const dir = resolve(arg);
  if (!existsSync(dir)) throw new FableonError(ERROR_CODES.NOT_FOUND, `project not found: ${dir} (run: fableon init <name> --from fixtures/adi-parva)`, { project: dir });
  return dir;
}

export function requireFile(dir, name, hint) {
  const p = join(dir, name);
  if (!existsSync(p)) throw new FableonError(ERROR_CODES.NOT_FOUND, `${dir} has no ${name}${hint ? ` (${hint})` : ''}`, { project: dir, file: name });
  return p;
}

/** The storyboard-only engine renders only projects that carry their own storyboard and word timings. */
export function assertProjectInputs(dir) {
  requireFile(dir, 'storyboard.json', 'run: fableon init <name> --from fixtures/adi-parva');
  requireFile(dir, 'words.json', 'run: fableon voice --project <dir>');
}

// Copy a project's inputs into work/<name>/. Derived folders (reference stills, audio, render, qa) stay out.
export function initProject(name, from) {
  if (!name || /[\\/]/.test(name) || name === '.' || name === '..') throw new FableonError(ERROR_CODES.BAD_REQUEST, 'init needs a simple project name (no slashes)');
  const src = resolve(ROOT, from);
  if (!existsSync(src)) throw new FableonError(ERROR_CODES.NOT_FOUND, `source project not found: ${src}`, { path: src });
  const dest = join(ROOT, 'work', name);
  if (existsSync(dest) && readdirSync(dest).length) throw new FableonError(ERROR_CODES.BAD_REQUEST, `${dest} already exists and is not empty`, { path: dest });
  mkdirSync(dest, { recursive: true });
  const skip = new Set(['reference-stills', 'audio', 'render', 'qa', 'stills', 'golden', 'diff']);
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
