# Phase 3A report

> Live acceptance superseded by `docs/reports/phase-3a-live.md` (2026-11-17): the DeepSeek key became available and
> the Savitri run is committed in `fixtures/savitri/`.

## Summary

Phase 3A adds the reusable pipeline library: validated atomic artifacts, a stage registry with input hashing and
downstream invalidation, approvals, a dependency runner with autopilot/gating, a provider-neutral model router with
JSON repair, cache, usage/calls logging and budgets, and the brief → research → script → fact-check → voice stages.
The offline mock pipeline is green in `npm test`; the live DeepSeek/Savitri run could not be executed because
`DEEPSEEK_API_KEY` is not set on this machine and there is no repo-root `.env`. No live facts, tokens, cost or voice
lengths are therefore claimed. The existing fixture pipeline is unchanged and `fableon all --project work/adi
--quality preview` still passes with the same golden/stills/audio results.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `acf0296` | `docs: phase 3A prompt` | Saved the phase instructions before coding. |
| F1 | `725e17b` | `feat(core): project manifest, artifacts and stage state` | Manifest/layout, atomic validated artifacts + history, hashes, statuses, approvals, new/status/approve. |
| F2 | `ad4dcb4` | `feat(core): stage runner and fableon run` | Dependency runner, progress events, gating/autopilot, cancellation, run logs, revision loop. |
| F3 | `a2463ea` | `feat(models): provider-neutral model router` | DeepSeek/openai-compatible/mock, JSON repair, retries, cache, budgets, calls log, models check. |
| F4 | `976c2a4` | `feat(stages): brief and research` | Brief drafting, source registry, facts, local verbatim quote verification. |
| F5 | `2acfa9b` | `feat(stages): script writer` | Structured script, style/fact/staging checks, SCRIPT.md, selective revisions. |
| F6 | `335ff9e` | `feat(stages): fact-check and revise` | Per-line review and the autopilot revise-after-failure gate. |
| F7 | `e8d25dd` | `feat(stages): voice stage` | Project-aware Kokoro, beat pauses, atempo length fit, words scaling. |
| F8 | `6346a83` | `test(pipeline): offline mock pipeline` | Mini source/mock responses, repair/revise/cache/gating/staleness tests. |
| F9 | this commit | `docs(report): phase 3A report` | Pipeline docs, model findings, roadmap carry-over, this report. |

## Acceptance checks

### 1. `npm test`

```text
$ npm test
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS catalog metadata  8 sets, 46 marks, 610 volumes, 32 measures
PASS authoring  20/20 checks
PASS framing solver  17/17 checks
PASS frames validator  6/6 checks
PASS visibility solver  4/4 checks
PASS strict schema  5/5 checks
PASS partial boards  3/3 checks
PASS measured frames  4/4 checks
PASS measurement fixes  4/4 checks
PASS editing rules  3/3 checks
PASS director fixture match  49/49 checks
PASS pipeline offline  16/16 checks
PASS pipeline core  9/9 checks
PASS validator (5/5)
PASS validator  5/5 cases
PASS shot starts: 39 resolved
PASS shot starts  39 anchors resolve to the old frames
PASS motion math (9/9)
PASS motion math  9/9 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

`npx fableon all --project work/adi --quality preview` also completed:

```text
SPECS 540x960 30/1 fps, 3639 frames, 121.300 s
LOUDNESS -14.5 LUFS, Peak -1.3 dBFS
FRAMES black [], white [], frozen []
unexplained pops: none
Verdict: PASS
all: done — work/adi/final.mp4
```

### 2. `fableon models check --provider deepseek`

```text
$ fableon models check --provider deepseek
provider: deepseek
key: MISSING (DEEPSEEK_API_KEY)
```

No ids, JSON-mode result, tool-call result, limits or cache-hit fields could be discovered without a key. The findings
and the exact contract are in `docs/MODELS.md`. No secret was printed.

### 3. LIVE RUN — blocked

**FAIL/BLOCKED:** this machine has no `DEEPSEEK_API_KEY` in the environment and no repo-root `.env`. The requested
`fableon new work/savitri …` → `fableon run --project work/savitri --to voice --autopilot` cannot make a live call, and
I did not invent stage times, tokens, cost, facts, script or voice lengths. The offline mock run is the evidence
available in this phase:

- `brief`: 16 ms, 1 call
- `research`: 21 ms, 1 call
- `script`: 18 ms, 1 call (+ repairs/revision)
- `factcheck`: 30 ms, 1 call + 1 revision round
- facts: **2 total / 1 verified / 1 unverified** (the planted fake quote is marked unverified)
- script: **79 words** vs 75-word target (within ±7 %)
- review: all 10 lines `ok` after the revision
- pronunciation TODO: **Mira**
- voice: not run (Kokoro is slow and there is no live run)

Once a key is provided, the exact commands are in `docs/PIPELINE.md`; the router will discover `/models` ids and the
live run will fill the missing numbers.

### 4. Cache, edit and approval evidence

The offline pipeline test force-re-ran all stages with the mock provider: network-call count stayed at 8, and every
subsequent call was a cache hit. A real status pair from `work/pipe-mini`:

Before edit:

```text
brief      approved  yes
research   fresh     no
script     fresh     no
factcheck  fresh     no
voice      missing   no
```

After editing one line of `script.json`:

```text
brief      approved  yes
research   fresh     no
script     edited    no
factcheck  stale     no
voice      missing   no
```

Approval was invalidated for the edited script, and the downstream fact-check became stale. The approval-gate test on
a fresh project stops with `waiting for brief approval` without `--autopilot`.

### 5. Commit order

```text
6346a83 test(pipeline): offline mock pipeline
e8d25dd feat(stages): voice stage
335ff9e feat(stages): fact-check and revise
2acfa9b feat(stages): script writer
976c2a4 feat(stages): brief and research
a2463ea feat(models): provider-neutral model router
ad4dcb4 feat(core): stage runner and fableon run
725e17b feat(core): project manifest, artifacts and stage state
acf0296 docs: phase 3A prompt
```

PASS: Step 0 followed by F1–F9 in order.

## Measurements

Offline mock pipeline on the mini project: 8 calls on the first run, 0 network calls on the cached force re-run; stage
times 16/21/18/30 ms. No live token or cost numbers are available. `npm test` and `fableon all` were run on macOS
26.5.2, Apple M1.

## Deviations from the prompt

1. **Live run blocked.** `DEEPSEEK_API_KEY` and `.env` are absent. `docs/MODELS.md` records the missing key; the live
   acceptance section is intentionally marked blocked rather than fabricated.
2. **Web/Tavily path not exercised.** The file-source path is implemented and tested; `research.web` remains opt-in and
   requires `TAVILY_API_KEY`, which is also missing. No web results are claimed.
3. **Voice is not in `npm test`.** The prompt explicitly excludes Kokoro from the offline test; the voice stage is
   implemented and `make_voice.py` keeps the fixture's behaviour when `script.json` is absent. The fixture audio tests
   are unchanged.
4. **The brief template is a marker.** `new` writes a `<!-- fableon:brief-template -->` brief; the brief stage drafts
   over it, while a user-written brief without the marker is kept and must be approved. This avoids overwriting a
   hand-written brief.
5. **Approval gating applies to stages that would run.** Fresh stages are skipped; the gate stops the first
   missing/stale stage whose dependency is not approved. This is the practical reading of “stop before any stage”.
6. **Prompts are provider-neutral and JSON-first.** The exact DeepSeek JSON-mode/tool caveats could not be verified
   live; the local ajv repair loop is the tested guard, as required.

## Problems and open questions

- **No live DeepSeek verification.** Ids, context/output limits, JSON-empty behavior, tool `strict` support and
  cache-hit usage fields remain unverified.
- **No live Savitri source or voice.** The Ganguli source file, facts, script, fact-check and voice length listed in
  the prompt cannot be produced without the key; the `work/savitri` project is not claimed.
- **Tavily.** The optional web-search branch is not implemented beyond the file-source path in this build; the docs
  state the requirement and the missing key.
- **Fact-check revision cache behavior.** A revision that leaves a failing line unchanged produces the same cached
  review; the mock fixture changes the line to exercise the loop. A live run should detect a no-op revision and stop
  early instead of spending the second round.
- **Voice fitting.** The ±10 % rule is implemented in the stage; no live natural duration was measured.
- **The fixture pipeline is unchanged.** `voice/make_voice.py` only reads `script.json` when present; the fixture has
  no script.json and its audio/pixels remain unchanged.

## Please look at

- `cli/src/core/`, `cli/src/models/router.js`, `cli/src/stages/` — reusable library.
- `tests/pipeline.mjs`, `tests/fixtures/pipeline/mini/`, `tests/fixtures/llm/responses.json` — offline proof.
- `docs/PIPELINE.md`, `docs/MODELS.md` — usage and the blocked DeepSeek findings.
- `work/pipe-mini/` — a real mock project with state, cache, calls log, SCRIPT.md and review (workspace only).
- `docs/ROADMAP.md` — Phase 3B carry-over list from 2F.
