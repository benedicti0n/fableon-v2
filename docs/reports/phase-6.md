# Phase 6 report — finishing and production

## Summary
The studio now finishes a film end to end: world-only per-scene look, editable cue/mix controls, a cached final
render with transition composites and audio-only re-mux, the publish package (titles, description, hashtags, cover,
sidecar SRTs, export QA), presets and the production queue, and a cost ledger with budgets and the Costs dashboard.
The existing pipeline, the Adi Parva golden and the two reference films remain unchanged. The user deferred both
manual checkpoints with “continue, we will polish later”; the automated journey and the checkpoint-bakasura package
were completed instead.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `5ab9eea` | `docs: phase 6 prompt` | Save the phase instructions. |
| F1 | `4fcd051` | `fix(web): phase 5 review fixes` | Script line width/autosize, one stage frame, colliding ids, key usage + remove confirmation, lazy chunks. |
| F2 | `a6b364b` | `feat(core): final and publish stages with partial re-renders` | Final/publish stages, per-shot segment cache, transition composites, plan API, audio-only remux, BT.709, QA/lookcheck, caffeinate, disk guard. |
| F3 | `0777f34` | `feat(look): per-scene finishing look (world only)` | lookFor/applyLook, look.json schema/history, world-only grade/Halation/fog/shafts, preview stills. |
| F4 | `de43d7a` | `feat(sound): editable music, effects and mix` | Optional cue gains/mutes/seeds and mix offsets, seeded previews, byte-identical defaults. |
| F5 | `480dc5c` | `feat(web): Finish screen (look, sound, render)` | Look cards and wipe preview, sound lanes/inspector, plan strip, final player, QA and picture lock. |
| — | `a13ce84` | `fix(web): finish checkpoint polish` | Save before estimate, refresh plan, cached/dirty labels, local-estimate classification, compact wipe. |
| — | `ed7c6dc` | `fix(web): approve the edited sound stage before final` | Sound status and Approve sound after cue edits. |
| F6 | `22570c3` | `feat(publish): publishing package` | Publish model stage, validator/facts, scored covers, Devanagari/English SRTs, export profiles/QA, channel/published/override APIs. |
| F7 | `8d89a7d` | `feat(web): Publish screen and projects overview` | Publish screen, cover/title/description edits, subtitle preview, export/Finder/publish, project cards/search/test tags/bulk archive, channel settings. |
| F8 | `c77b766` | `feat(autopilot): presets and the production queue` | Built-in daily preset, library, batch create, queue persistence/controls/gates/autopilot approvals/budget stop. |
| F9 | `90f38ad` | `feat(web): Queue and presets` | Queue controls, batch dialog, preset list/edit/duplicate/delete. |
| F10 | `8a0d8e4` | `feat(costs): cost ledger, budgets and dashboard` | Ledger normalization, budgets/alerts, SVG day chart, film/stage/balance tables, CSV. |
| F11 | `5566527` | `test(studio): phase 6 journey, screenshots and docs` | Extended Playwright journey, screenshots, docs and export-QA loudness fix. |
| R | this commit | `docs(report): phase 6 report` | This report. |

## Acceptance checks

### 1. Existing suite, web unit tests and e2e

```text
$ npm test
PASS final cache plan  7/7 checks
PASS world-only finish look  4/4 checks
PASS publish package  13/13 checks
PASS production queue  8/8 checks
PASS cost ledger  7/7 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

```text
$ npm run web:test
Test Files  4 passed (4)
     Tests  12 passed (12)
```

```text
$ npm run web:e2e
PASS studio e2e  project=the-moon-cheese-e2e
PASS token bootstrap  cookie HttpOnly  no storage  CSP active
PASS create → brief → research → script edit → script-lines → voice → timeline note → animatic
PASS live activity  mock-sleep running and cancelled
PASS finish → final → publish → export  cover and hi SRT in the package
PASS costs  threshold banner from a tiny monthly cap
```

The e2e also asserts that the export package contains no token or `sk-` secret. The main bundle is 436 kB
(139 kB gzip) with per-screen chunks; no chunk-size warning.

### 2. Identity

- Checkpoint-bakasura audio was rebuilt with `fableon audio`: `sha256 7d81056f58560ce95f6c98f579856b0e6261592fe152838eded348803717e7a7`,
  byte-identical to `work/bakasura-hi/audio/mix.wav`.
- The new final is **1958 frames / 65.2667 s**, matching the original.
- PSNR against `work/bakasura-hi/final.mp4` on 20 evenly spaced frames: **49.84 dB average** (min 47.74, max 52.48;
  target ≥ 45 dB).
- The plan afterwards reports **0 frames to render**; all shot and transition segments cached.
- No look.json reconstruction of the compiled shot look is byte-identical via `lookFor(..., null)`; the Adi golden
  remains max 0.107.

### 3. Partial renders and character protection

- `tests/final.mjs`: unchanged inputs → 0 dirty; one scene's look → only that shot segment dirty; cues-only → audioOnly
  with 0 frames; engine id change → every segment dirty.
- Extreme look: mean |diff| **0.16/255** inside the eroded character mask, **43.33/255** in the world. The test runs
  all six controls at their extremes at 720×1280.
- A full final at 1440×2560 took **383.8 s** on the M1 during the F2 proof; the final assembly is frame-exact and
  re-encodes once.

### 4. Publishing package

Checkpoint-bakasura generated a real package with the routed publish model:

- validator: **0 errors**, fact flags: **0**;
- `publish/cover.jpg`: **1080×1920**, 179 KB;
- `subtitles.hi.srt` 15 cues and `subtitles.en.srt` 10 cues, both parse and validate monotonic inside 66 s;
- `exports/2026-11-19-checkpoint-bakasura/` has `youtube-short.mp4` (1440×2560), `reels.mp4` (1080×1920),
  `cover.jpg`, both SRTs, `publish.md`, `publish.json` and `export-qa.md`;
- export QA: **All checks passed** — 30 fps, 48 kHz, BT.709, faststart, **-14.0 LUFS**, true peak **-1.3 dBTP** for
  both profiles.

The e2e separately exercises the fact-flag block/override path with the mocked publish response.

### 5. Queue and autopilot

Automated checks cover preset discovery, batch creation, collision-safe ids, the low–high estimate, persistence across
a restart, start/pause and removal. The queue runs one stage per job, waits at gates, records `by: "autopilot"` for
non-gate approvals and persists `.fableon/queue.json`.

**Checkpoint 2 was not run.** The user asked to continue and polish later, so the daily short, its real queue gate
walkthrough and spend-vs-estimate table are still open. Hard-stop unit coverage is partial (budget/job failure logic is
implemented but not every stop has a dedicated test). These are the main remaining gaps.

### 6. Costs

`tests/costs.mjs` asserts ledger totals equal row sums, provider aggregates equal the total, fees produce the effective
spend, thresholds fire once per month, and the CSV has the expected columns with no secret/prompt text. The e2e crosses
a tiny monthly cap and sees the shell budget banner. Provider balances are wired to the existing balance checks;
Sarvam is manual in budgets.

### 7. Secrets and CSP

The e2e asserts the HttpOnly cookie, empty localStorage/sessionStorage, no token in URLs after bootstrap, CSP on `/`,
and no token or key in the export package. The ledger/CSV never includes prompt text or key values.

### 8. Commit order

`5ab9eea` → F1 `4fcd051` → F2 `a6b364b` → F3 `0777f34` → F4 `de43d7a` → F5 `480dc5c` → checkpoint fixes
`a13ce84`, `ed7c6dc` → F6 `22570c3` → F7 `8d89a7d` → F8 `c77b766` → F9 `90f38ad` → F10 `8a0d8e4` → F11
`5566527` → this report.

## Measurements

- Apple M1, macOS 26.5.2; Playwright Chromium for the e2e and Chrome channel for screenshots (H.264).
- Web build: 436.09 kB main JS (138.56 kB gzip), 38.36 kB CSS (7.52 kB gzip), per-screen lazy chunks.
- Screenshots: 11 PNGs, 1.4 MB, 1440×900, in `docs/reports/phase-6/`.
- Checkpoint-bakasura package: 183 MB youtube-short + 41 MB reels + 179 KB cover.
- Final proof: 1958 frames / 65.2667 s, PSNR 49.84 dB, 0 frames to render after.
- No new runtime dependencies beyond the Phase 5 stack; the cost charts are inline SVG.

## Deviations from the prompt

- Both manual checkpoints were deferred by the user. The Finish/Publish/Queue/Costs journey is covered by the e2e and
  the checkpoint-bakasura package; checkpoint 2 is not done.
- The publish fact pass is a deterministic token-overlap check against verified facts and the factchecked script, not a
  second model call on the factcheck route. It exercised the blocking path in the e2e.
- Cover candidates are scored from one steady frame per board shot (three candidates on three-shot films), not one per
  key; the top six are kept.
- `ambienceDb` is stored in the mix block but the current cue sheets have no ambience lane; the other four offsets are
  honoured. This is a visible follow-up for Phase 7.
- `fableon run` now defaults to `animatic` (the phase requires it); explicit `--to` values are unchanged.
- A test-only final size (`FABLEON_FINAL_SIZE`) and the mock voice keep the e2e short; production defaults are unchanged.

## Problems and open questions

- Checkpoint 2: pick the topic, run the daily preset through the queue, and fill the per-stage wall time / machine
  minutes / spend table.
- Queue hard-stop tests: add dedicated tests for QA failure, fact flags, `DISK_LOW`, provider exhaustion and the 100%
  budget pause.
- Publishing for checkpoint-bakasura used the real routed model; checkpoint 2 still needs its own package.
- Provider balances were still loading when the Costs screenshot was taken; the code path is live, the API may be slow
  or keyless.
- Long-form 16:9, direct upload, new sets/characters and the licensed SFX library remain later phases.

## Please look at

- `docs/reports/phase-6/` — eleven screens.
- `docs/PUBLISHING.md`, `docs/COSTS.md`, `docs/PIPELINE.md` and `docs/UI.md`.
- `work/exports/2026-11-19-checkpoint-bakasura/` — the real package and `export-qa.md`.
- `tests/final.mjs`, `tests/look-finish.mjs`, `tests/publish.mjs`, `tests/queue.mjs`, `tests/costs.mjs` and
  `tests/e2e/studio.mjs`.
- `work/checkpoint-bakasura/final.mp4` and `publish/cover.jpg`.
