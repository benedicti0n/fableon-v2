// Style packs: registry, contract checks, adapters, project migration and skill import.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, RENDER_CJS, run } from './env.js';
import { validationErrors, atomicWrite } from './core/artifacts.js';

export const STYLES_DIR = join(ROOT, 'styles');
export const DEFAULT_STYLE = 'toon3d';
const adapterCache = new Map();

export const styleId = (project) => String(project?.style ?? DEFAULT_STYLE);
const rawStyle = ({ dir, file, ...rest }) => rest;

export function styleDir(id) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(id ?? ''))) throw new Error(`invalid style id "${id}"`);
  const dir = join(STYLES_DIR, id);
  if (!existsSync(dir)) throw new Error(`style "${id}" was not found in styles/`);
  return dir;
}

export function readStyle(id) {
  const dir = styleDir(id);
  const file = join(dir, 'style.json');
  if (!existsSync(file)) throw new Error(`style "${id}" has no style.json`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return { ...data, dir, file };
}

export function listStyles({ includeTest = false } = {}) {
  if (!existsSync(STYLES_DIR)) return [];
  const out = [];
  for (const e of readdirSync(STYLES_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue;
    if (!existsSync(join(STYLES_DIR, e.name, 'style.json'))) continue;
    try {
      const s = readStyle(e.name);
      if (s.testOnly && !includeTest) continue;
      const errs = validationErrors('style', rawStyle(s));
      out.push({ id: s.id, name: s.name, description: s.description, status: errs.length ? 'not-ready' : s.status, testOnly: !!s.testOnly, sample: s.sampleFrames?.[0] ?? null, errors: errs });
    } catch (e) { out.push({ id: e.name, name: e.name, description: '', status: 'not-ready', sample: null, errors: [e.message] }); }
  }
  return out.sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready') || a.name.localeCompare(b.name));
}

export function loadStyle(id = DEFAULT_STYLE) {
  const s = readStyle(id);
  const errors = validationErrors('style', rawStyle(s));
  if (errors.length) throw new Error(`style ${id}: ${errors.join('; ')}`);
  if (s.status !== 'ready') throw new Error(`style ${id} is ${s.status}; run: fableon style check ${id}`);
  return s;
}

export async function styleAdapter(id = DEFAULT_STYLE) {
  const s = loadStyle(id);
  const file = resolve(s.dir, s.adapter);
  if (!existsSync(file)) throw new Error(`style ${id}: adapter ${s.adapter} is missing`);
  if (!adapterCache.has(file)) adapterCache.set(file, await import(pathToFileURL(file).href));
  return { style: s, adapter: adapterCache.get(file) };
}

export function ensureProjectStyle(dir, project, { write = true } = {}) {
  if (!project || project.style) return project;
  const migrated = { ...project, style: DEFAULT_STYLE };
  if (write && existsSync(join(dir, 'project.json')) && !resolve(dir).includes(`${join(ROOT, 'fixtures')}`)) {
    try { atomicWrite(join(dir, 'project.json'), JSON.stringify(migrated, null, 2) + '\n'); } catch { /* read-only workspace */ }
  }
  return migrated;
}

export function styleCatalog(project) {
  const id = styleId(project);
  const s = loadStyle(id);
  return resolve(s.dir, s.catalog);
}

export function styleQaEnv(project) {
  const s = loadStyle(styleId(project));
  return { FABLEON_QA_FROZEN: String(s.qa.frozenFrames), FABLEON_QA_POP_FACTOR: String(s.qa.popFactor), FABLEON_QA_POP_OFFSET: String(s.qa.popOffset) };
}

const size = (p) => existsSync(p) ? statSync(p).size : null;

/** Contract-only check: no rendering. */
export function checkStyleContract(id) {
  const errors = [];
  let s;
  try { s = readStyle(id); } catch (e) { return { ok: false, errors: [e.message], style: null }; }
  errors.push(...validationErrors('style', rawStyle(s)));
  if (s.id !== id) errors.push(`/id must match the folder name "${id}"`);
  const adapter = resolve(s.dir, s.adapter);
  if (!existsSync(adapter)) errors.push(`/adapter ${s.adapter} does not exist`);
  const catalog = resolve(ROOT, s.catalog);
  if (!existsSync(catalog)) errors.push(`/catalog ${s.catalog} does not exist`);
  else { try { JSON.parse(readFileSync(catalog, 'utf8')); } catch (e) { errors.push(`/catalog is not valid JSON: ${e.message}`); } }
  const board = resolve(ROOT, s.boardSchema);
  if (!existsSync(board)) errors.push(`/boardSchema ${s.boardSchema} does not exist`);
  else { try { JSON.parse(readFileSync(board, 'utf8')); } catch (e) { errors.push(`/boardSchema is not valid JSON: ${e.message}`); } }
  const director = resolve(ROOT, s.prompts.director);
  const craft = resolve(ROOT, s.prompts.craft);
  const ds = size(director), cs = size(craft);
  if (ds === null) errors.push(`/prompts/director ${s.prompts.director} does not exist`);
  else if (ds > 8 * 1024) errors.push(`/prompts/director is ${ds} bytes (limit 8192)`);
  if (cs === null) errors.push(`/prompts/craft ${s.prompts.craft} does not exist`);
  else if (cs > 3 * 1024) errors.push(`/prompts/craft is ${cs} bytes (limit 3072)`);
  for (const f of s.sampleFrames ?? []) if (!existsSync(resolve(ROOT, f))) errors.push(`/sampleFrames ${f} does not exist`);
  if (!s.qa || !Number.isFinite(s.qa.frozenFrames)) errors.push('/qa/frozenFrames is required');
  return { ok: errors.length === 0, errors, style: s };
}

/** Full check: contract plus a test still at preview and final quality. */
export async function checkStyle(id, { render = true } = {}) {
  const contract = checkStyleContract(id);
  if (!contract.ok || !render) return { ...contract, rendered: [] };
  const s = contract.style;
  const { adapter } = await styleAdapter(id);
  const tmp = join(ROOT, 'work', '.style-check', `${id}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const rendered = [];
  try {
    for (const [quality, dims] of [['preview', '540x960'], ['final', '1440x2560']]) {
      if (s.id === DEFAULT_STYLE) {
        for (const f of ['storyboard.json', 'words.json']) {
          const src = join(ROOT, 'fixtures', 'adi-parva', f);
          if (existsSync(src)) cpSync(src, join(tmp, f));
        }
        const out = join(tmp, `check-${quality}-`);
        await run(process.execPath, [RENDER_CJS, 'stills', '--out', out, '--frames', '60', '--project', tmp, '--size', dims, '--msaa', '0'], { cwd: ROOT });
        rendered.push(`${out}60.jpg`);
      } else if (typeof adapter.renderStills === 'function') {
        const out = join(tmp, `check-${quality}-`);
        await adapter.renderStills({ projectDir: tmp, frames: '0', out, size: dims });
        rendered.push(`${out}0.jpg`);
      } else {
        rendered.push(null);
      }
    }
    const missing = rendered.filter((f) => !f || !existsSync(f) || statSync(f).size === 0);
    const ok = contract.ok && missing.length === 0;
    if (ok && s.status !== 'ready') {
      const ready = { ...rawStyle(s), status: 'ready' };
      writeFileSync(s.file, JSON.stringify(ready, null, 2) + '\n');
    }
    return { ...contract, ok, errors: missing.length ? [...contract.errors, 'test board render did not produce both stills'] : contract.errors, rendered };
  } catch (e) {
    return { ...contract, ok: false, errors: [...contract.errors, `render check: ${e.message}`], rendered };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'style';

function copySkillText(from, to) {
  const copied = [];
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'references', 'reference'].includes(e.name)) continue;
      const src = join(dir, e.name), r = join(rel, e.name);
      if (e.isDirectory()) { mkdirSync(join(to, r), { recursive: true }); copied.push(...walk(src, r)); continue; }
      if (!/\.(md|txt|json|ya?ml|toml|license|licence)$/i.test(e.name) && !/^(LICENSE|LICENCE)$/i.test(e.name)) continue;
      mkdirSync(join(to, rel), { recursive: true });
      cpSync(src, join(to, r));
      copied.push(r);
    }
    return copied;
  };
  return walk(from);
}

/** Copy a skill folder into styles/_incoming/<name>/ and scaffold a not-ready pack. */
export function importStyle({ from = null, git = null, id = null, name = null } = {}) {
  const skillName = name ?? (from ? basename(resolve(from)) : git ? basename(String(git).replace(/\.git$/, '')) : null);
  if (!skillName) throw new Error('style import needs --from <folder> or --git <url>');
  const incoming = join(STYLES_DIR, '_incoming', slug(skillName));
  rmSync(incoming, { recursive: true, force: true });
  mkdirSync(incoming, { recursive: true });
  let copied = [];
  if (git) {
    const r = spawnSync('git', ['clone', '--depth', '1', git, incoming], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git clone failed: ${r.stderr || r.stdout}`);
    copied = ['(git clone)'];
  } else {
    const src = resolve(from);
    if (!existsSync(src) || !statSync(src).isDirectory()) throw new Error(`skill folder not found: ${src}`);
    copied = copySkillText(src, incoming);
  }
  const sid = id ? slug(id) : slug(skillName);
  const dir = join(STYLES_DIR, sid);
  if (existsSync(dir)) throw new Error(`style ${sid} already exists; choose another --id`);
  mkdirSync(dir, { recursive: true });
  const licenceFile = ['LICENSE', 'LICENCE', 'license.txt', 'LICENCE.txt'].map((f) => join(incoming, f)).find(existsSync);
  const licence = licenceFile ? readFileSync(licenceFile, 'utf8').split('\n').find((l) => l.trim())?.trim() ?? 'see LICENSE' : 'UNKNOWN — record the licence before shipping';
  const style = {
    version: 1, id: sid, name: name ?? skillName, description: `Imported from the ${skillName} skill; porting is not complete.`,
    status: 'not-ready',
    source: { skill: skillName, ...(git ? { url: git } : {}), licence, notes: `Imported into styles/_incoming/${slug(skillName)}; text only, reference media skipped.` },
    formats: ['short-vertical'], sampleFrames: [], adapter: './adapter.mjs',
    catalog: 'schema/catalog.json', boardSchema: 'schema/storyboard.schema.json',
    prompts: { director: 'docs/DIRECTOR_GUIDE.md', craft: `styles/${sid}/craft.md` },
    lookControls: ['exposure'], craftFormula: 'default',
    qa: { frozenFrames: 12, popFactor: 3, popOffset: 1.0 }, cache: sid,
  };
  writeFileSync(join(dir, 'style.json'), JSON.stringify(style, null, 2) + '\n');
  writeFileSync(join(dir, 'adapter.mjs'), "// Port the skill's renderer here. Missing hooks fall back to the shared engine.\nexport const engine = 'not-ported';\n");
  writeFileSync(join(dir, 'craft.md'), `# ${skillName} craft card\n\nPorted from the skill; replace this with its visual rules (<= 3 KB).\n`);
  const summary = copied.length ? copied.slice(0, 30).map((f) => `- ${f}`).join('\n') : '- (none)';
  const porting = `# Porting ${skillName} -> \`${sid}\`\n\n## What the skill does\n${readmeSummary(incoming)}\n\n## What maps to the contract\n- text copied: \n${summary}\n\n## What is missing\n- the style adapter and renderer are not ported yet.\n\n## Porting tasks\n- read the skill and fill \`adapter.mjs\` / stage modules;\n- write the pack's catalog and prompt cards;\n- set the QA profile and sample frames;\n- run \`fableon style check ${sid}\` and fix every error.\n`;
  writeFileSync(join(dir, 'PORTING.md'), porting);
  return { id: sid, dir, incoming, copied: copied.length, licence };
}

function readmeSummary(dir) {
  for (const name of ['SKILL.md', 'README.md', 'readme.md']) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8').replace(/^---[\s\S]*?---/, '').replace(/[#*`]/g, '').trim();
    return text.split(/\n\s*\n/)[0].slice(0, 800) || '(empty)';
  }
  return '(no SKILL.md or README.md was found)';
}
