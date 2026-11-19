// Studio read models: timeline, waveform peaks, safe directory lists and cost/time estimates.
import { existsSync, mkdirSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, relative, sep } from 'node:path';
import { makeContext } from '../../cli/src/frames.js';
import { parseAnchor } from '../../cli/src/authoring.js';
import { fileHash, atomicWrite } from '../../cli/src/core/artifacts.js';
import { FableonError, ERROR_CODES } from '../../cli/src/core/errors.js';
import { repoModels, modelForStage, modelId } from '../../cli/src/core/model-config.js';
import { contentType } from './artifacts.js';
import { finalPlan } from '../../cli/src/final.js';

const read = (p, fallback = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const seconds = (f, fps) => +(f / fps).toFixed(3);

export function timeline(ctx) {
  const board = read(join(ctx.dir, 'board.json'));
  const script = read(join(ctx.dir, 'script.json'));
  const words = read(join(ctx.dir, 'words.json'), []);
  const review = read(join(ctx.dir, 'board.review.json'));
  if (!board) throw new FableonError(ERROR_CODES.NOT_FOUND, 'timeline needs board.json', { project: ctx.id });
  const c = makeContext(ctx.dir);
  const fps = c.fps;
  const anchor = (a, base = 0) => c.anchor(parseAnchor(a, fps), base);
  const scenes = (board.shots ?? []).map((s) => {
    const startF = Math.max(0, anchor(s.start));
    const endF = Math.max(startF + 1, anchor(s.end, startF));
    const keys = (s.camera ?? []).map((k, i) => {
      const kf = Math.max(startF, anchor(k.at, startF));
      const next = s.camera?.[i + 1] ? anchor(s.camera[i + 1].at, startF) : endF;
      return {
        index: i, at: k.at, start: seconds(kf, fps), end: seconds(Math.max(kf + 1, next), fps),
        startFrame: kf, endFrame: Math.max(kf + 1, next),
        size: k.size ?? null, move: k.move ?? 'push', angle: k.angle ?? 'eye', side: k.side ?? 'front',
        subjects: [...new Set([...(Array.isArray(k.on) ? k.on : k.on == null ? [] : [k.on]), ...(k.with ?? [])])],
        marks: [...new Set([...(Array.isArray(k.on) ? k.on : []), ...(k.with ?? [])].filter((x) => !(s.actors ?? []).some((a) => a.id === x)))],
        punch: !!k.punch, impact: !!k.impact, drama: !!k.drama, reveal: !!k.reveal, cut: !!k.cut, foreground: k.foreground ?? null,
      };
    });
    return {
      id: s.id, start: seconds(startF, fps), end: seconds(endF, fps), startFrame: startF, endFrame: endF,
      light: s.light ?? null, mood: s.look?.mood ?? null, sets: s.sets ?? [], transition: s.transition ?? null, keys,
      needsHuman: !!(review?.shots ?? []).find((r) => r.id === s.id && r.needsHuman),
      findings: (review?.shots ?? []).find((r) => r.id === s.id)?.findings ?? [],
    };
  });
  const byLine = new Map();
  for (const w of words) { if (!byLine.has(w.line)) byLine.set(w.line, []); byLine.get(w.line).push({ w: w.w, a: w.a, b: w.b }); }
  return {
    project: ctx.id, fps, duration: seconds(Math.max(c.END, ...scenes.map((s) => s.endFrame)), fps), scenes,
    script: (script?.lines ?? []).map((l) => ({
      n: l.n, beat: l.beat ?? null, text: l.text, gloss: l.gloss ?? null, facts: l.facts ?? [],
      delivery: l.delivery ?? null, look: l.look ?? null,
      words: byLine.get(l.n) ?? [], start: (byLine.get(l.n)?.[0]?.a ?? 0), end: (byLine.get(l.n)?.at(-1)?.b ?? 0),
    })),
    needsHuman: scenes.filter((s) => s.needsHuman).map((s) => ({ id: s.id, findings: s.findings })),
    frame: { width: 1440, height: 2560 },
  };
}

const PEAK = /^(voice\.wav|audio\/mix\.wav|audio\/stem_(music|sfx|voice)\.wav)$/;
export function peaks(ctx, rel, buckets = 1200) {
  if (!PEAK.test(String(rel ?? ''))) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'peaks path is not allowlisted', { path: rel });
  const file = join(ctx.dir, rel);
  if (!existsSync(file)) throw new FableonError(ERROR_CODES.NOT_FOUND, `${rel} is missing`, { path: rel });
  const h = fileHash(file);
  const cache = join(ctx.dir, '.fableon', 'peaks', `${h}.json`);
  if (existsSync(cache)) {
    try { const j = JSON.parse(readFileSync(cache, 'utf8')); if (j.peaks?.length === buckets) return { ...j, path: rel, cached: true }; } catch { /* rebuild */ }
  }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new FableonError(ERROR_CODES.STAGE_FAILED, `ffmpeg could not decode ${rel}`, { path: rel, error: String(r.stderr ?? '').slice(0, 300) });
  const buf = r.stdout;
  const samples = Math.floor(buf.length / 2);
  const step = Math.max(1, Math.floor(samples / buckets));
  const out = [];
  for (let b = 0; b < buckets; b++) {
    let lo = 0, hi = 0;
    const start = b * step, end = Math.min(samples, start + step);
    for (let i = start; i < end; i++) { const v = buf.readInt16LE(i * 2) / 32768; if (v < lo) lo = v; if (v > hi) hi = v; }
    out.push({ min: +lo.toFixed(4), max: +hi.toFixed(4) });
  }
  const result = { path: rel, hash: h, sampleRate: 8000, duration: +(samples / 8000).toFixed(3), buckets, peaks: out, cached: false };
  mkdirSync(join(ctx.dir, '.fableon', 'peaks'), { recursive: true });
  atomicWrite(cache, JSON.stringify(result));
  return result;
}

const LIST_ROOTS = ['stills', 'cast', 'voice/auditions', 'voice/pace', 'review', 'qa', 'research/sources'];
const LIST_OK = (rel) => LIST_ROOTS.some((r) => rel === r || rel.startsWith(`${r}/`));
export function listFiles(ctx, dir = '') {
  const clean = String(dir ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean || !LIST_OK(clean)) throw new FableonError(ERROR_CODES.BAD_REQUEST, 'directory is not listed', { dir });
  const base = join(ctx.dir, clean);
  if (!existsSync(base) || !statSync(base).isDirectory()) throw new FableonError(ERROR_CODES.NOT_FOUND, `${clean} is missing`, { dir: clean });
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const rel = relative(ctx.dir, p).split(sep).join('/');
        const st = statSync(p);
        files.push({ path: rel, name: e.name, size: st.size, mtime: st.mtime.toISOString(), type: contentType(p), url: `/api/projects/${encodeURIComponent(ctx.id)}/files/${rel.split('/').map(encodeURIComponent).join('/')}` });
      }
    }
  };
  walk(base);
  return { dir: clean, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

const V = { provider: 'kokoro', calls: 1, characters: 0, cachedCharacters: 0, usd: 0, notes: [] };
export function estimate(ctx, body = {}) {
  const op = String(body.op ?? '');
  const args = body.args ?? {};
  const project = ctx.project;
  const script = read(join(ctx.dir, 'script.json'));
  const words = read(join(ctx.dir, 'words.json'), []);
  const repo = repoModels();
  const stage = op === 'run' ? (args.to ?? args.only ?? 'voice') : op;
  const out = { ...V, op, project: ctx.id, provider: null, calls: 0, characters: 0, cachedCharacters: 0, usd: 0, notes: [] };
  if (stage === 'final') {
    try {
      const plan = finalPlan(ctx.dir);
      out.provider = null; out.calls = 0; out.characters = 0; out.cachedCharacters = 0; out.usd = 0;
      out.frameCount = plan.framesToRender; out.seconds = +(plan.estMinutes * 60).toFixed(1);
      out.diskNeedMB = plan.diskNeedMB; out.audioOnly = plan.audioOnly; out.totalFrames = plan.totalFrames;
      out.notes.push(`${plan.segments.filter((s) => s.cached).length}/${plan.segments.length} shot segments cached; ${plan.framesToRender}/${plan.totalFrames} frames to render${plan.audioOnly ? '; audio-only re-mux' : ''}.`);
      out.notes.push(`About ${plan.estMinutes} min at ${(plan.framesToRender ? (plan.estMinutes * 60 / plan.framesToRender) : 0).toFixed(2)} s/frame; needs about ${plan.diskNeedMB} MB plus 3 GB headroom.`);
      return out;
    } catch (e) {
      out.notes.push(`final plan unavailable: ${e.message}`);
      return out;
    }
  }
  if (op === 'stills') {
    const tokens = String(args.frames ?? 'start,mid,end').split(',').filter(Boolean);
    const passes = args.compare && args.look ? 2 : 1;
    out.frameCount = Math.max(1, tokens.length) * passes;
    out.seconds = +(out.frameCount * 0.2).toFixed(1);
    out.notes.push(`Local ${args.quality === 'preview' ? '720x1280' : 'final-size'} still preview${passes > 1 ? ' (before + after)' : ''}; no provider call.`);
    return out;
  }
  if (['lookdev', 'lookcheck', 'audio', 'animatic'].includes(op)) {
    out.notes.push(op === 'audio' ? 'Local audio synthesis and mastering; no provider call.' : `${op} is a local render/check; no provider call.`);
    return out;
  }
  const scriptLines = script?.lines ?? [];
  const textChars = scriptLines.reduce((n, l) => n + Array.from(String(l.text)).length, 0);
  if ((op === 'run' && ['voice', 'factcheck', 'script', 'brief', 'research', 'performance', 'cast', 'shotplan', 'board', 'sound', 'animatic'].includes(stage)) || ['voice-audition', 'voice-pace', 'cast', 'shotplan', 'board', 'review', 'script-lines'].includes(op)) {
    if (stage === 'voice' || op === 'voice-audition' || op === 'voice-pace' || (op === 'run' && stage === 'voice')) {
      const provider = project.voice?.provider ?? project.voice?.engine ?? 'kokoro';
      const model = project.voice?.model ?? (provider === 'kokoro' ? 'kokoro' : provider === 'sarvam' ? 'bulbul:v4-flash' : 'eleven_multilingual_v2');
      out.provider = provider;
      if (op === 'voice-pace') { out.calls = 0; out.notes.push('Rebuilds from the cached take; no provider request.'); return out; }
      if (op === 'voice-audition') {
        const voices = Number(args.voices ?? 4), models = String(args.models ?? '').split(',').filter(Boolean).length || 3;
        out.calls = voices * models;
        out.characters = out.calls * 106; // same Hindi sample as the auditions stage
        out.cachedCharacters = 0;
      } else {
        out.calls = scriptLines.length ? Math.max(1, scriptLines.length) : 0;
        out.characters = textChars;
        out.cachedCharacters = 0;
        out.notes.push('Cache hits are subtracted at run time from the provider cache.');
      }
      if (provider === 'mock') { out.usd = 0; out.notes.push('Test voice provider: no request, no bill.'); }
      else if (provider === 'kokoro') { out.usd = 0; out.notes.push('Local Kokoro: no per-character bill.'); }
      else if (provider === 'sarvam') {
        const inr = (out.characters / 1000) * (repo.voicePrices?.sarvam?.[model] ?? 2);
        out.inr = +inr.toFixed(2); out.usd = +(inr / (repo.voicePrices?.inrPerUsd ?? 88)).toFixed(4);
      } else {
        const per1k = repo.voicePrices?.elevenlabs?.[model] ?? 0.08;
        out.usd = +((out.characters / 1000) * per1k).toFixed(4);
      }
      out.notes.push(`${out.characters} characters across ${out.calls} call(s).`);
      return out;
    }
    const model = modelForStage(project, stage === 'script-lines' ? 'script' : stage === 'lookdev' ? 'script' : stage === 'final' ? 'board' : stage, repo);
    out.provider = model.provider;
    out.calls = stage === 'final' || stage === 'animatic' ? 0 : 2;
    out.usd = stage === 'final' || stage === 'animatic' ? 0 : 0.05;
    out.notes.push(stage === 'final' ? 'Final renders are local; no model spend.' : `Routed through ${modelId(model)}; a conservative two-call estimate.`);
  }
  if (['render', 'stills', 'animatic', 'final'].includes(op) || (op === 'run' && ['board', 'animatic'].includes(stage))) {
    const frames = Math.max(1, ...words.map((w) => Math.round((w.b ?? 0) * 30)));
    const quality = args.quality ?? (op === 'final' ? 'final' : 'preview');
    out.frameCount = frames;
    out.seconds = +(frames * (quality === 'final' ? 0.5 : 0.12)).toFixed(1);
    out.notes.push(`${quality} render, ~${out.seconds}s on the M1 at 2 workers; segments already present are skipped.`);
  }
  if (!out.notes.length) out.notes.push('No paid provider step is implied by this operation.');
  return out;
}
