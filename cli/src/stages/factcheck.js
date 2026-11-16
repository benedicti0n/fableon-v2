// Fact-check stage: one verdict per script line, then a gate for unsupported/distorted lines.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validationErrors, writeJsonArtifact } from '../core/artifacts.js';
import { FACTCHECK } from './prompts.js';

export async function runFactcheck({ projectDir, project, router }) {
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(projectDir, 'research', 'facts.json'), 'utf8'));
  const verified = (facts.facts ?? []).filter((f) => f.verified);
  const { data, usage } = await router.callJson('factcheck', [
    { role: 'system', content: FACTCHECK },
    { role: 'user', content: `DATA:\n<script>\n${JSON.stringify(script.lines, null, 2)}\n</script>\n<verified_facts>\n${verified.map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nReturn exactly one verdict for every line n, json only.` },
  ], {
    validate: (d) => {
      const errs = validationErrors('review', d);
      if (errs.length) return errs;
      if (d.lines.length !== script.lines.length) errs.push(`review has ${d.lines.length} lines, script has ${script.lines.length}`);
      const ns = new Set(d.lines.map((l) => l.n));
      for (const l of script.lines) if (!ns.has(l.n)) errs.push(`review is missing line ${l.n}`);
      return errs;
    },
  });
  writeJsonArtifact(projectDir, 'factcheck', 'script.review.json', data, 'review');
  const failures = data.lines.filter((l) => l.verdict === 'unsupported' || l.verdict === 'distorted');
  return { usage, failures, review: data };
}
