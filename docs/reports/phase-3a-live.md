# Phase 3A live report

## Summary

The live acceptance run now works end to end. DeepSeek was verified against the real API (two model ids, JSON mode,
strict tool calls, usage fields, limits and prices), the router records thinking/cache/reasoning usage and cost, and a
no-op fact-check revision stops immediately instead of spending another round. The optional Tavily branch is
implemented and mock-tested; the live Tavily test was not run because `TAVILY_API_KEY` is missing.

The Savitri project went from a topic to a fact-checked 17-line script and a 90 s narration: **17 facts, 15 verified,
2 unverified; 322 words vs 337.5 target; fact-check all `ok`/`opinion`; voice 84.14 s natural → 89.98 s fitted**.
It is committed as `fixtures/savitri/`. The existing Adi Parva fixture is unchanged and `fableon all` still passes.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `1fa9d9b` | `docs: phase 3A live-run prompt` | Saved the live instructions before coding. |
| F1 | `5fa8bf9` | `fix(models): DeepSeek verified live` | Live ids/limits/JSON/tool findings, peak prices, stage defaults, thinking/effort, cache/reasoning usage, strict `/beta` check. |
| F2 | `d5f4acb` | `fix(stages): stop no-op revisions` | `reviseScript` reports real changes; the loop stops on unchanged lines or repeated verdicts; runner-level mock tests. |
| F3 | `3fbf63d` | `feat(research): optional Tavily web search` | Opt-in Tavily queries, web sources with url/content, same quote check, verified request format, mocked test. |
| F4a | `0906124` | `fix(stages): live-run hardening` | Per-stage thinking/effort/token budgets and hashes; fixed 17-line script template and repair hints; short quotes marked unverified; file-source URLs; voice path/clamp fixes. |
| F4 | `b566deb` | `feat(fixture): the live Savitri run` | The committed DeepSeek live run: manifest through words.json/voice.wav, no cache/logs/state. |
| F5 | this commit | `docs(report): phase 3A live report` | This report. |

`F4a` is an extra commit between F3 and F4. It contains only fixes the live run exposed; without it the script stage
could not satisfy its own deterministic checks and the voice stage failed on a relative project path.

## Acceptance checks

### 1. `npm test` and the existing fixture

```text
$ npm test
...
PASS pipeline offline  24/24 checks
PASS pipeline core  11/11 checks
...
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

`npx fableon all --project work/adi --quality preview` completed with the same film:

```text
- SPECS 540x960 30/1 fps, 3639 frames, 121.300 s; audio: aac 48000 Hz 2ch
- LOUDNESS I: -14.5 LUFS | LRA: 1.6 LU | Peak: -1.3 dBFS
- FRAMES 3639; black []; unplanned white []; frozen spans >=12f []
- unexplained pops: none
Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
all: done — work/adi/final.mp4
```

The render stage reused the existing 39 clips (`render: all 39 clips exist, nothing to do`), so this run exercised
shots/audio/assemble/QA without re-rendering pixels. The golden/stills/audio checks in `npm test` are the pixel proof.

### 2. `fableon models check --provider deepseek`

```text
$ npx fableon models list --provider deepseek
deepseek-flash
deepseek-v4-pro

$ npx fableon models check --provider deepseek
provider: deepseek
key: SET (DEEPSEEK_API_KEY)
models: deepseek-flash, deepseek-v4-pro
json mode: OK ({"ok":true})
usage fields: prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details, prompt_cache_hit_tokens, prompt_cache_miss_tokens
json word required: YES (HTTP 400: Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'. (re)
strict tool call (beta): OK (returned a tool call)
```

Full findings (ids, thinking modes, limits, usage fields, strict-tool base URL, prices, date) are in `docs/MODELS.md`.
The key value was never printed, opened, logged or committed. No empty JSON response occurred; format errors were
caught by the local schema/repair loop.

### 3. Live run — PASS

Commands (source text added between the two commands):

```bash
npx fableon new work/savitri \
  --topic "Savitri and Satyavan: the princess who out-argued Death" --seconds 90
# research/sources/vanaparva-savitri.txt: Ganguli, Vana Parva CCXCII–CCXCVII
# source page: https://www.swaveda.com/texts/mahabharata/3292
npx fableon run --project work/savitri --to voice --autopilot
```

The final run exited 0. The first attempts did **not** pass: flash and then pro missed the length/beat constraints,
and thinking mode initially exhausted `max_tokens` at 4096. F4a fixes the prompt to an exact 17-line beat template,
gives per-line word budgets and actionable repair errors, and uses project overrides with larger thinking budgets.
The successful script uses `deepseek-v4-pro` with thinking enabled (project override; the repo stage default stays
`deepseek-flash`) because flash did not satisfy the line/length checks after the allowed repairs.

#### Per-stage time, calls, tokens and cost (calls that produced the committed fixture)

| Stage | Calls | Model time | Prompt tokens | Completion tokens | Cache-hit tokens | Reasoning tokens | Cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| brief | 1 | 5.5 s | 213 | 616 | 0 | 0 | $0.0008 |
| research | 2 | 11.5 s | 27,029 | 3,096 | 26,624 | 0 | $0.0040 |
| script (3 generation + 1 revision) | 4 | 172.1 s | 20,719 | 24,342 | 15,232 | 18,034 | $0.1043 |
| fact-check (initial + after revision) | 2 | 119.2 s | 5,126 | 15,198 | 2,816 | 13,429 | $0.0634 |
| voice (local Kokoro + ffmpeg) | 0 | 31.7 s | — | — | — | — | $0 |
| **total** | **9** | **340.0 s** | **53,087** | **43,252** | **44,672** | **31,463** | **$0.1725** |

The script row includes the fact-check revision call (row 49 in `logs/calls.jsonl`) because the revision is part of
the script output. The research row is the two calls that produced the final facts (one repair). Brief was generated
once and then kept; later runs re-read it without a call.

The whole live exercise, including the failed attempts and the forced re-run, made **51 calls (41 live, 10 cache
hits), 256,138 prompt / 110,134 completion tokens, and cost $0.4148**. The committed fixture-producing calls cost
**$0.1725**.

#### Facts

**17 total / 15 verified / 2 unverified.**

- `F8` (Yama takes the soul; Savitri follows): the first quote is verbatim, but the second quote
  `"began to follow Yama"` is only 20 characters, below the 30-character rule → `verified: false`.
- `F17` (five boons): the quote omitted the word `which` (`...five boons, of do ye hear...` instead of
  `...five boons, of which do ye hear...`), so it is not a verbatim substring → `verified: false`.

The script cites only verified facts. This is the deterministic check working as intended.

#### Full “## Script” section of `SCRIPT.md`

```text
## Script (voice, ~322 words)
A princess married a man doomed to die in one year. She read fine print.
Princess Savitri chose her own husband rather than having one arranged for her.
The sage warned that Satyavan had one defect: he would die within a year, but Savitri refused to choose twice.
Savitri married Satyavan in the forest hermitage and lived there as an ascetic, counting every day until the promised death date.
On the predicted day, Satyavan went into the forest to cut wood, and Savitri insisted on going with him.
Satyavan grew weak and laid his head in Savitri's lap; then Yama himself appeared in red, carrying a noose.
Savitri asked Yama why he came in person instead of sending his usual messengers; he told her to turn back.
She refused, arguing that seven steps with someone creates friendship, so Yama offered her any boon except her husband's life.
Luckily, Savitri had already read the terms and conditions; she asked for her blind father-in-law's sight as her first wish.
Unluckily, Yama kept granting wishes, so she asked for her father-in-law's lost kingdom and then a hundred sons for her father.
It was like a loyalty programme: every clever answer earned a wish, but the catalogue excluded her husband's life.
She kept adding family benefits: sight, a kingdom, a hundred sons for her father, stacking small asks before the big one.
Then she asked for a hundred sons for herself and Satyavan though he was dead—trap no fine print could dodge.
She pointed out the promised sons could not exist without their father, so Yama's own boon required Satyavan to live.
Yama conceded, untied his noose, and granted Satyavan a life of four hundred years.
Satyavan woke on her lap, thinking he had merely slept long, and asked where the dark figure had gone.
The fine print didn't save him; she read it, argued every clause, and Yama signed the revised terms in red ink.
```

#### Fact-check table (`script.review.json`)

| Line | Beat | Verdict | Facts | Note |
|---:|---|---|---|---|
| 0 | hook | ok | F2, F4 | First sentence supported by F2 and F4; fine print is anachronistic joke. |
| 1 | setting | ok | F1 | Supported by F1. |
| 2 | setting | ok | F2, F3 | Supported by F2 and F3. |
| 3 | action | ok | F4 | Supported by F4. |
| 4 | action | ok | F5 | Supported by F5. |
| 5 | action | ok | F6 | Supported by F6. |
| 6 | action | ok | F7, F9 | Supported by F7 and F9 (turn back from F9). |
| 7 | snap | ok | F9, F10 | Supported by F9 and F10. |
| 8 | deadpan | ok | F10 | Factual part supported by F10; terms and conditions is joke. |
| 9 | deadpan | ok | F11, F12 | Supported by F11 and F12. |
| 10 | explain | opinion | — | Analogy comparing boons to a loyalty programme; not a factual claim. |
| 11 | explain | opinion | — | Framing/interpretation of her strategy; not a factual claim. |
| 12 | explain | ok | F13 | Factual part supported by F13; trap line is joke. |
| 13 | consequence | ok | F14 | Supported by F14. |
| 14 | consequence | ok | F15 | Supported by F15. |
| 15 | consequence | ok | F16 | Supported by F16. |
| 16 | twist | opinion | — | Extended metaphor about fine print/contract; not a factual claim. |

The first review found three unsupported lines (1, 4, 14: invented suitor detail, “despite protests”, and the soul
“slipping” back). The autopilot revision rewrote only those three lines; the second review has no
`unsupported`/`distorted` verdicts. The no-op guard was not triggered because the revision really changed the lines.

#### Length

- Script: **322 words** vs target `90 × 3.75 = 337.5` (−15.5, **−4.6 %**, inside ±7 %; valid range 314–361).
- Voice natural: **84.14 s**, **−6.5 %** from 90 s (inside ±10 %).
- Fit: `ffmpeg atempo 1.0697` (pitch-preserving), final `voice.wav` **89.976 s**; `words.json` scaled by the same
  factor. The final word ends at 90.146 s, just after the probe duration.

#### Pronunciation TODO

`fableon status` reports:

```text
pronunciation TODO (add to pronunciations.json): Savitri, Satyavan, Yama
```

All three have `phonemes: null, suggested: true` in `script.json`; `pronunciations.json` is `{}` for the user to fill.

### 4. Cache, edit and status

Plain re-run on the finished project (all stages fresh):

```text
skip brief (fresh)
skip research (fresh)
skip script (fresh)
skip factcheck (fresh)
skip voice (fresh)
calls before=51 after=51
```

Zero model calls. A forced re-run was also tried: the three script-generation calls were cache hits, but the forced
script stage restored the **pre-revision** script, so the fact-check/revision cycle ran again (3 live calls) and
produced the final revised fixture. That is a real cache limitation, listed under open questions.

`fableon status` before a hand edit:

```text
stage         status      approved  last run                  tokens (p/c)    cost
------------  ----------  --------  ------------------------  --------------  ------
brief         fresh       no        2026-11-16T18:39:12.003Z  0/0             -
research      fresh       no        2026-11-16T18:39:12.042Z  0/0             -
script        fresh       no        2026-11-16T18:40:09.330Z  1262/1125       $0.0061
factcheck     fresh       no        2026-11-16T18:41:21.106Z  5126/15198      $0.0634
voice         fresh       no        2026-11-16T18:41:52.838Z  0/0             -

pronunciation TODO (add to pronunciations.json): Savitri, Satyavan, Yama
```

After editing one line of `script.json` by hand:

```text
script        edited      no        2026-11-16T18:40:09.330Z  1262/1125       $0.0061
factcheck     stale       no        2026-11-16T18:41:21.106Z  5126/15198      $0.0634
voice         stale       no        2026-11-16T18:41:52.838Z  0/0             -
```

The file was restored byte-for-byte afterwards and all five stages returned to `fresh`.

Note: the `tokens (p/c)` column reflects only the last process that recorded the stage. The script generation and the
fact-check revision ran in separate invocations, so the status table under-reports the script stage (1 revision call
instead of 4 calls). `logs/calls.jsonl` has the full trace used in the table above.

### 5. Commit order

```text
b566deb feat(fixture): the live Savitri run
0906124 fix(stages): live-run hardening
3fbf63d feat(research): optional Tavily web search
d5f4acb fix(stages): stop no-op revisions
5fa8bf9 fix(models): DeepSeek verified live
1fa9d9b docs: phase 3A live-run prompt
```

`docs: phase 3A live-run prompt` is followed by F1, F2, F3, the F4 hardening fix, F4 and this report, in order.

## Measurements

- Machine: Apple M1 (8-core CPU/GPU, 8 GB), macOS 26.5.2 (25F84), Node 25.9.0.
- WebGL renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`.
- Live model time (fixture-producing calls): 340 s; wall clock including failures, prompt edits and the forced
  re-run was about 25 minutes (18:16–18:41 UTC). The slowest single call was the first thinking script call at
  79.8 s; fact-check calls were 47.5 s and 71.8 s.
- No retries/429s were observed. No empty JSON responses were observed.
- `fixtures/savitri/` is **4.2 MB** (voice.wav 4.1 MB, source text 44 KB, words.json 24 KB). `work/savitri/` is
  21 MB including cache, history and logs.
- `fableon all --project work/adi --quality preview`: existing 39 clips reused, QA PASS. Render timings are unchanged
  from `docs/BENCHMARKS.md` (preview render 55 s, full preview ~148 s on this machine).
- Tavily live: **not run** (`TAVILY_API_KEY` missing). The mock path is covered by `PASS pipeline offline 24/24`.

## Deviations from the prompt

1. **Extra hardening commit F4a.** The live model could not satisfy the original script prompt after the allowed
   repairs: it produced 263–287 words against 337.5, over-long lines, and repeated the same JSON. The fix is an exact
   17-line beat template, explicit per-line word budgets, actionable repair errors, and a scratch list of common
   capitalised non-names. The voice path also needed an absolute project path and a clamp for Kokoro’s negative first
   timestamp. These are product fixes, not hand-edits to the fixture.
2. **Script model override.** The committed project uses `deepseek-v4-pro` with thinking `enabled`/`high` and
   `maxTokens: 12000` for the script, and `maxTokens: 24000` for fact-check. The repo defaults remain flash for
   brief/research/script; flash failed the deterministic script checks repeatedly. This is a project-level choice the
   architecture allows, and the report records why.
3. **Thinking token budget.** `max_tokens` includes reasoning tokens; 4096 truncated both pro script and pro
   fact-check. The fact-check stage default is now 24000, and the project overrides script to 12000.
4. **Source preparation.** The Ganguli text came from the swaveda chapter pages 3292–3297 (the site prints the
   section numbers as CCLXLII–CCXLVII). I wrote standard `SECTION CCXCII`–`CCXCVII` headings and converted
   typographic quotes/dashes to ASCII so verbatim quotes are reproducible; wording is unchanged. The URL and sha256
   are in `research/sources.json`, and the 44 KB text is committed because it is below the 200 KB limit.
5. **Tavily live test not run.** No key. The mock test always runs.

## Problems and open questions

- **Forced re-run and revisions.** The script stage cache stores the generated script, not the post-fact-check
  revision. A `--force` run therefore restores the pre-revision script and redoes the review/revision (3 live calls).
  A plain re-run skips everything. If revisions should survive forced re-runs, the revised script needs its own
  cached artifact/hash.
- **Per-process usage.** `fableon status` shows only the last invocation’s usage for a stage. The live script stage
  spans generation and revision, so its status line shows 1 call/$0.0061 while the true total is 4 calls/$0.1043. A
  stage usage accumulator or a call-log query command would fix the reporting.
- **Script constraint difficulty.** Flash needed many repair rounds and still failed; pro with thinking passed after
  three generation calls. The fixed 17-line template is effective but rigid; a later phase may want a more flexible
  beat planner while keeping the deterministic checks.
- **Slow reasoning calls.** The script took 172 s and the fact-check 119 s of model time. The UI/server phase will
  need progress reporting and possibly streaming.
- **Tavily not live-tested.** The request format is verified against the docs and the mock path, but quota, rate
  limits and result quality are unmeasured.
- **Source labels.** Swaveda’s section headings are off by the same typo on every page; the fixture normalises them.
  If the source is re-fetched later, keep the normalisation or use a cleaner Ganguli edition.

## Please look at

- `fixtures/savitri/` — the Phase 3B input: `project.json`, `brief.md`, `research/sources.json`,
  `research/facts.json`, `research/sources/vanaparva-savitri.txt`, `script.json`, `SCRIPT.md`,
  `script.review.json`, `pronunciations.json`, `voice.wav`, `words.json`.
- `docs/MODELS.md` — live DeepSeek ids, limits, JSON/tool findings, usage fields and prices.
- `docs/PIPELINE.md` — commands, artifacts, approvals, cache/budgets, Tavily format, voice fit.
- `cli/src/stages/script.js`, `cli/src/stages/prompts.js`, `cli/src/models/router.js` — the prompt/repair path that
  made the live run converge.
- `work/savitri/logs/calls.jsonl` — the full 51-call trace (workspace only, not committed).
- `work/savitri-status-before.txt`, `work/savitri-status-after.txt` — the hand-edit evidence (workspace only).
