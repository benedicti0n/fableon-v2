// `fableon style`: list, check and import style packs.
import { checkStyle, importStyle, listStyles, readStyle } from './styles.js';

export function styleListCommand({ json = false } = {}) {
  const styles = listStyles();
  if (json) return styles;
  for (const s of styles) console.log(`${s.status === 'ready' ? 'ready ' : '      '} ${s.id.padEnd(14)} ${s.name}`);
  return styles;
}

export async function styleCheckCommand(id, { render = true } = {}) {
  const r = await checkStyle(id, { render });
  console.log(`style ${id}: ${r.ok ? 'PASS' : 'FAIL'}${render ? '' : ' (contract only)'}`);
  for (const e of r.errors) console.log(`  - ${e}`);
  if (r.ok) {
    const s = readStyle(id);
    console.log(`  ${s.name}; adapter ${s.adapter}; catalog ${s.catalog}; qa frozen ${s.qa.frozenFrames}f, pop ${s.qa.popFactor}x`);
  }
  return r;
}

export function styleImportCommand(opts) {
  const r = importStyle(opts);
  console.log(`style import: ${r.id} -> ${r.dir}`);
  console.log(`  copied ${r.copied} text file(s) from ${r.incoming}`);
  console.log(`  licence: ${r.licence}`);
  console.log(`  next: read styles/${r.id}/PORTING.md, port the adapter, then run: fableon style check ${r.id}`);
  return r;
}
