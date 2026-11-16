// Per-project authoring schema specialization: fixed enums for this board's words, cast, sets and marks.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.js';
import { projectDir, requireFile } from './project.js';

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

export function specializeSchema(dirArg) {
  const dir = projectDir(dirArg);
  const board = readJSON(requireFile(dir, 'board.json'));
  const words = readJSON(requireFile(dir, 'words.json'));
  const catalog = readJSON(join(ROOT, 'schema', 'catalog.json'));
  const schema = clone(readJSON(join(ROOT, 'schema', 'authoring.schema.json')));
  const lines = [...new Set(words.map((w) => w.line))].sort((a, b) => a - b);
  const cast = Object.entries(board.cast ?? {}).filter(([, v]) => !v.group).map(([k]) => k);
  const groups = [...Object.keys(board.groups ?? {}), ...Object.entries(board.cast ?? {}).filter(([, v]) => v.group).map(([k]) => k)];
  const marks = catalog.sets.flatMap((s) => s.marks.map((m) => `${s.name}.${m.name}`));
  const effects = (board.shots ?? []).flatMap((s) => (s.fx ?? []).map((e) => e.kind)).filter(Boolean);
  const effectIds = (board.shots ?? []).flatMap((s) => (s.fx ?? []).map((e) => e.id)).filter(Boolean);
  const subjects = [...new Set([...cast, ...marks, ...effectIds])];
  const anchor = schema.$defs.Anchor.oneOf[0];
  anchor.pattern = `^(?:(?:${lines.join('|')})\\.[A-Za-z']+(?:#[0-9]+)?(?:[+-][0-9]+(?:\\.[0-9]+)?[fs])?|shot(?:[+-][0-9]+(?:\\.[0-9]+)?[fs])?|end(?:[+-][0-9]+(?:\\.[0-9]+)?[fs])?|f[0-9]+)$`;
  schema.$defs.Anchor.oneOf[1].properties.line.enum = lines;
  schema.$defs.Actor.properties.cast.enum = cast;
  schema.$defs.Actor.properties.special.enum = catalog.specials.map((e) => e.name);
  schema.$defs.Actor.properties.pose.enum = catalog.poses.map((e) => e.name);
  schema.$defs.Actor.properties.expr.enum = catalog.expressions.map((e) => e.name);
  schema.$defs.Actor.properties.prop.oneOf[0].enum = catalog.props.map((e) => e.name);
  const doProps = schema.$defs.Actor.properties.do.items.prefixItems[1].properties;
  if (doProps.pose) doProps.pose.enum = catalog.poses.map((e) => e.name);
  if (doProps.expr) doProps.expr.enum = catalog.expressions.map((e) => e.name);
  schema.$defs.Row.properties.pose.enum = catalog.poses.map((e) => e.name);
  schema.$defs.Row.properties.expr.enum = catalog.expressions.map((e) => e.name);
  schema.$defs.Row.properties.row.items.enum = [...cast, ...groups];
  schema.$defs.Shot.properties.light.enum = catalog.lights.map((e) => e.name);
  schema.$defs.Shot.properties.sets.items.enum = catalog.sets.map((e) => e.name);
  schema.$defs.Point.oneOf[1].enum = marks;
  const cam = schema.$defs.Camera.oneOf[0].properties;
  cam.on.oneOf[0].enum = subjects;
  cam.on.oneOf[1].items.enum = subjects;
  cam.over.enum = subjects; cam.to.enum = subjects; cam.later.items.enum = cast;
  schema.$defs.Effect.oneOf = schema.$defs.Effect.oneOf.filter((e) => {
    const k = e.properties?.kind?.const; return !k || catalog.effects.some((x) => x.name === k && x.status === 'implemented');
  });
  schema.$defs.SetAction.oneOf = schema.$defs.SetAction.oneOf.filter((e) => {
    const k = e.properties?.piece?.const; return !k || catalog.setPieces.some((x) => x.name === k && x.status === 'implemented');
  });
  const hasRaw = JSON.stringify(board).includes('"raw"');
  if (!hasRaw) schema.$defs.Raw = false;
  return { schema, board, words, catalog };
}

export function schemaCommand(dirArg, outArg) {
  const { schema, board } = specializeSchema(dirArg);
  const out = outArg ? projectDir(join(process.cwd(), outArg)) : join(projectDir(dirArg), 'schema.json');
  writeFileSync(out, JSON.stringify(schema, null, 2) + '\n');
  const size = readFileSync(out).length;
  console.log(`schema: ${out} (${size} bytes, ${(board.shots ?? []).length} shots)`);
  return { out, size };
}
