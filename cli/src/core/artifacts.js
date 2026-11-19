// Atomic, validated project artifacts. The library never writes without a schema where one exists.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT } from '../env.js';
import { validationError } from './errors.js';

const validators = new Map();
export const schemaPath = (name) => join(ROOT, 'schema', `${name}.schema.json`);
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const nowIso = () => new Date().toISOString();

export function readText(p) { return readFileSync(p, 'utf8'); }
export function readJson(p, schema = null) {
  const data = JSON.parse(readFileSync(p, 'utf8'));
  if (schema) validate(schema, data);
  return data;
}
export function validationErrors(schema, data) {
  try { validate(schema, data); return []; }
  catch (e) { return (e.validation ?? []).map((x) => `${x.instancePath || '/'} ${x.message}`); }
}
export function validate(schema, data) {
  let v = validators.get(schema);
  if (!v) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    v = ajv.compile(JSON.parse(readFileSync(schemaPath(schema), 'utf8')));
    validators.set(schema, v);
  }
  if (!v(data)) {
    throw validationError(schema, v.errors);
  }
  return data;
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

export function historyPath(projectDir, stage, rel) {
  const base = join(projectDir, '.fableon', 'history', stage, `${stamp()}-${randomBytes(3).toString('hex')}`);
  return join(base, rel);
}

/** Copy an existing output to history when a stage replaces it with different content. */
export function backupBeforeWrite(projectDir, stage, rel, nextContent) {
  const p = join(projectDir, rel);
  if (!existsSync(p)) return;
  const old = readFileSync(p);
  if (old.equals(Buffer.from(nextContent))) return;
  const dest = historyPath(projectDir, stage, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(p, dest);
}

export function atomicWrite(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try { writeFileSync(tmp, content); renameSync(tmp, p); }
  finally { if (existsSync(tmp)) rmSync(tmp, { force: true }); }
}

export function writeTextArtifact(projectDir, stage, rel, text) {
  backupBeforeWrite(projectDir, stage, rel, text);
  atomicWrite(join(projectDir, rel), text);
  return sha256(text);
}

export function writeJsonArtifact(projectDir, stage, rel, data, schema = null) {
  if (schema) validate(schema, data);
  const text = JSON.stringify(data, null, 2) + '\n';
  backupBeforeWrite(projectDir, stage, rel, text);
  atomicWrite(join(projectDir, rel), text);
  return sha256(text);
}

const memo = new Map();
/** Raw-byte file hash memoised by (path, size, mtimeMs); binary files must never be decoded as text. */
export function fileHash(p) {
  if (!existsSync(p)) return null;
  let st;
  try { st = statSync(p); } catch { return null; }
  const key = `${p}\0${st.size}\0${st.mtimeMs}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const h = sha256(readFileSync(p));
  if (memo.size > 5000) memo.clear();
  memo.set(key, h);
  return h;
}
export function clearFileHashMemo() { memo.clear(); }
export function outputHash(projectDir, outputs) {
  const h = createHash('sha256');
  for (const rel of outputs) {
    const p = join(projectDir, rel);
    h.update(rel); h.update('\0');
    if (existsSync(p)) h.update(readFileSync(p)); else h.update('\0missing\0');
  }
  return h.digest('hex');
}
export function hashFiles(files) {
  const h = createHash('sha256');
  for (const p of files) { h.update(p); h.update('\0'); h.update(existsSync(p) ? readFileSync(p) : '\0missing\0'); }
  return h.digest('hex');
}
export function stable(value) { return JSON.stringify(value, Object.keys(value ?? {}).sort()); }
export function requireProjectFile(projectDir, rel) {
  const p = join(projectDir, rel);
  if (!existsSync(p)) throw new Error(`${rel} is missing in ${projectDir}`);
  return p;
}
export function projectRel(projectDir, p) { return relative(resolve(projectDir), resolve(p)); }
