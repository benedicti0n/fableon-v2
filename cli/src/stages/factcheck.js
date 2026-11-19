// Fact-check stage: incremental per-line review, confirmed factual gate, advisory craft and human overrides.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, validationErrors, writeJsonArtifact } from '../core/artifacts.js';
import { FACTCHECK } from './prompts.js';

const factual = (l) => l && ['unsupported', 'distorted'].includes(l.verdict);

/** Hash of the line text/gloss and the claims/quotes of its cited facts. */
export function lineHash(line, factsById) {
  const cited = (line.facts ?? []).map((id) => {
    const f = factsById.get(id);
    return [id, f?.claim ?? '', (f?.sources ?? []).map((s) => [s.source, s.quote])];
  });
  return sha256(JSON.stringify({ text: line.text, gloss: line.gloss ?? '', cited }));
}

const overridden = (review, line) => (review.overrides ?? []).some((o) => o.line === line.n && (o.hash == null || o.hash === line.hash) && (!o.verdict || o.verdict === line.verdict));

export function blockingFailures(review, script, factsById) {
  const byN = new Map(review.lines.map((l) => [l.n, l]));
  return script.lines.filter((l) => {
    const r = byN.get(l.n);
    if (!factual(r) || !r.confirmed) return false;
    return !overridden(review, { ...r, n: l.n, hash: lineHash(l, factsById) });
  }).map((l) => byN.get(l.n));
}

export async function runFactcheck({ projectDir, project, router, progress = null }) {
  const script = JSON.parse(readFileSync(join(projectDir, 'script.json'), 'utf8'));
  const facts = JSON.parse(readFileSync(join(projectDir, 'research', 'facts.json'), 'utf8'));
  const verified = (facts.facts ?? []).filter((f) => f.verified);
  const factsById = new Map((facts.facts ?? []).map((f) => [f.id, f]));
  const reviewPath = join(projectDir, 'script.review.json');
  const previous = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : null;
  const prevByN = new Map((previous?.lines ?? []).map((l) => [l.n, l]));
  const lines = script.lines.map((l) => ({ ...l, hash: lineHash(l, factsById) }));
  const changed = lines.filter((l) => !prevByN.get(l.n) || prevByN.get(l.n).hash !== l.hash);
  const c = router.config('factcheck');
  const model = router.modelName('factcheck');
  const settings = { temperature: 0, thinking: c.thinking ?? null, reasoningEffort: c.reasoningEffort ?? null, jsonMode: true };
  let review = previous ?? { version: 1, lines: [], overrides: [] };
  let reviewed = 0;

  if (changed.length) {
    const ids = changed.map((l) => l.n);
    const ask = async (reviewLines) => {
      const { data } = await router.callJson('factcheck', [
        { role: 'system', content: FACTCHECK },
        { role: 'user', content: `DATA:\n<script>\n${JSON.stringify(script.lines, null, 2)}\n</script>\n<verified_facts>\n${verified.map((f) => `${f.id}: ${f.claim}`).join('\n')}\n</verified_facts>\nReview only these line numbers: ${reviewLines.join(', ')}. The full script is context; return one verdict for each listed line only, json only.` },
      ], {
        temperature: 0,
        validate: (d) => {
          const errs = validationErrors('review', d);
          if (errs.length) return errs;
          const ns = new Set(d.lines.map((l) => l.n));
          if (ns.size !== d.lines.length) errs.push('/lines has duplicate n values');
          for (const n of reviewLines) if (!ns.has(n)) errs.push(`review is missing line ${n}`);
          for (const n of ns) if (!reviewLines.includes(n)) errs.push(`review includes unrequested line ${n}`);
          if (project.language === 'hi' && d.lines.some((l) => !l.craft)) errs.push('every reviewed Hindi line needs a craft verdict (ok|weak)');
          return errs;
        },
      });
      reviewed += data.lines.length;
      return data.lines;
    };

    progress?.({ step: 'factcheck:first', done: 0, total: 2 });
    const first = await ask(ids);
    progress?.({ step: 'factcheck:first', done: 1, total: 2 });
    const byN = new Map(review.lines.map((l) => [l.n, l]));
    for (const l of first) byN.set(l.n, { ...l, hash: lines.find((x) => x.n === l.n).hash, confirmed: false });
    review = { ...review, model, settings, reviewedAt: new Date().toISOString(), lines: [...byN.values()].sort((a, b) => a.n - b.n) };

    const flags = review.lines.filter((l) => factual(l) && !l.confirmed);
    if (flags.length) {
      progress?.({ step: 'factcheck:confirm', done: 1, total: 2 });
      const second = await ask(flags.map((l) => l.n));
      progress?.({ step: 'factcheck:confirm', done: 2, total: 2 });
      const sByN = new Map(review.lines.map((l) => [l.n, l]));
      for (const l of second) {
        const old = sByN.get(l.n);
        const still = factual(l);
        sByN.set(l.n, { ...old, ...l, craft: l.craft ?? old.craft, hash: old.hash, confirmed: still });
        if (still) sByN.get(l.n).note = l.note;
      }
      review.lines = [...sByN.values()].sort((a, b) => a.n - b.n);
    }
    for (const l of review.lines) if (factual(l) && l.confirmed === undefined) l.confirmed = false;
    review.lines = review.lines.map((l) => ({ ...l, hash: lines.find((x) => x.n === l.n)?.hash ?? l.hash }));
    writeJsonArtifact(projectDir, 'factcheck', 'script.review.json', review, 'review');
  }

  const failures = blockingFailures(review, script, factsById);
  const craft = review.lines.filter((l) => l.craft === 'weak').map((l) => ({ n: l.n, note: l.note }));
  return { usage: router.stageUsage('factcheck'), failures, review, reviewed, craft };
}

/** Human override: accept the currently flagged factual lines; called only by `fableon approve --override`. */
export function recordFactcheckOverride(projectDir, reason) {
  const reviewPath = join(projectDir, 'script.review.json');
  if (!existsSync(reviewPath)) throw new Error('factcheck has no script.review.json to override');
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
  const flags = review.lines.filter((l) => factual(l));
  if (!flags.length) throw new Error('factcheck has no factual flags to override');
  review.overrides = review.overrides ?? [];
  for (const l of flags) review.overrides.push({ line: l.n, verdict: l.verdict, reason, ts: new Date().toISOString(), hash: l.hash ?? null });
  writeJsonArtifact(projectDir, 'factcheck', 'script.review.json', review, 'review');
  return { count: flags.length, lines: flags.map((l) => l.n) };
}
