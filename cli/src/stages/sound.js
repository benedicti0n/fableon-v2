// Sound stage: model music/stingers + deterministic board SFX -> cues.json, then the cues mix and stems.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findPython, ROOT, run } from '../env.js';
import { validationErrors, writeJsonArtifact, writeTextArtifact } from '../core/artifacts.js';
import { SOUND } from './prompts.js';
import { planTime } from './shotplan.js';

const FPS = 30;
const MIN_GAP = 1.2;
const ANCHOR = /^(?:[0-9]+:[0-9]+|f[0-9]+)$/;
const KIND_PRIORITY = { thud: 6, flashHit: 5, arrow: 4, steps: 3, poof: 2, pop: 2, whoosh: 1, shimmer: 1 };
const FX_MAP = { puff: 'poof', sparkle: 'shimmer', stars: 'shimmer', burst: 'whoosh', arrow: 'arrow' };

const anchorOf = (a) => {
  if (typeof a === 'string') return ANCHOR.test(a) ? a : null;
  if (!a || typeof a !== 'object') return null;
  if (a.frame !== undefined) return `f${a.frame}`;
  if (a.line !== undefined && a.wordIndex !== undefined) return `${a.line}:${a.wordIndex}`;
  if (a.line !== undefined && typeof a.word === 'number') return `${a.line}:${a.word}`;
  return null;
};
const cueSeconds = (at, words) => {
  if (at.startsWith('f')) return Number(at.slice(1)) / FPS;
  try { return planTime(at, words); } catch { return null; }
};
const lineWindow = (line, words) => {
  const ws = words.filter((w) => w.line === line);
  return ws.length ? [Math.min(...ws.map((w) => w.a)), Math.max(...ws.map((w) => w.b))] : null;
};

/** Deterministic map from board events to SFX; no model involved. */
export function defaultSfx(board, { words, punchTimes = [] }) {
  const out = [];
  const add = (kind, at, note) => { const a = anchorOf(at); if (a) out.push({ kind, at: a, note }); };
  for (const shot of board.shots ?? []) {
    if (shot.transition?.type === 'flash') add('flashHit', shot.start, 'transition flash');
    for (const f of shot.fx ?? []) if (FX_MAP[f.kind]) add(FX_MAP[f.kind], f.at, `fx ${f.kind}`);
    for (const a of shot.actors ?? []) {
      if (a.appear) add('pop', typeof a.appear === 'object' ? a.appear.at : a.appear, 'appear');
      if (a.motion?.type === 'path' && a.motion.walk) add('steps', a.motion.keys?.[0]?.[0] ?? shot.start, 'walk');
    }
    for (const k of shot.camera ?? []) {
      if (k.ease === 'burst' || k.move === 'glide') add('whoosh', k.at, `${k.ease ?? k.move} move`);
    }
  }
  for (const k of board.kicks ?? []) add('thud', k.at, 'impact kick');
  // One cue per 1.2 s; keep the most physical event when two land together.
  const timed = out.map((c) => ({ ...c, t: cueSeconds(c.at, words) })).filter((c) => c.t !== null);
  timed.sort((a, b) => a.t - b.t || (KIND_PRIORITY[b.kind] ?? 0) - (KIND_PRIORITY[a.kind] ?? 0));
  const kept = [];
  for (const c of timed) {
    if (kept.length && c.t - kept[kept.length - 1].t < MIN_GAP) continue;
    const punch = punchTimes.find((p) => c.t >= p && c.t < p + 0.2);
    if (punch && c.kind !== 'thud') continue;
    kept.push(c);
  }
  return kept.map(({ t, ...c }) => c);
}

export function validateCues(d, { scenes, words, punchTimes, script }) {
  const errs = validationErrors('cues', d);
  if (errs.length) return errs;
  const musicScenes = (d.music ?? []).map((m) => m.scene);
  for (const s of scenes) if (!musicScenes.includes(s)) errs.push(`/music is missing scene "${s}"`);
  for (const s of musicScenes) if (!scenes.includes(s)) errs.push(`/music scene "${s}" is not in the shot plan`);
  if (new Set(musicScenes).size !== musicScenes.length) errs.push('/music repeats a scene');
  const kinds = new Set((d.stingers ?? []).map((s) => s.kind));
  for (const k of ['hook', 'mystery', 'payoff']) if (!kinds.has(k)) errs.push(`/stingers is missing the ${k} stinger`);
  for (const s of d.stingers ?? []) {
    if (!ANCHOR.test(s.at)) { errs.push(`/stingers/${s.kind}/at is not a valid anchor`); continue; }
    const candidates = script.lines.filter((l) => l.beat === s.kind);
    if (!candidates.length) { errs.push(`/stingers/${s.kind}: script has no ${s.kind} line`); continue; }
    const t = cueSeconds(s.at, words);
    const ok = candidates.some((line) => { const w = lineWindow(line.n, words); return w && t !== null && t >= w[0] - 0.01 && t <= w[1] + 0.01; });
    if (!ok) errs.push(`/stingers/${s.kind}/at must fall on a ${s.kind} line`);
  }
  const timed = (d.sfx ?? []).map((s) => ({ ...s, t: cueSeconds(s.at, words) }));
  for (const s of timed) if (s.t === null) errs.push(`/sfx ${s.kind} has an unknown anchor ${s.at}`);
  timed.sort((a, b) => a.t - b.t);
  for (let i = 1; i < timed.length; i++) if (timed[i].t - timed[i - 1].t < MIN_GAP - 0.001) errs.push(`/sfx ${timed[i].kind} at ${timed[i].at} is within ${MIN_GAP} s of ${timed[i - 1].kind}`);
  for (const s of timed) {
    const p = punchTimes.find((t) => s.t >= t && s.t < t + 0.2);
    if (p !== undefined && s.kind !== 'thud') errs.push(`/sfx ${s.kind} at ${s.at} starts inside a punch's first 0.2 s; only the impact thud may`);
  }
  return errs;
}

export async function runSound({ projectDir, project, router }) {
  const dir = resolve(projectDir);
  const script = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'));
  const shotplan = JSON.parse(readFileSync(join(dir, 'shotplan.json'), 'utf8'));
  const board = JSON.parse(readFileSync(join(dir, 'board.json'), 'utf8'));
  const words = JSON.parse(readFileSync(join(dir, 'words.json'), 'utf8'));
  const storyboard = JSON.parse(readFileSync(join(dir, 'storyboard.json'), 'utf8'));
  const scenes = [...new Set((shotplan.shots ?? []).map((s) => s.scene).filter(Boolean))];
  if (!scenes.length) throw new Error('sound needs scene ids in the shot plan');
  const punches = (shotplan.shots ?? []).flatMap((s) => (s.keys ?? []).map((k) => k.punch).filter(Boolean)).map((a) => cueSeconds(a, words)).filter((t) => t !== null);
  const defaults = defaultSfx(board, { words, punchTimes: punches });
  const duration = +(words[words.length - 1].b + (storyboard.tailFrames ?? 36) / FPS).toFixed(3);
  const sceneData = scenes.map((id) => {
    const shots = shotplan.shots.filter((s) => s.scene === id);
    const first = shots[0];
    const lastWord = words.filter((w) => shots.some((s) => (s.lines ?? []).includes(w.line))).at(-1)?.b ?? 0;
    return { id, set: first?.set, light: first?.light, start: first?.start, lines: [...new Set(shots.flatMap((s) => s.lines ?? []))], end: +lastWord.toFixed(2) };
  });
  const data = {
    filmSeconds: project.seconds,
    duration,
    scenes: sceneData,
    script: script.lines.map((l) => ({ n: l.n, beat: l.beat, text: l.text, gloss: l.gloss })),
    boardEvents: { fx: board.shots?.flatMap((s) => (s.fx ?? []).map((f) => ({ kind: f.kind, at: f.at }))), kicks: board.kicks?.length ?? 0, flashes: board.shots?.filter((s) => s.transition?.type === 'flash').length ?? 0 },
    defaultSfx: defaults,
    punchAnchors: (shotplan.shots ?? []).flatMap((s) => (s.keys ?? []).map((k) => k.punch).filter(Boolean)),
  };
  const { data: out } = await router.callJson('sound', [
    { role: 'system', content: SOUND },
    { role: 'user', content: `DATA:\n${JSON.stringify(data, null, 2)}\nReturn music, stingers and only the extra SFX the default map cannot know, as one json object. Use the scene ids exactly.` },
  ], {
    validate: (d) => validateCues({ ...d, sfx: [...defaults, ...(d.sfx ?? [])] }, { scenes, words, punchTimes: punches, script }),
    repairHint: `Return one music section per scene (${scenes.join(', ')}), a hook/mystery/payoff stinger on each beat line, and at most one SFX per 1.2 s. SFX anchors are n:k or f<frame>; no non-impact SFX in the first 0.2 s after a punch.`,
  });
  // Model SFX are additions on top of the deterministic board map.
  const sfx = [...defaults, ...(out.sfx ?? [])].map((s) => ({ ...s })).sort((a, b) => (cueSeconds(a.at, words) ?? 0) - (cueSeconds(b.at, words) ?? 0));
  const cues = { version: 1, duration, music: out.music, stingers: out.stingers, sfx };
  writeJsonArtifact(projectDir, 'sound', 'cues.json', cues, 'cues');
  const md = [
    '# Cue sheet', '',
    `Duration: ${duration.toFixed(2)} s. Voice unchanged; music bed 5-10 dB under speech; SFX -6 dB; mix -14 LUFS / <= -1.3 dBTP.`, '',
    '## Music', '',
    '| scene | set / light | mood | tempo | intensity | instruments |', '|---|---|---|---:|---:|---|',
    ...cues.music.map((m) => { const s = sceneData.find((x) => x.id === m.scene); return `| ${m.scene} | ${s?.set ?? '?'} / ${s?.light ?? '?'} | ${m.mood} | ${m.tempo} bpm | ${m.intensity} | ${m.instruments.join(', ')} |`; }),
    '', '## Stingers', '',
    ...cues.stingers.map((s) => `- ${s.kind} at ${s.at}`),
    '', '## SFX', '',
    '| kind | anchor | note |', '|---|---|---|',
    ...cues.sfx.map((s) => `| ${s.kind} | ${s.at} | ${s.note ?? ''} |`),
    '',
  ].join('\n');
  writeTextArtifact(projectDir, 'sound', 'cues.md', md);
  const py = findPython();
  if (!py) throw new Error('sound needs Python 3.12 with numpy/scipy (set FABLEON_PYTHON or create .venv)');
  await run(py, [join(ROOT, 'audio', 'cues_mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
  const mix = join(dir, 'audio', 'mix.wav');
  if (!existsSync(mix)) throw new Error(`sound: ${mix} was not written`);
  return { music: cues.music.length, stingers: cues.stingers.length, sfx: cues.sfx.length, mix, usage: router.stageUsage('sound') };
}
