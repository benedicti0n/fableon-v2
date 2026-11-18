// Deterministic director allocator: the model supplies content, code supplies the statistical film grammar.
import { formulaBeat } from './stages/script.js';

const T = (anchor, words) => {
  const m = /^(\d+):(\d+)(?:([+-])(\d+(?:\.\d+)?)([fs]))?$/.exec(String(anchor ?? ''));
  if (!m) return null;
  const hits = words.filter((w) => w.line === Number(m[1]));
  const hit = hits[Number(m[2])];
  if (!hit) return null;
  const off = m[3] ? (m[5] === 's' ? Number(m[4]) : Number(m[4]) / 30) : 0;
  return hit.a + (m[3] === '-' ? -off : off);
};
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const marksFor = (catalog, set) => catalog.sets.find((s) => s.name === set)?.marks.map((m) => `${set}.${m.name}`) ?? [];

/** Fill scene ids, transitions, marks and shares; content (lines, who, what) stays the model's. */
export function allocatePlan(plan, { script, words, catalog, policy = {} }) {
  const shots = plan.shots ?? [];
  const total = words.length ? words[words.length - 1].b : 1;
  const flat = [];
  shots.forEach((s, i) => {
    const t0 = T(s.start, words) ?? 0;
    const t1 = i + 1 < shots.length ? T(shots[i + 1].start, words) ?? total : total;
    (s.keys ?? []).forEach((k, j) => flat.push({ s, i, k, j, t0, t1, t: T(k.at, words) ?? t0, dur: 0 }));
  });
  for (const x of flat) { const next = flat.find((y) => y.i === x.i && y.j === x.j + 1); x.dur = (next ? next.t : x.t1) - x.t; }

  // Scenes: one place + time; default to set-light.
  for (const s of shots) s.scene = s.scene ?? `${s.set}-${s.light ?? 'day'}`;
  const hook = script.lines.find((l) => formulaBeat(l.beat) === 'hook');
  const hookEnd = hook ? Math.max(...words.filter((w) => w.line === hook.n).map((w) => w.b), 0) : 0;
  shots.forEach((s, i) => {
    if (i === 0) return;
    s.transition = { type: 'crossfade', frames: 7 };
  });
  // A flash after the hook goes on the next scene boundary, so merging a scene into one continuous shot cannot drop it.
  const afterHook = shots.map((s, i) => ({ s, i, at: T(s.start, words) ?? 0 })).filter((x) => x.i > 0 && x.at >= hookEnd);
  const flashAt = afterHook.find((x) => x.s.scene !== shots[x.i - 1].scene) ?? afterHook[0];
  if (flashAt) flashAt.s.transition = { type: 'flash', frames: 4 };
  // At most two hard cuts; keep the two strongest same-scene boundaries if the model asked for cuts.
  const cutIdx = shots.map((s, i) => (s.transition?.type === 'cut' ? i : -1)).filter((i) => i > 0);
  for (const i of cutIdx.slice(2)) shots[i].transition = { type: 'crossfade', frames: 7 };

  // Low heights and foreground props: every third key, from the set's own marks.
  let keyIndex = 0;
  for (const s of shots) for (const k of s.keys ?? []) {
    if (['full', 'wide', 'establishing'].includes(k.size)) k.angle = k.angle ?? 'low';
    if (keyIndex % 3 === 0) {
      const marks = marksFor(catalog, s.set);
      if (marks.length) k.foreground = k.foreground ?? marks[keyIndex % marks.length];
    }
    keyIndex++;
  }

  // Foreground is a film-level share too: trim the longest optional foregrounds if the plan overfills it.
  const fgKeys = flat.filter((x) => x.k.foreground).sort((a, b) => b.dur - a.dur);
  let fgCount = fgKeys.length;
  const fgMax = Math.floor(flat.length * (policy.fgMax ?? 0.40));
  for (const x of fgKeys) { if (fgCount <= fgMax) break; delete x.k.foreground; fgCount--; }

  // Shares: make close/medium screen time 25-40% and push/hold 70-85%.
  const dof = () => flat.filter((x) => ['close', 'medium', 'insert'].includes(x.k.size)).reduce((n, x) => n + x.dur, 0) / total;
  const hold = () => flat.filter((x) => ['push', 'hold'].includes(x.k.move ?? 'push') && !x.k.ease).reduce((n, x) => n + x.dur, 0) / total;
  let guard = 0;
  while (dof() > (policy.dofMax ?? 0.36) && guard++ < 80) {
    const c = flat.filter((x) => ['close', 'medium'].includes(x.k.size)).sort((a, b) => b.dur - a.dur)[0];
    if (!c) break; c.k.size = 'full'; c.k.angle = 'low';
  }
  guard = 0;
  while (dof() < (policy.dofMin ?? 0.25) && guard++ < 80) {
    const c = flat.filter((x) => ['full', 'wide'].includes(x.k.size)).sort((a, b) => a.dur - b.dur)[0];
    if (!c) break; c.k.size = 'medium'; c.k.angle = 'eye';
  }
  guard = 0;
  while (hold() > (policy.holdMax ?? 0.82) && guard++ < 100) {
    const c = flat.filter((x) => ['push', 'hold'].includes(x.k.move ?? 'push') && !x.k.ease).sort((a, b) => b.dur - a.dur)[0];
    if (!c) break; c.k.move = 'glide'; c.k.ease = 'glide';
  }
  guard = 0;
  while (hold() < (policy.holdMin ?? 0.70) && guard++ < 100) {
    const c = flat.filter((x) => x.k.move === 'glide').sort((a, b) => b.dur - a.dur)[0];
    if (!c) break; c.k.move = 'push'; delete c.k.ease;
  }

  // A follow key needs a move path; give it the set's first two marks when the model omitted one.
  for (const s of shots) {
    for (const k of s.keys ?? []) {
      if (k.move !== 'follow') continue;
      const who = asArray(k.on)[0];
      if ((s.moves ?? []).some((m) => m.who === who)) continue;
      const marks = marksFor(catalog, s.set);
      if (marks.length > 1) {
        k.size = k.size === 'medium' ? 'wide' : k.size;
        s.moves = [...(s.moves ?? []), { who, from: marks[0], to: marks[1], at: k.at, until: `${(s.lines ?? [0]).at(-1)}:0`, gait: 'walk' }];
      }
    }
  }
  // Every hook/mystery/payoff line gets one punch.
  for (const line of script.lines.filter((l) => ['hook', 'mystery', 'payoff'].includes(formulaBeat(l.beat)))) {
    const covered = shots.filter((s) => (s.lines ?? []).includes(line.n));
    if (!covered.length) continue;
    const s = covered[0];
    const has = (s.keys ?? []).some((k) => k.punch && T(k.punch, words) >= (T(s.start, words) ?? 0));
    if (!has && s.keys?.[0]) s.keys[0].punch = `${line.n}:0`;
  }
  return {
    plan,
    stats: {
      shots: shots.length,
      holdShare: +hold().toFixed(3),
      dofShare: +dof().toFixed(3),
      foregroundShare: +(flat.length ? flat.filter((x) => x.k.foreground).length / flat.length : 0).toFixed(3),
      cuts: shots.filter((s) => s.transition?.type === 'cut').length,
      flashes: shots.filter((s) => s.transition?.type === 'flash').length,
      crossfades: shots.filter((s) => s.transition?.type === 'crossfade').length,
    },
  };
}
