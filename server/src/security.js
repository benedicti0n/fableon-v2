// Local-server security: per-launch bearer token, HttpOnly cookie, Host/Origin checks and root confinement.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve, sep, isAbsolute } from 'node:path';

export const newToken = () => randomBytes(24).toString('base64url');
export const TOKEN_COOKIE = 'fableon_token';

const same = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function cookieValue(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export function bearerToken(req) {
  const h = String(req.headers.authorization ?? '');
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  const x = req.headers['x-fableon-token'];
  if (typeof x === 'string') return x;
  return '';
}

export function installAuth(app, { token, port }) {
  const state = { port };
  app.fableonAuthPort = (p) => { state.port = Number(p); };
  const allowedHosts = () => new Set([`127.0.0.1:${state.port}`, `localhost:${state.port}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${state.port}`, `http://localhost:${state.port}`]);
  app.addHook('onRequest', async (req, reply) => {
    const host = String(req.headers.host ?? '');
    if (!allowedHosts().has(host)) return reply.code(403).send({ error: 'forbidden host', code: 'BAD_REQUEST' });
    const origin = req.headers.origin;
    if (origin && !allowedOrigins().has(String(origin))) return reply.code(403).send({ error: 'forbidden origin', code: 'BAD_REQUEST' });
    const url = new URL(req.url, `http://${host}`);
    const query = url.searchParams.get('token') ?? '';
    const cookie = cookieValue(req.headers.cookie, TOKEN_COOKIE);
    const provided = bearerToken(req) || query || cookie;
    if (!same(provided, token)) {
      // First visit with the startup token sets the HttpOnly cookie and redirects to the clean URL.
      if (query && same(query, token) && req.method === 'GET' && url.pathname === '/') {
        reply.header('set-cookie', `${TOKEN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        return reply.code(302).header('location', '/').send();
      }
      return reply.code(401).send({ error: 'unauthorized', code: 'UNAUTHORIZED' });
    }
    if (query && req.method === 'GET' && url.pathname === '/') {
      reply.header('set-cookie', `${TOKEN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
      return reply.code(302).header('location', '/').send();
    }
    return undefined;
  });
}

/** Resolve a URL path inside a root; throws a 400-class signal instead of allowing traversal. */
export function inside(root, rel) {
  const base = resolve(root);
  const clean = String(rel ?? '').replace(/\\/g, '/');
  if (isAbsolute(clean) || clean.split('/').some((p) => p === '..') || clean.includes('\0')) throw new Error('path traversal');
  const p = resolve(base, `.${clean.startsWith('/') ? clean : `/${clean}`}`);
  if (p !== base && !p.startsWith(base + sep)) throw new Error('path traversal');
  return p;
}

export function safeName(name) {
  const n = String(name ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  if (!/^[a-zA-Z0-9._ -]{1,120}$/.test(n) || n.startsWith('.')) throw new Error('bad filename');
  return n;
}
