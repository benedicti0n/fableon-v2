// `fableon usage`: aggregate every logs/calls.jsonl, measure ElevenLabs audio, and read provider balances.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { capture, loadDotEnv, ROOT } from './env.js';

const HINDI_CHARS_PER_SECOND = 11.12;
const f = (n) => Number(n || 0);
const money = (n) => `$${f(n).toFixed(5)}`;
const mins = (s) => f(s) / 60;

const findLogs = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) findLogs(p, out);
    else if (name === 'calls.jsonl') out.push(p);
  }
  return out.sort();
};

const cacheFile = (projectDir, hash) => {
  for (const name of [`${hash}.json`, `audition-${hash}.json`]) {
    const p = join(projectDir, '.fableon', 'voice-cache', name);
    if (existsSync(p)) return p;
  }
  return null;
};

function audioSeconds(projectDir, hash, tmp, secondsCache) {
  const key = `${projectDir}\0${hash}`;
  if (secondsCache.has(key)) return secondsCache.get(key);
  const p = cacheFile(projectDir, hash);
  if (!p) { secondsCache.set(key, null); return null; }
  try {
    const rec = JSON.parse(readFileSync(p, 'utf8'));
    if (!rec.audioBase64) { secondsCache.set(key, null); return null; }
    const file = join(tmp, `${hash}.audio`);
    writeFileSync(file, Buffer.from(rec.audioBase64, 'base64'));
    const sec = Number(capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
    secondsCache.set(key, Number.isFinite(sec) ? sec : null);
    return secondsCache.get(key);
  } catch { secondsCache.set(key, null); return null; }
}

const elevenPurpose = (l) => {
  if (l.stage === 'voice-check') return 'live check';
  if (l.stage === 'voice') return 'full narration takes';
  if (l.stage === 'voice-audition') {
    if (f(l.characters) === 102) return 'round-1 auditions';
    if (l.model === 'eleven_v3' && ['N2lVS1w4EtoT3dr4eOWO', 'JBFqnCBsd6RMkjVDRZzb'].includes(l.voiceId)) return 'round-2 auditions';
    return 'discarded takes';
  }
  return 'discarded takes';
};

export function collectUsage(rootDir = ROOT, { since = null } = {}) {
  const root = resolve(rootDir);
  const files = findLogs(root);
  const tmp = mkdtempSync(join(tmpdir(), 'fableon-usage-'));
  const secondsCache = new Map();
  const deep = new Map(), eleven = new Map(), mock = { calls: 0, cached: 0, projects: new Set() };
  const livePurpose = new Map();
  try {
    const logs = [];
    for (const file of files) {
      const projectDir = dirname(dirname(file));
      const project = relative(root, projectDir) || '.';
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let l; try { l = JSON.parse(line); } catch { continue; }
        if (since && String(l.ts ?? '').slice(0, 10) < since) continue;
        l._project = project; l._projectDir = projectDir;
        logs.push(l);
        if (l.provider === 'mock') {
          mock.calls++;
          if (l.cached) mock.cached++;
          mock.projects.add(project);
          continue;
        }
        if (l.provider === 'deepseek') {
          const key = `${project}\0${l.stage}\0${l.model}`;
          const r = deep.get(key) ?? { project, stage: l.stage, model: l.model, live: 0, cached: 0, prompt: 0, hit: 0, miss: 0, completion: 0, reasoning: 0, cost: 0 };
          if (l.cached) r.cached++; else r.live++;
          r.prompt += f(l.promptTokens); r.hit += f(l.cacheHitTokens); r.miss += f(l.cacheMissTokens);
          r.completion += f(l.completionTokens); r.reasoning += f(l.reasoningTokens); r.cost += f(l.costUsd);
          deep.set(key, r);
        } else if (l.provider === 'elevenlabs') {
          if (!l.cached) livePurpose.set(`${project}\0${l.requestHash}`, elevenPurpose(l));
        }
      }
    }
    for (const l of logs) {
      if (l.provider !== 'elevenlabs') continue;
      const purpose = l.cached ? livePurpose.get(`${l._project}\0${l.requestHash}`) ?? elevenPurpose(l) : elevenPurpose(l);
      const key = `${l._project}\0${purpose}`;
      const r = eleven.get(key) ?? { project: l._project, purpose, live: 0, cached: 0, characters: 0, cost: 0, seconds: 0, estimated: 0 };
      if (l.cached) r.cached++; else r.live++;
      r.characters += f(l.characters); r.cost += f(l.costUsd);
      if (!l.cached) {
        const sec = audioSeconds(l._projectDir, l.requestHash, tmp, secondsCache);
        if (sec === null) { r.seconds += f(l.characters) / HINDI_CHARS_PER_SECOND; r.estimated++; }
        else r.seconds += sec;
      }
      eleven.set(key, r);
    }
    return { files, deep: [...deep.values()].sort((a, b) => a.project.localeCompare(b.project) || a.stage.localeCompare(b.stage) || a.model.localeCompare(b.model)), eleven: [...eleven.values()].sort((a, b) => a.project.localeCompare(b.project) || a.purpose.localeCompare(b.purpose)), mock: { calls: mock.calls, cached: mock.cached, projects: [...mock.projects].sort() } };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export function summarize(usage) {
  const ds = usage.deep.reduce((a, r) => ({ live: a.live + r.live, cached: a.cached + r.cached, prompt: a.prompt + r.prompt, hit: a.hit + r.hit, miss: a.miss + r.miss, completion: a.completion + r.completion, reasoning: a.reasoning + r.reasoning, cost: a.cost + r.cost }), { live: 0, cached: 0, prompt: 0, hit: 0, miss: 0, completion: 0, reasoning: 0, cost: 0 });
  const el = usage.eleven.reduce((a, r) => ({ live: a.live + r.live, cached: a.cached + r.cached, characters: a.characters + r.characters, cost: a.cost + r.cost, seconds: a.seconds + r.seconds, estimated: a.estimated + r.estimated }), { live: 0, cached: 0, characters: 0, cost: 0, seconds: 0, estimated: 0 });
  return { deep: ds, eleven: el };
}

const providerJson = async (url, headers) => {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) { return { ok: false, error: e.message, data: null }; }
};

export async function providerChecks() {
  loadDotEnv();
  const out = { deepseek: null, elevenlabs: null };
  if (process.env.DEEPSEEK_API_KEY) {
    const r = await providerJson('https://api.deepseek.com/user/balance', { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` });
    if (r.ok && r.data?.balance_infos) {
      const b = r.data.balance_infos.find((x) => x.currency === 'USD') ?? r.data.balance_infos[0];
      out.deepseek = { ok: true, currency: b.currency, total: b.total_balance, granted: b.granted_balance, toppedUp: b.topped_up_balance, available: r.data.is_available };
    } else out.deepseek = { ok: false, status: r.status ?? null, error: r.error ?? 'balance endpoint did not return balance_infos' };
  } else out.deepseek = { ok: false, skipped: 'DEEPSEEK_API_KEY is not set' };
  if (process.env.ELEVENLABS_API_KEY) {
    const r = await providerJson('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': process.env.ELEVENLABS_API_KEY });
    if (r.ok && r.data) {
      const d = r.data;
      out.elevenlabs = { ok: true, plan: d.tier ?? d.status ?? null, used: d.character_count ?? null, limit: d.character_limit ?? null, remaining: d.character_limit != null && d.character_count != null ? d.character_limit - d.character_count : null, reset: d.next_character_count_reset_unix ? new Date(d.next_character_count_reset_unix * 1000).toISOString() : null };
    } else out.elevenlabs = { ok: false, status: r.status ?? null, error: r.error ?? 'subscription endpoint failed' };
  } else out.elevenlabs = { ok: false, skipped: 'ELEVENLABS_API_KEY is not set' };
  return out;
}

const table = (rows, headers) => [headers, headers.map(() => '---'), ...rows].map((r) => `| ${r.join(' | ')} |`).join('\n');

export async function usageCommand(opts = {}) {
  const since = opts.since ?? null;
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since must be YYYY-MM-DD');
  const usage = collectUsage(ROOT, { since });
  const totals = summarize(usage);
  const providers = await providerChecks();
  const summary = {
    deepseek: { ...totals.deep, peakCost: totals.deep.cost, offPeakCost: totals.deep.cost / 2, balance: providers.deepseek },
    elevenlabs: { ...totals.eleven, minutes: mins(totals.eleven.seconds), provider: providers.elevenlabs },
    mock: usage.mock,
    files: usage.files.map((f) => relative(ROOT, f)),
  };
  if (opts.json) {
    console.log(JSON.stringify({ since, summary, deepseek: usage.deep, elevenlabs: usage.eleven, providers, notLogged: NOT_LOGGED }, null, 2));
    return { ...summary, usage };
  }
  const dsRows = usage.deep.map((r) => [r.project, r.stage, r.model, `${r.live}/${r.cached}`, `${r.hit}/${r.miss}`, r.prompt, r.completion, r.reasoning, money(r.cost), money(r.cost / 2)]);
  const elRows = usage.eleven.map((r) => [r.project, r.purpose, `${r.live}/${r.cached}`, r.characters, money(r.cost), r.seconds.toFixed(1), r.estimated ? `${r.estimated} est.` : 'measured']);
  console.log('Fableon usage');
  console.log(`DeepSeek: ${totals.deep.live} live + ${totals.deep.cached} cached calls; ${totals.deep.prompt} prompt tokens (${totals.deep.hit} hit / ${totals.deep.miss} miss), ${totals.deep.completion} completion, ${totals.deep.reasoning} reasoning; ${money(totals.deep.cost)} at peak (${money(totals.deep.cost / 2)} off-peak estimate).`);
  console.log(`ElevenLabs: ${totals.eleven.live} live + ${totals.eleven.cached} cached calls; ${totals.eleven.characters} characters; ${totals.eleven.seconds.toFixed(1)} s (${mins(totals.eleven.seconds).toFixed(2)} min) generated (${totals.eleven.estimated} estimated); ${money(totals.eleven.cost)}.`);
  console.log(`Mock: ${usage.mock.calls} calls (${usage.mock.cached} cached) — excluded from spend.`);
  console.log('\nDeepSeek by project × stage × model');
  console.log(table(dsRows, ['project', 'stage', 'model', 'calls live/cached', 'prompt hit/miss', 'prompt', 'completion', 'reasoning', 'peak $', 'off-peak $']));
  const byModel = new Map();
  for (const r of usage.deep) { const x = byModel.get(r.model) ?? { live: 0, cached: 0, prompt: 0, completion: 0, reasoning: 0, cost: 0 }; x.live += r.live; x.cached += r.cached; x.prompt += r.prompt; x.completion += r.completion; x.reasoning += r.reasoning; x.cost += r.cost; byModel.set(r.model, x); }
  console.log('\nDeepSeek totals by model');
  console.log(table([...byModel.entries()].map(([m, x]) => [m, `${x.live}/${x.cached}`, x.prompt, x.completion, x.reasoning, money(x.cost), money(x.cost / 2)]), ['model', 'calls live/cached', 'prompt', 'completion', 'reasoning', 'peak $', 'off-peak $']));
  console.log(`\nDeepSeek overall: ${totals.deep.live}/${totals.deep.cached} live/cached; ${totals.deep.prompt} prompt (${totals.deep.hit} hit / ${totals.deep.miss} miss), ${totals.deep.completion} completion, ${totals.deep.reasoning} reasoning; ${money(totals.deep.cost)} peak / ${money(totals.deep.cost / 2)} off-peak.`);
  console.log('\nElevenLabs by project × purpose');
  console.log(table(elRows, ['project', 'purpose', 'calls live/cached', 'characters billed', 'logged $', 'audio s', 'measured/estimated']));
  console.log(`\nElevenLabs overall: ${totals.eleven.live}/${totals.eleven.cached} live/cached; ${totals.eleven.characters} characters; ${totals.eleven.seconds.toFixed(1)} s (${mins(totals.eleven.seconds).toFixed(2)} min); ${money(totals.eleven.cost)}; ${totals.eleven.estimated} call(s) estimated.`);
  console.log('\nProvider checks');
  console.log('DeepSeek:', providers.deepseek);
  console.log('ElevenLabs:', providers.elevenlabs);
  if (providers.elevenlabs?.ok) {
    const delta = totals.eleven.characters - providers.elevenlabs.used;
    console.log(`Logged ElevenLabs characters ${totals.eleven.characters} vs provider ${providers.elevenlabs.used}; difference ${delta >= 0 ? '+' : ''}${delta}.`);
  }
  console.log('\nNot in logs / caveats');
  for (const x of NOT_LOGGED) console.log(`- ${x}`);
  return { ...summary, usage };
}

export const NOT_LOGGED = [
  'Early `fableon models check` and `fableon voice check` probes were not written to logs/calls.jsonl; phase 3A live and 3A-2 describe them.',
  'The phase 3A-2 live ElevenLabs check used 28 characters and is not in the logs.',
  'Some phase 3A/3A-2 exploratory calls predate the current logging; the phase report totals are the only record for those.',
  'Failed/aborted provider requests that returned no usable output may not have a calls.jsonl row even when the provider billed them.',
  'The coding agent (opencode/DeepSeek) usage is not part of Fableon logs and is not included here.',
];
