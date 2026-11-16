// Storyboard parity: for every non-legacy fixture shot, render the same frames in legacy mode (compiled story.ts) and
// storyboard mode at 540x960 and compare full-resolution grayscale. Threshold: mean absolute difference <= 0.5.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RENDER_CJS, ROOT, capture, findPython, run } from '../cli/src/env.js';

const FIX = join(ROOT, 'fixtures', 'adi-parva');
const LIMIT = 0.5;
// Architect-approved D3 exemption: legacy story.ts freezes the contest wheel to whatever the previous rendered
// frame left there, so its output depends on render order. Deterministic storyboard frames are exempt only while the
// wheel is frozen (L28 from A(28,"mark")+2 = 2784 onward) and on the L28/L29 crossfade (2793..2803).
const D3_REASON = 'legacy wheel freeze depends on render order (architect-approved, Phase 2B)';
const D3_WHEEL = new Set();
for (let f = 2784; f <= 2803; f++) D3_WHEEL.add(f);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z']/g, '');

export function framePlan(storyboard, words) {
  const fps = storyboard.fps ?? 30;
  const END = Math.round(words[words.length - 1].b * fps);
  const TOTAL = END + (storyboard.tailFrames ?? 36);
  const A = (line, word, nth = 0) => {
    const hits = words.filter((w) => w.line === line && norm(w.w) === norm(word));
    if (!hits[nth]) throw new Error(`parity: no word ${line}:${word}`);
    return Math.max(0, Math.round(hits[nth].a * fps));
  };
  const at = (a, shotStart = 0) => ("shot" in a ? shotStart + (a.offset ?? 0) : "frame" in a ? a.frame + (a.offset ?? 0) : "end" in a ? END + (a.offset ?? 0) : A(a.line, a.word, a.nth ?? 0) + (a.offset ?? 0));
  const shots = [...storyboard.shots].map((s) => ({ s, a: at(s.start) })).sort((x, y) => x.a - y.a);
  const plan = [];
  shots.forEach(({ s, a }, i) => {
    if (s.legacy) return;
    const b = i + 1 < shots.length ? shots[i + 1].a : TOTAL;
    const base = [a, a + 1, Math.floor((a + b) / 2), b - 1].filter((f) => f >= a && f < b);
    const anchors = [a];
    for (const k of s.camera ?? []) { anchors.push(at(k.at, a)); if (k.push) { anchors.push(at(k.push.from, a)); if (k.push.punchAt) anchors.push(at(k.push.punchAt, a)); } }
    for (const d of s.dof ?? []) anchors.push(at(d.at, a));
    for (const x of s.actors ?? []) {
      for (const bt of x.beats ?? []) anchors.push(at(bt.at, a));
      if (x.appear) anchors.push(at(x.appear.at, a));
      if (x.visible) { anchors.push(at(x.visible.from, a)); anchors.push(at(x.visible.to, a)); }
    }
    for (const e of s.fx ?? []) anchors.push(at(e.at, a));
    for (const x of s.set ?? []) if (x.height && typeof x.height === "object") for (const [kf] of x.height.keys) anchors.push(at(kf, a));
    const frames = [...base];
    for (const f of [...new Set(anchors)].sort((x, y) => x - y)) {
      for (const q of [f, f + 1]) if (q >= a && q < b && !frames.includes(q)) frames.push(q);
      if (frames.length >= 12) break;
    }
    plan.push({ id: s.id, a, b, frames: frames.sort((x, y) => x - y) });
  });
  return plan;
}

export async function runParity() {
  console.log('\n== storyboard parity ==');
  const py = findPython();
  if (!py) throw new Error('no Python found');
  const sb = JSON.parse(readFileSync(join(FIX, 'storyboard.json'), 'utf8'));
  const words = JSON.parse(readFileSync(join(FIX, 'words.json'), 'utf8'));
  const plan = framePlan(sb, words);
  const frames = [...new Set(plan.flatMap((p) => p.frames))].sort((a, b) => a - b);
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-parity-'));
  const legacy = join(tmp, 'legacy'), story = join(tmp, 'story');
  try {
    for (const d of [legacy, story]) mkdirSync(d, { recursive: true });
    for (const d of [legacy, story]) copyFileSync(join(FIX, 'words.json'), join(d, 'words.json'));
    copyFileSync(join(FIX, 'storyboard.json'), join(story, 'storyboard.json'));

    const args = (d) => [RENDER_CJS, 'stills', '--out', join(d, 'f_'), '--frames', frames.join(','), '--project', d, '--size', '540x960', '--msaa', '0'];
    await run(process.execPath, args(legacy), { cwd: ROOT });
    await run(process.execPath, args(story), { cwd: ROOT });
    const res = JSON.parse(capture(py, [join(ROOT, 'tests', 'compare_full.py'), legacy, story, frames.join(',')]));
    const mad = new Map(res.map((r) => [r.frame, r.mad]));
    console.log('  shot    frames  max MAD');
    let worst = 0;
    const bad = [];
    let exemptCount = 0;
    for (const p of plan) {
      const counted = p.frames.filter((f) => !D3_WHEEL.has(f));
      exemptCount += p.frames.length - counted.length;
      const max = counted.length ? Math.max(...counted.map((f) => mad.get(f) ?? Infinity)) : 0;
      worst = Math.max(worst, max);
      console.log(`  ${p.id.padEnd(6)}  ${String(p.frames.length).padStart(6)}  ${max.toFixed(3)}${counted.length < p.frames.length ? '  (D3 wheel exemption)' : ''}`);
      if (max > LIMIT) { bad.push(`${p.id} (${max.toFixed(3)})`); console.log(`    frames ${counted.map((f) => `${f}:${(mad.get(f) ?? 0).toFixed(2)}`).join(' ')}`); }
    }
    if (exemptCount) console.log(`  ${exemptCount} frame(s) exempt: ${D3_REASON}`);
    const ok = bad.length === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'} storyboard parity: ${frames.length} frames, max MAD ${worst.toFixed(3)} (limit ${LIMIT})${bad.length ? `; over: ${bad.join(', ')}` : ''}`);
    return { ok, frames: frames.length, worst, bad };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
