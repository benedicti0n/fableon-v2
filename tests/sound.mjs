// Sound stage: deterministic board SFX map and the cue-driven mix (duration, -14 LUFS, true peak).
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, findPython, ROOT, run } from '../cli/src/env.js';
import { defaultSfx, validateCues } from '../cli/src/stages/sound.js';

export async function runSoundTests() {
  const checks = [], errors = [];
  const ok = (name, cond, detail = '') => { checks.push({ name, ok: cond, detail }); if (!cond) errors.push(`${name}: ${detail}`); };
  const words = Array.from({ length: 8 }, (_, i) => ({ w: `w${i}`, a: i * 1.5, b: i * 1.5 + 0.3, line: Math.floor(i / 2) }));
  const one = (board) => defaultSfx(board, { words, punchTimes: [] })[0]?.kind;
  ok('map flash', one({ shots: [{ start: '0:0', transition: { type: 'flash' } }] }) === 'flashHit');
  ok('map puff', one({ shots: [{ start: '0:0', fx: [{ kind: 'puff', at: '0:1' }] }] }) === 'poof');
  ok('map sparkle', one({ shots: [{ start: '0:0', fx: [{ kind: 'sparkle', at: '0:1' }] }] }) === 'shimmer');
  ok('map appear', one({ shots: [{ start: '0:0', actors: [{ appear: '0:1' }] }] }) === 'pop');
  ok('map arrow', one({ shots: [{ start: '0:0', fx: [{ kind: 'arrow', at: '0:1' }] }] }) === 'arrow');
  ok('map walk', one({ shots: [{ start: '0:0', actors: [{ motion: { type: 'path', walk: {}, keys: [['0:1', 'village.front'], ['2:0', 'village.palms']] } }] }] }) === 'steps');
  ok('map glide', one({ shots: [{ start: '0:0', camera: [{ at: '0:1', move: 'glide' }] }] }) === 'whoosh');
  ok('map kick', one({ shots: [], kicks: [{ at: '0:1', amp: 0.6 }] }) === 'thud');
  const board = { shots: [{ start: '0:0', transition: { type: 'flash' }, fx: [{ kind: 'puff', at: '1:1' }], actors: [{ appear: { at: '2:1' } }] }, { start: '3:0', actors: [{ motion: { type: 'path', walk: {}, keys: [['3:1', 'village.front'], ['4:1', 'village.palms']] } }] }], kicks: [{ at: '5:1', amp: 0.6 }] };
  const sfx = defaultSfx(board, { words, punchTimes: [0] });
  const times = sfx.map((s) => (s.at.startsWith('f') ? Number(s.at.slice(1)) / 30 : words.filter((w) => w.line === Number(s.at.split(':')[0]))[Number(s.at.split(':')[1])]?.a ?? 0));
  ok('one SFX per 1.2 s', times.every((t, i) => !i || t - times[i - 1] >= 1.2), JSON.stringify(sfx) + JSON.stringify(times));

  const cueScript = { lines: [{ n: 0, beat: 'hook' }, { n: 1, beat: 'mystery' }, { n: 2, beat: 'payoff' }] };
  const cueWords = [{ w: 'a', a: 0, b: 0.3, line: 0 }, { w: 'b', a: 1.5, b: 1.8, line: 1 }, { w: 'c', a: 3, b: 3.3, line: 2 }];
  const good = { version: 1, music: [{ scene: 's', mood: 'warm', tempo: 90, intensity: 0.5, instruments: ['tanpura'] }], stingers: [{ kind: 'hook', at: '0:0' }, { kind: 'mystery', at: '1:0' }, { kind: 'payoff', at: '2:0' }], sfx: [{ kind: 'poof', at: '0:0' }, { kind: 'thud', at: '1:0' }] };
  ok('cue sheet valid', validateCues(good, { scenes: ['s'], words: cueWords, punchTimes: [], script: cueScript }).length === 0, validateCues(good, { scenes: ['s'], words: cueWords, punchTimes: [], script: cueScript }).join('; '));
  const fielded = structuredClone(good); fielded.music[0].gainDb = -3; fielded.music[0].muted = false; fielded.stingers[0].gainDb = 2; fielded.sfx[0].seed = 7; fielded.sfx[0].gainDb = -2; fielded.mix = { musicDb: -1, sfxDb: 1, stingerDb: 0, ambienceDb: 0, duckDb: -4 };
  ok('cue sheet optional sound fields', validateCues(fielded, { scenes: ['s'], words: cueWords, punchTimes: [], script: cueScript }).length === 0, validateCues(fielded, { scenes: ['s'], words: cueWords, punchTimes: [], script: cueScript }).join('; '));
  const close = structuredClone(good); close.sfx = [{ kind: 'poof', at: '0:0' }, { kind: 'thud', at: '0:1' }];
  ok('cue sheet 1.2 s gap', validateCues(close, { scenes: ['s'], words: cueWords, punchTimes: [], script: cueScript }).some((e) => /within 1.2 s/.test(e)), validateCues(close, { scenes: ['s'], words: cueWords, punchTimes: [], script: cueScript }).join('; '));
  const punch = structuredClone(good); punch.sfx = [{ kind: 'poof', at: '0:0' }];
  ok('cue sheet punch guard', validateCues(punch, { scenes: ['s'], words: cueWords, punchTimes: [0], script: cueScript }).some((e) => /punch's first 0.2 s/.test(e)), validateCues(punch, { scenes: ['s'], words: cueWords, punchTimes: [0], script: cueScript }).join('; '));

  const py = findPython();
  if (!py) { ok('python available', false, 'no Python'); return { ok: false, errors, checks }; }
  const dir = mkdtempSync(join(tmpdir(), 'fableon-sound-'));
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3:sample_rate=48000', '-ac', '1', join(dir, 'voice.wav')]);
    writeFileSync(join(dir, 'words.json'), JSON.stringify([{ w: 'hello', a: 0.2, b: 0.8, line: 0 }, { w: 'world', a: 1.0, b: 1.6, line: 0 }, { w: 'end', a: 2.2, b: 2.8, line: 1 }]));
    writeFileSync(join(dir, 'shotplan.json'), JSON.stringify({ shots: [{ id: 'S1', scene: 'village-day', start: '0:0', lines: [0], set: 'village', light: 'day' }, { id: 'S2', scene: 'village-day', start: '1:0', lines: [1], set: 'village', light: 'day' }] }));
    writeFileSync(join(dir, 'cues.json'), JSON.stringify({ version: 1, duration: 3, music: [{ scene: 'village-day', mood: 'warm', tempo: 96, intensity: 0.5, instruments: ['tanpura', 'sitar', 'flute', 'tabla'] }], stingers: [{ kind: 'hook', at: '0:0' }, { kind: 'mystery', at: '0:1' }, { kind: 'payoff', at: '1:2' }], sfx: [{ kind: 'poof', at: '0:1' }, { kind: 'thud', at: '1:2' }] }));
    await run(py, [join(ROOT, 'audio', 'cues_mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
    const mix = join(dir, 'audio', 'mix.wav');
    ok('mix written', existsSync(mix) && ['stem_music.wav', 'stem_sfx.wav', 'stem_voice.wav'].every((f) => existsSync(join(dir, 'audio', f))), mix);
    const m = JSON.parse(capture(py, [join(ROOT, 'tests', 'audio_metrics.py'), mix]));
    ok('mix exact length', Math.abs(m.duration - 3) <= 0.02, String(m.duration));
    ok('mix loudness', Math.abs(m.loudness + 14) <= 0.5, String(m.loudness));
    ok('mix true peak', m.true_peak <= -1.3, String(m.true_peak));
    const baseCues = JSON.parse(readFileSync(join(dir, 'cues.json'), 'utf8'));
    const zeroCues = structuredClone(baseCues); zeroCues.mix = { musicDb: 0, sfxDb: 0, stingerDb: 0, ambienceDb: 0, duckDb: -4 }; zeroCues.music[0].gainDb = 0; zeroCues.music[0].muted = false; zeroCues.sfx.forEach((x) => { x.gainDb = 0; x.muted = false; });
    writeFileSync(join(dir, 'cues.json'), JSON.stringify(zeroCues));
    await run(py, [join(ROOT, 'audio', 'cues_mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
    const zeroHash = createHash('sha256').update(readFileSync(mix)).digest('hex');
    writeFileSync(join(dir, 'cues.json'), JSON.stringify(baseCues));
    await run(py, [join(ROOT, 'audio', 'cues_mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
    const baseHash = createHash('sha256').update(readFileSync(mix)).digest('hex');
    ok('absent fields rebuild byte-identically', baseHash === zeroHash, `${baseHash} vs ${zeroHash}`);
    const varied = structuredClone(baseCues); varied.sfx[0].seed = 9; varied.sfx[0].gainDb = -6;
    writeFileSync(join(dir, 'cues.json'), JSON.stringify(varied));
    await run(py, [join(ROOT, 'audio', 'cues_mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
    const variedHash = createHash('sha256').update(readFileSync(mix)).digest('hex');
    ok('sfx seed/gain changes the mix', variedHash !== baseHash, `${variedHash} vs ${baseHash}`);
    const amb = structuredClone(baseCues); amb.music[0].ambience = 'birds'; amb.mix = { ...(amb.mix ?? {}), ambienceDb: -6 };
    writeFileSync(join(dir, 'cues.json'), JSON.stringify(amb));
    await run(py, [join(ROOT, 'audio', 'cues_mix.py')], { cwd: join(ROOT, 'audio'), env: { ...process.env, PROJECT_DIR: dir } });
    const ambHash = createHash('sha256').update(readFileSync(mix)).digest('hex');
    ok('ambience bed and ambienceDb change the mix', ambHash !== baseHash && existsSync(join(dir, 'audio', 'stem_ambience.wav')), `${ambHash} vs ${baseHash}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { ok: errors.length === 0, errors, checks };
}
