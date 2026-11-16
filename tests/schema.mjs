// Strict per-project schema and compact catalog card.
import Ajv2020 from 'ajv/dist/2020.js';
import { buildCatalogCard } from '../cli/src/catalog-card.js';
import { specializeSchema } from '../cli/src/schema.js';

export function runSchemaTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const { schema, board } = specializeSchema('fixtures/adi-parva-authoring');
  const open = [];
  const maps = new Set(['/properties/cast', '/properties/points', '/properties/groups']);
  const walk = (x, path = '') => {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'object' && !maps.has(path) && x.additionalProperties !== false) open.push(path || '/');
    for (const [k, v] of Object.entries(x)) walk(v, `${path}/${k}`);
  };
  walk(schema);
  ok('no open object schemas', open.length === 0, open.slice(0, 5).join(', '));
  ok('raw closed for board', schema.$defs.Raw === false);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  let valid = false, detail = '';
  try { const v = ajv.compile(schema); valid = !!v(board); if (!valid) detail = JSON.stringify((v.errors ?? []).slice(0, 3)); } catch (e) { detail = e.message; }
  ok('schema validates board', valid, detail);
  const card = buildCatalogCard();
  ok('catalog card < 12KB', card.bytes < 12 * 1024, `${card.bytes} bytes`);
  ok('catalog card sections', card.text.includes('SETS') && card.text.includes('SPECIALS') && card.text.includes('MEASURE'));
  return { ok: errors.length === 0, errors, checks };
}
