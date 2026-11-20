// Publishing package: validated titles/description, fact flags, cover candidates, sidecar subtitles and export.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync, constants as fsConstants } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, findPython } from './env.js';
import { fileHash, writeJsonArtifact, writeTextArtifact, validationErrors } from './core/artifacts.js';
import { buildCandidates, composeCover } from './cover.js';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const segments = (s) => [...new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(String(s ?? ''))];
const graphemes = (s) => segments(s).length;
const wordsOf = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
const EMOJI = /\p{Extended_Pictographic}/gu;
const DEVANAGARI = /^\p{Script=Devanagari}/u;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'was', 'are', 'were', 'by', 'from', 'as', 'at', 'this', 'that', 'it', 'its', 'his', 'her', 'their', 'a', 'i', 'we', 'you', 'का', 'की', 'के', 'में', 'से', 'को', 'और', 'है', 'था', 'थी', 'एक', 'यह', 'वह', 'पर']);

export function validatePublish(data, { channel = null, language = null } = {}) {
  const errs = validationErrors('publish', data);
  if (!data?.titles || !data?.description || !data?.hashtags || !data?.thumbnailText) return errs;
  const all = JSON.stringify({ titles: data.titles, description: data.description, tags: data.tags, hashtags: data.hashtags, pinnedComment: data.pinnedComment });
  if (/[<>]/.test(all)) errs.push('publish text must not contain < or >');
  for (const t of data.titles) {
    if (graphemes(t.combined) > 100) errs.push(`title is ${graphemes(t.combined)} characters (max 100)`);
    if (!DEVANAGARI.test(String(t.combined).trim())) errs.push('combined title must start with Devanagari');
  }
  if (graphemes(data.description.hi) + graphemes(data.description.en) > 5000) errs.push('description is longer than 5000 characters');
  if (data.hashtags.length < 3 || data.hashtags.length > 8) errs.push('hashtags must be 3-8');
  if (data.hashtags.some((h) => !/^#\S+$/.test(h))) errs.push('every hashtag must start with #');
  if (language === 'hi') { const deva = data.hashtags.filter((h) => /^#[\u0900-\u097F]/.test(h)).length; if (deva < 2) errs.push('Hindi projects need at least 2 Devanagari hashtags'); }
  const appTag = '#fableon';
  const channelName = String(channel?.name ?? '').trim().toLowerCase().replace(/^#/, '');
  if (data.hashtags.some((h) => h.toLowerCase() === appTag) && channelName !== 'fableon') errs.push('do not use the app name as a hashtag');
  if (graphemes(data.tags) > 500) errs.push('tags must be <= 500 characters');
  if (graphemes(data.thumbnailText.hi) > 0 && wordsOf(data.thumbnailText.hi).length > 4) errs.push('thumbnailText.hi must be <= 4 words');
  if ((data.pinnedComment.match(EMOJI) ?? []).length > 1 || (all.match(EMOJI) ?? []).length > 1) errs.push('at most one emoji is allowed');
  const caps = all.replace(/#\S+/g, '').match(/\b[A-Z]{2,}\b/g) ?? [];
  if (caps.length) errs.push(`ALL-CAPS words are not allowed: ${caps.slice(0, 5).join(', ')}`);
  if (data.hashtags.length > 60) errs.push('more than 60 hashtags');
  if (!/[?？]\s*$/.test(String(data.pinnedComment).trim())) errs.push('pinnedComment should be a question');
  if (!String(data.recommendations.madeForKidsReason ?? '').trim() || /^none$/i.test(String(data.recommendations.madeForKidsReason).trim())) errs.push('madeForKids needs a real reason');
  if (!String(data.recommendations.alteredContentReason ?? '').trim() || /^none$/i.test(String(data.recommendations.alteredContentReason).trim())) errs.push('alteredContent needs a real reason');
  if (channel?.hashtags?.length && !data.hashtags.some((h) => channel.hashtags.includes(h))) { /* optional house tags */ }
  return errs;
}

const tokens = (s) => new Set(String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
export function factFlags(data, facts, script) {
  const approved = (facts.facts ?? []).filter((f) => f.verified !== false);
  const factsTokens = approved.map((f) => ({ text: f.claim, tok: tokens(`${f.claim} ${(f.sources ?? []).map((s) => s.quote || '').join(' ')}`) }));
  for (const l of script.lines ?? []) factsTokens.push({ text: l.text, tok: tokens(`${l.text} ${l.gloss ?? ''}`) });
  const names = new Set((script.characters ?? []).map((c) => String(c.id ?? c.name).toLowerCase()));
  for (const l of script.lines ?? []) for (const w of wordsOf(l.text)) if (graphemes(w) > 4) names.add(w.toLowerCase());
  const flags = [];
  const check = (text) => {
    for (const sentence of String(text ?? '').split(/(?<=[.!?।])\s+|\n+/)) {
      const clean = sentence.replace(/#\S+/g, '').trim();
      if (!clean || /^(fableon|source|credits|music|effects|voice|links|follow|join|category|generated)\b/i.test(clean) || /https?:\/\//.test(clean) || clean.length < 12) continue;
      const t = tokens(clean);
      if (!t.size) continue;
      const supported = factsTokens.some((f) => [...t].filter((w) => f.tok.has(w)).length / Math.max(1, t.size) >= 0.25 || [...t].some((w) => f.tok.has(w)));
      if (!supported) flags.push({ text: clean, reason: 'no verified fact supports this sentence' });
    }
  };
  // Titles, credits, source lines and calls to action are labels, not factual claims.
  check(data.description.hi); check(data.description.en);
  return flags;
}

const anchorOf = (at, words) => {
  if (String(at).startsWith('f')) return Number(String(at).slice(1)) / 30;
  const [line, k] = String(at).split(':').map(Number);
  return words.filter((w) => w.line === line)[k]?.a ?? 0;
};

/** Split a line's words into <= 2 x 42 grapheme subtitle cues, 1-6 s each, with >= 2 frames gap. */
export function subtitleCues(script, words, { duration = Infinity, lang = 'hi' } = {}) {
  const cues = [];
  let lastEnd = -1;
  for (const line of script.lines ?? []) {
    if (lang === 'en') {
      const ws = words.filter((w) => w.line === line.n);
      if (!ws.length) continue;
      const text = String(line.gloss ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const start = Math.max(0, ws[0].a), end = Math.min(duration, Math.max(start + 1, ws[ws.length - 1].b));
      if (end > lastEnd + 2 / 30) { cues.push({ start, end, text }); lastEnd = end; }
      continue;
    }
    const ws = words.filter((w) => w.line === line.n);
    if (!ws.length) continue;
    let cur = [], chars = 0, rows = 1;
    const flush = () => {
      if (!cur.length) return;
      const start = Math.max(lastEnd + 2 / 30, cur[0].a);
      const end = Math.min(duration, Math.max(start + 1, cur[cur.length - 1].b));
      if (end > start && end - start <= 6.01) { cues.push({ start, end: Math.min(end, start + 6), text: cur.map((w) => w.w).join(' ') }); lastEnd = Math.min(end, start + 6); }
      cur = []; chars = 0; rows = 1;
    };
    for (const w of ws) {
      const g = graphemes(w.w) + (cur.length ? 1 : 0);
      const nextChars = chars + g;
      const nextRows = nextChars > 42 ? 2 : 1;
      const span = cur.length ? w.b - cur[0].a : 0;
      if (cur.length && (nextRows > 2 || nextChars > 84 || span > 6)) flush();
      cur.push(w); chars += g; rows = chars > 42 ? 2 : 1;
      if (rows > 2) { const removed = cur.pop(); chars -= graphemes(removed.w); flush(); cur.push(removed); chars = graphemes(removed.w) + 1; }
    }
    flush();
  }
  return cues.filter((c) => c.end > c.start).map((c, i) => ({ ...c, index: i + 1 }));
}

const srtTime = (s) => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`; };
export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n') + '\n';
}
export function parseSrt(text) {
  const rows = [];
  for (const block of String(text).replace(/\r/g, '').trim().split(/\n{2,}/)) {
    const lines = block.split('\n');
    const m = /^(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)$/.exec(lines[1] ?? '');
    if (!m) continue;
    const t = (h, mi, s, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    rows.push({ start: t(m[1], m[2], m[3], m[4]), end: t(m[5], m[6], m[7], m[8]), text: lines.slice(2).join(' ') });
  }
  return rows;
}
export function validateSrt(text, duration) {
  const rows = parseSrt(text), errs = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].end <= rows[i].start) errs.push(`cue ${i + 1} ends before it starts`);
    if (i && rows[i].start < rows[i - 1].end + 2 / 30 - 0.001) errs.push(`cue ${i + 1} is too close to cue ${i}`);
    if (rows[i].start < 0 || rows[i].end > duration + 0.05) errs.push(`cue ${i + 1} falls outside the film`);
  }
  return errs;
}

const channelPath = (projectDir) => join(dirname(projectDir), '.fableon', 'channel.json');
export function readChannel(projectDir) {
  const p = channelPath(projectDir);
  if (existsSync(p)) return json(p);
  return { name: 'Fableon', footer: 'Fableon — stories from the epics, one short at a time.', links: [], hashtags: ['#shorts'], category: 'Film & Animation', madeForKids: false };
}

export function writePublishMarkdown(projectDir, data, candidates, flags) {
  const title = data.selection?.title ?? data.titles[0].combined;
  const cover = data.selection?.cover ?? candidates[0]?.image ?? 'cover.jpg';
  const tags = data.tags;
  const md = `# Publish package\n\n## Title\n${title}\n\n## Description\n${data.description.hi}\n\n${data.description.en}\n\n## Hashtags\n${data.hashtags.join(' ')}\n\n## Tags\n${tags}\n\n## Pinned comment\n${data.pinnedComment}\n\n## Cover\n${cover}\n\n## Upload checklist\n- [ ] Title pasted; ${graphemes(title)}/100 characters\n- [ ] Description pasted; ${graphemes(data.description.hi) + graphemes(data.description.en)}/5000 characters\n- [ ] Hashtags: 3-8; first three above the title\n- [ ] Made for kids: ${data.recommendations.madeForKids ? 'yes' : 'no'} — ${data.recommendations.madeForKidsReason}\n- [ ] Altered content: ${data.recommendations.alteredContent ? 'yes' : 'no'} — ${data.recommendations.alteredContentReason}\n- [ ] Category: ${data.recommendations.category}\n- [ ] Language: Hindi; sidecar subtitles.hi.srt${existsSync(join(projectDir, 'publish', 'subtitles.en.srt')) ? ' and subtitles.en.srt' : ''}\n- [ ] Cover uploaded\n\n## Fact flags\n${flags.length ? flags.map((f) => `- ${f.text} — ${f.reason}`).join('\n') : '- none'}\n`;
  writeTextArtifact(projectDir, 'publish', 'publish/publish.md', md);
}

export async function runPublish({ projectDir, project, router, progress = null }) {
  const dir = resolve(projectDir);
  const script = json(join(dir, 'script.json'));
  const facts = json(join(dir, 'research', 'facts.json'));
  const sources = existsSync(join(dir, 'research', 'sources.json')) ? json(join(dir, 'research', 'sources.json')) : { sources: [] };
  const brief = existsSync(join(dir, 'brief.md')) ? readFileSync(join(dir, 'brief.md'), 'utf8') : '';
  const channel = readChannel(dir);
  const words = json(join(dir, 'words.json'));
  const duration = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nokey=1', join(dir, 'final.mp4')], { encoding: 'utf8' }).stdout.trim()) || words.at(-1)?.b || 1;
  const input = {
    script: script.lines.map((l) => ({ n: l.n, text: l.text, gloss: l.gloss })),
    facts: (facts.facts ?? []).filter((f) => f.verified !== false).map((f) => ({ id: f.id, claim: f.claim })),
    sources: sources.sources.map((s) => ({ title: s.title, url: s.url })),
    brief: brief.slice(0, 4000), channel,
    voice: project.voice?.provider ?? 'unknown', model: project.voice?.model ?? '',
  };
  progress?.({ step: 'publish:model', done: 0, total: 2 });
  const { data, usage } = await router.callJson('publish', [
    { role: 'system', content: (await import('./stages/prompts.js')).PUBLISH },
    { role: 'user', content: `DATA:\n${JSON.stringify(input, null, 2)}\nReturn json only.` },
  ], { validate: (d) => validatePublish(d, { channel, language: project.language }), repairHint: 'Five titles, combined Devanagari first <= 100 chars; description <= 5000; 3-8 hashtags; tags <= 500; no < or >; no ALL-CAPS; <= 1 emoji; Hindi question pinned comment.' });
  progress?.({ step: 'publish:model', done: 1, total: 2 });
  let flags = factFlags(data, facts, script);
  if (flags.length) {
    try {
      const { data: review } = await router.callJson('factcheck', [
        { role: 'system', content: (await import('./stages/prompts.js')).PUBLISH_FACT },
        { role: 'user', content: `VERIFIED FACTS:\n${JSON.stringify((facts.facts ?? []).filter((f) => f.verified !== false).map((f) => f.claim), null, 2)}\nFACTCHECKED SCRIPT:\n${JSON.stringify((script.lines ?? []).map((l) => ({ text: l.text, gloss: l.gloss })), null, 2)}\nSENTENCES:\n${JSON.stringify(flags.map((f) => f.text), null, 2)}\nReturn json only.` },
      ], { mockKey: 'publish-fact', validate: (d) => Array.isArray(d.claims) ? [] : ['/claims must be an array'] });
      const byText = new Map((review.claims ?? []).map((c) => [String(c.text), c]));
      flags = flags.filter((f) => { const c = byText.get(f.text); return !c || c.supported === false; }).map((f) => ({ ...f, reason: byText.get(f.text)?.reason ?? f.reason }));
    } catch { /* keep the fast pre-filter when the factcheck model is unavailable */ }
  }
  const selected = {
    ...data,
    selection: { title: data.titles[0].combined, cover: null, template: 'title', thumbnailText: data.thumbnailText.hi },
  };
  writeJsonArtifact(dir, 'publish', 'publish/publish.json', selected, 'publish');
  writeJsonArtifact(dir, 'publish', 'publish/facts.json', { flags, at: new Date().toISOString() }, null);
  const candidates = await buildCandidates(dir, join(dir, 'final.mp4'));
  if (candidates[0]) {
    selected.selection.cover = candidates[0].image;
    await composeCover(dir, { image: candidates[0].image, text: data.thumbnailText.hi, template: 'title' });
    writeJsonArtifact(dir, 'publish', 'publish/publish.json', selected, 'publish');
  }
  const hi = subtitleCues(script, words, { duration, lang: 'hi' });
  const en = subtitleCues(script, words, { duration, lang: 'en' });
  writeTextArtifact(dir, 'publish', 'publish/subtitles.hi.srt', toSrt(hi));
  writeTextArtifact(dir, 'publish', 'publish/subtitles.en.srt', toSrt(en));
  const srtErrs = [...validateSrt(toSrt(hi), duration), ...validateSrt(toSrt(en), duration)];
  const md = writePublishMarkdown(dir, selected, candidates, flags);
  progress?.({ step: 'publish:package', done: 2, total: 2 });
  return { usage, titles: data.titles.length, hashtags: data.hashtags.length, cover: selected.selection.cover, candidates: candidates.length, srtErrs, factFlags: flags.length, candidatesFile: join(dir, 'publish', 'candidates.json') };
}

/** Re-compose the cover after a UI title/template/candidate change. */
export async function recomposeCover(projectDir, data) {
  const selected = data.selection ?? {};
  const candidates = existsSync(join(projectDir, 'publish', 'candidates.json')) ? json(join(projectDir, 'publish', 'candidates.json')) : [];
  const candidate = candidates.find((c) => c.image === selected.cover) ?? candidates[0];
  if (!candidate) throw new Error('no cover candidate');
  await composeCover(projectDir, { image: candidate.image, text: selected.thumbnailText ?? data.thumbnailText?.hi ?? '', template: selected.template ?? 'title' });
  return { cover: 'publish/cover.jpg', candidate: candidate.image };
}

export function exportPackage(projectDir, { profiles = ['youtube-short'] } = {}) {
  const dir = resolve(projectDir);
  const data = json(join(dir, 'publish', 'publish.json'));
  const facts = existsSync(join(dir, 'publish', 'facts.json')) ? json(join(dir, 'publish', 'facts.json')) : { flags: [] };
  const override = existsSync(join(dir, 'publish', 'override.json')) ? json(join(dir, 'publish', 'override.json')) : null;
  if (facts.flags?.length && !override?.reason) throw new Error('publish fact flags are unsupported; edit the text or record an override reason');
  const date = new Date().toISOString().slice(0, 10);
  const out = join(dirname(dir), 'exports', `${date}-${dir.split('/').pop()}`);
  mkdirSync(out, { recursive: true });
  const final = join(dir, 'final.mp4');
  const files = [];
  const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); try { copyFileSync(from, to, fsConstants.COPYFILE_FICLONE); } catch { copyFileSync(from, to); } files.push(to); };
  for (const profile of profiles) {
    if (profile === 'youtube-short') {
      const file = join(out, 'youtube-short.mp4');
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', final, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', file], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`youtube-short export failed: ${r.stderr}`);
      files.push(file);
    } else if (profile === 'reels') {
      const file = join(out, 'reels.mp4');
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', final, '-vf', 'scale=1080:1920:flags=lanczos:force_original_aspect_ratio=increase,crop=1080:1920', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', file], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`reels export failed: ${r.stderr}`);
      files.push(file);
      const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nokey=1', file], { encoding: 'utf8' }).stdout);
      if (dur > 180) console.warn(`reels: ${dur.toFixed(1)} s is longer than 180 s`);
    }
  }
  copy(join(dir, 'publish', 'cover.jpg'), join(out, 'cover.jpg'));
  copy(join(dir, 'publish', 'subtitles.hi.srt'), join(out, 'subtitles.hi.srt'));
  if (existsSync(join(dir, 'publish', 'subtitles.en.srt'))) copy(join(dir, 'publish', 'subtitles.en.srt'), join(out, 'subtitles.en.srt'));
  copy(join(dir, 'publish', 'publish.json'), join(out, 'publish.json'));
  writeTextArtifact(dir, 'publish', `exports/${date}-${dir.split('/').pop()}/publish.md`, readFileSync(join(dir, 'publish', 'publish.md'), 'utf8'));
  const qa = exportQa(out, files.filter((f) => f.endsWith('.mp4')));
  writeFileSync(join(out, 'export-qa.md'), qa.md);
  files.push(join(out, 'publish.md'), join(out, 'export-qa.md'));
  return { dir: out, files: files.map((f) => f.replace(`${out}/`, '')), qa: qa.ok, warnings: qa.warnings };
}

function exportQa(out, videos) {
  const warnings = [], rows = [];
  for (const file of videos) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,duration,sample_rate,color_primaries,color_transfer,color_space:format=duration', '-of', 'json', file], { encoding: 'utf8' });
    let p = {}; try { p = JSON.parse(probe.stdout); } catch { /* invalid */ }
    const v = (p.streams ?? []).find((s) => s.codec_type === 'video') ?? {};
    const a = (p.streams ?? []).find((s) => s.codec_type === 'audio') ?? {};
    const loud = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
    const lufsMatches = [...String(loud.stderr).matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
    const peakMatches = [...String(loud.stderr).matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)];
    const lufs = Number(lufsMatches.at(-1)?.[1] ?? NaN);
    const tp = Number(peakMatches.at(-1)?.[1] ?? NaN);
    const bytes = readFileSync(file);
    const faststart = bytes.indexOf(Buffer.from('moov')) >= 0 && (bytes.indexOf(Buffer.from('mdat')) < 0 || bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')));
    const fps = v.r_frame_rate === '30/1';
    const expected = file.endsWith('reels.mp4') ? [1080, 1920] : null;
    const ok = (!expected || (v.width === expected[0] && v.height === expected[1])) && fps && a.sample_rate === '48000' && Math.abs(lufs + 14) <= 1 && tp <= -1 && faststart;
    if (!ok) warnings.push(`${file}: ${JSON.stringify({ width: v.width, height: v.height, fps: v.r_frame_rate, audio: a.sample_rate, lufs, tp, faststart })}`);
    rows.push(`| ${file.split('/').pop()} | ${v.width}x${v.height} | ${v.r_frame_rate} | ${Number(p.format?.duration ?? 0).toFixed(2)} s | ${a.sample_rate} | ${v.color_space ?? '?'} | ${lufs.toFixed(1)} LUFS | ${tp.toFixed(1)} dBTP | ${faststart ? 'yes' : 'no'} |`);
  }
  const md = ['# Export QA', '', '| file | size | fps | duration | audio | colour | loudness | true peak | faststart |', '|---|---|---|---|---|---|---|---|---|', ...rows, '', warnings.length ? `Warnings:\n${warnings.map((w) => `- ${w}`).join('\n')}` : 'All checks passed.'].join('\n') + '\n';
  return { ok: warnings.length === 0, warnings, md };
}
