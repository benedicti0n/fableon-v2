// Project files: MIME/range serving, editable allowlist, history and multipart sources.
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { atomicWrite, backupBeforeWrite, validationErrors } from '../../cli/src/core/artifacts.js';
import { isApprovedLocked } from '../../cli/src/core/state.js';
import { stageByName } from '../../cli/src/core/stages.js';
import { FableonError, ERROR_CODES } from '../../cli/src/core/errors.js';
import { inside, safeName } from './security.js';
import { markEdited } from './projects.js';

const MIME = {
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.srt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8', '.yml': 'text/yaml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.map': 'application/json; charset=utf-8',
};
const BLOCK = /(^|\/)(\.env|\.fableon|logs|node_modules|\.git)(\/|$)/;
const EDITABLE = new Set(['brief.md', 'script.json', 'pronunciations.json', 'shotplan.json', 'look.json', 'cues.json', 'cast.notes.json', 'shotplan.notes.json']);

export function contentType(p) { return MIME[String(p).slice(String(p).lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream'; }

export function rangeReply(req, reply, file) {
  const st = statSync(file);
  const type = contentType(file);
  const range = String(req.headers.range ?? '');
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m) {
    return reply.code(200).headers({ 'content-type': type, 'content-length': String(st.size), 'accept-ranges': 'bytes', 'cache-control': 'no-store' }).send(createReadStream(file));
  }
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null && end === null) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'bad range');
  if (start === null) { start = Math.max(0, st.size - end - 1); end = st.size - 1; }
  else if (end === null || end >= st.size) end = st.size - 1;
  if (start < 0 || start > end || start >= st.size) {
    return reply.code(416).headers({ 'content-range': `bytes */${st.size}` }).send();
  }
  return reply.code(206).headers({ 'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }).send(createReadStream(file, { start, end }));
}

export function filePath(ctx, rel) {
  if (BLOCK.test(String(rel))) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'path is not served');
  let p;
  try { p = inside(ctx.dir, rel); } catch (e) { if (e instanceof FableonError) throw e; throw new FableonError(ERROR_CODES.BAD_REQUEST, 'path traversal', { path: rel }); }
  if (!existsSync(p) || !statSync(p).isFile()) throw new FableonError(ERROR_CODES.NOT_FOUND, `file ${rel} was not found`, { path: rel });
  return p;
}

const stageFor = (rel) => rel === 'brief.md' ? 'brief' : rel === 'script.json' ? 'script' : rel === 'shotplan.json' ? 'shotplan' : rel === 'look.json' ? 'final' : rel === 'cues.json' ? 'sound' : null;
const schemaFor = (rel) => rel === 'script.json' ? 'script' : rel === 'pronunciations.json' ? 'pronunciations' : rel === 'shotplan.json' ? 'shotplan' : rel === 'look.json' ? 'look' : rel === 'cues.json' ? 'cues' : rel === 'cast.notes.json' ? 'cast-notes' : rel === 'shotplan.notes.json' ? 'shotplan-notes' : null;

export function putFile(ctx, rel, body) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  if (!EDITABLE.has(rel)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `${rel} is not editable through the API`, { path: rel });
  const stage = stageFor(rel);
  if (stage && isApprovedLocked(ctx.dir, ctx.project, stage)) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, `${stage} is approved and read-only`, { stage });
  let text;
  if (rel === 'brief.md') {
    if (typeof body !== 'string' && typeof body?.text !== 'string') throw new FableonError(ERROR_CODES.BAD_REQUEST, 'brief.md needs text');
    text = typeof body === 'string' ? body : body.text;
  } else {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const schema = schemaFor(rel);
    const errs = schema ? validationErrors(schema, data) : [];
    if (errs.length) throw new FableonError(ERROR_CODES.VALIDATION, `${schema} validation failed: ${errs.join('; ')}`, { schema, errors: errs });
    text = JSON.stringify(data, null, 2) + '\n';
  }
  backupBeforeWrite(ctx.dir, 'api', rel, text);
  atomicWrite(join(ctx.dir, rel), text);
  if (stage) markEdited(ctx, stage);
  return { path: rel, stage, status: stage ? 'edited' : 'stale' };
}

export function saveSource(ctx, filename, buffer) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  const name = safeName(filename);
  if (!/\.(md|txt|html?)$/i.test(name)) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'sources must be .md, .txt or .html', { filename: name });
  const rel = `research/sources/${name}`;
  atomicWrite(join(ctx.dir, rel), buffer);
  return { path: rel, filename: name, bytes: buffer.length };
}

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

export function history(ctx, rel = null) {
  const base = join(ctx.dir, '.fableon', 'history');
  const files = walk(base).sort().reverse();
  return files.map((f) => {
    const r = relative(base, f).split(sep).join('/');
    const [stage, stamp, ...rest] = r.split('/');
    return { stage, stamp, path: rest.join('/'), version: r, size: statSync(f).size, at: stamp };
  }).filter((x) => !rel || x.path === rel || x.path.endsWith(`/${rel}`));
}

export function restore(ctx, version) {
  if (ctx.readOnly) throw new FableonError(ERROR_CODES.APPROVED_LOCKED, 'fixtures are read-only', { project: ctx.id });
  const base = join(ctx.dir, '.fableon', 'history');
  const src = inside(base, version);
  if (!existsSync(src) || !statSync(src).isFile()) throw new FableonError(ERROR_CODES.NOT_FOUND, `history version ${version} was not found`);
  const [stage, stamp, ...rest] = version.split('/');
  const rel = rest.join('/');
  if (!EDITABLE.has(rel)) throw new FableonError(ERROR_CODES.BAD_REQUEST, `${rel} is not restorable through the API`, { path: rel });
  const next = readFileSync(src);
  backupBeforeWrite(ctx.dir, 'api-restore', rel, next);
  atomicWrite(join(ctx.dir, rel), next);
  const owner = stageFor(rel);
  if (owner) markEdited(ctx, owner);
  return { path: rel, from: version, stage: owner ?? stage };
}
