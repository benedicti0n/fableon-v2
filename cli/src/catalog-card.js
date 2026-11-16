// Compact plain-text catalog card for director-model prompts (< 12 KB).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.js';

export function buildCatalogCard() {
  const c = JSON.parse(readFileSync(join(ROOT, 'schema', 'catalog.json'), 'utf8'));
  const v1 = JSON.parse(readFileSync(join(ROOT, 'schema', 'storyboard.schema.json'), 'utf8'));
  const params = (special) => {
    const key = special[0].toUpperCase() + special.slice(1) + 'Params';
    const d = v1.$defs[key];
    return d?.properties ? Object.keys(d.properties).join('|') : '';
  };
  const effectParams = (kind) => {
    const e = v1.$defs.Effect.oneOf.find((x) => x.properties?.kind?.const === kind);
    return e ? Object.keys(e.properties).filter((k) => !['kind', 'at', 'pos', 'id', 'motion'].includes(k)).join('|') : '';
  };
  const lines = ['FABLEON CATALOG', '', 'SETS'];
  for (const s of c.sets) {
    lines.push(`${s.name} front=${s.front} bounds=${s.bounds.min.join(',')}..${s.bounds.max.join(',')}`);
    lines.push(`  marks: ${s.marks.map((m) => `${m.name}@${m.pos.join(',')} — ${m.description}`).join('; ')}`);
  }
  lines.push('', 'POSES', c.poses.map((p) => p.name).join(', '));
  lines.push('', 'EXPRESSIONS', c.expressions.map((p) => p.name).join(', '));
  lines.push('', 'PROPS', c.props.map((p) => p.name).join(', '));
  lines.push('', 'SPECIALS');
  for (const s of c.specials) lines.push(`${s.name} params: ${params(s.name) || '-'} — ${s.description}`);
  lines.push('', 'EFFECTS');
  for (const e of c.effects) lines.push(`${e.name} params: ${effectParams(e.name) || '-'} — ${e.description}`);
  lines.push('', 'SET PIECES', c.setPieces.map((p) => `${p.name}: ${p.description}`).join('; '));
  lines.push('', 'MEASURE (metres at scale 1)');
  for (const [k, m] of Object.entries(c.measure ?? {})) lines.push(`${k}: stand=${m.standing.toFixed(2)} seat=${m.seated.toFixed(2)} eye=${m.eye.toFixed(2)} head=${m.head.toFixed(2)} half=${m.halfWidth.toFixed(2)}`);
  return { text: lines.join('\n') + '\n', bytes: Buffer.byteLength(lines.join('\n') + '\n') };
}

export function catalogCardCommand(outArg) {
  const { text, bytes } = buildCatalogCard();
  if (outArg) { writeFileSync(outArg, text); console.log(`catalog-card: ${outArg} (${bytes} bytes)`); }
  else { process.stdout.write(text); console.error(`catalog-card: ${bytes} bytes`); }
  return { text, bytes };
}
