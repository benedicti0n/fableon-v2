# Phase 5 report — the Fableon studio app

## Summary
The studio now runs as a local React/Vite app served by `fableon serve`: Projects and Settings, the full
Brief → Research → Script → Voice → Cast → Shot plan → Board → Animatic flow, live jobs in the Activity
panel, estimates before paid/model work, and the Phase 4 token/cookie security with a strict CSP. The
existing pipeline and the Adi Parva golden are unchanged. The user checkpoint on `work/savitri-hi`,
`work/bakasura-hi` and an editable copy was reported as **“working great”**.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `976bb9d` | `docs: phase 5 prompt` | Save the phase instructions. |
| F1 | `d22941b` | `feat(server): endpoints the studio needs` | Timeline, peaks, safe list, estimate, `script-lines`, `sayAs`, static serving and CSP. |
| — | `118e6fc` | `fix(server): serve the studio index at root` | The exact `/` route still returned identity JSON. |
| F2 | `bc8d1ca` | `feat(web): app shell, design system and live data` | Workspace, shell/rail/stepper/activity, events hook, Projects, Settings. |
| F3 | `2337cc2` | `feat(web): brief and research` | Brief editor/preview/draft, sources, web toggle, facts, estimates. |
| F4 | `cd3775e` | `feat(web): script` | Line table/editor, fact chips, craft/check badges, regenerate with note, override, approve. |
| F5 | `d9c0763` | `feat(web): voice` | Provider/voice/pace, estimate, waveform, words, pronunciations, auditions, QA. |
| F6 | `052a86e` | `feat(web): cast, shot plan and board` | Cast sheet/specs/gaps, scene timeline, moods, shot notes, board review. |
| F7 | `5110abd` | `feat(web): animatic` | Range video, shot markers, QA, per-shot re-render, approve. |
| — | `ae2e1e1` | `fix(server): serve studio assets with correct MIME types` | `.js` was octet-stream and the SPA did not boot. |
| — | `437771b` | `fix(server): create projects with the chosen voice provider` | Map the dialog's `sarvam`/`elevenlabs`/`kokoro` choice to a provider block. |
| — | `2b6973e` | `fix(web): wait for the board before re-rendering the animatic` | Per-shot note must not race the project lock. |
| — | `d1cde57` | `fix(web): restore the voice waveform and dedupe shadowed fixtures` | Load peaks once; hide fixtures shadowed by a work id. |
| — | `d106d97` | `fix(web): send shot notes straight to the board op` | The notes API only stores cast/shotplan; board notes belong to the op args. |
| — | `d223d45` | `fix(web): refresh files and timelines when a job finishes` | Screens showed stage status but stale facts/lines after a job. |
| — | `c93db43` | `fix(web): generate the first script draft` | New projects need a script action before line editing. |
| — | `3990e3e` | `fix(web): run the shot plan from the board screen` | The board needs a shot-plan action. |
| — | `c039671` | `fix(web): show routed model names and prices` | Replace the unreadable internal routing id in Settings. |
| — | `1703e90` | `fix(server): estimate every model-backed stage` | Brief/research/performance were shown as free. |
| F8 | `787205c` | `test(studio): unit, end-to-end and screenshots` | Vitest/RTL, Playwright journey, mock test providers, screenshots and `docs/UI.md`. |
| R | this commit | `docs(report): phase 5 report` | This report. |

## Acceptance checks

### 1. Existing suite plus web unit and Playwright tests

```text
$ npm test
PASS state migration + lock  12/12 checks
PASS ops + CLI events  11/11 checks
PASS server API  23/23 checks
PASS studio read models  12/12 checks
PASS validator  5/5 cases
PASS shot starts  39 anchors resolve to the old frames
PASS motion math  9/9 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

```text
$ npm run web:test
 ✓ src/hooks/useEvents.test.tsx (3 tests)
 ✓ src/components/layout.test.tsx (6 tests)
 ✓ src/components/EstimateDialog.test.tsx (2 tests)
 ✓ src/screens/Script.test.tsx (1 test)
 Test Files  4 passed (4)
      Tests  12 passed (12)
```

```text
$ npm run web:e2e
PASS studio e2e  project=the-moon-cheese-e2e
PASS token bootstrap  cookie HttpOnly  no storage  CSP active
PASS create → brief → research → script edit → script-lines → voice → timeline note → animatic
PASS live activity  mock-sleep running and cancelled
```

The e2e runs against a temp root, the mock LLM fixture and the test-only mock voice. It asserts the activity
panel changes while `mock-sleep` runs, Cancel reaches `cancelled`, and no page errors or unexpected failed
requests occur.

### 2. Build and serve; every screen

```text
$ npm run web:build
✓ built in 1.35s
dist/assets/index-N-XmS4lW.js   539.81 kB │ gzip: 164.88 kB
dist/assets/index-B7NvWA5P.css   35.27 kB │ gzip:   7.00 kB
```

`fableon serve --root work` served the app, and a Playwright pass over both real films and the copy
returned no console errors or alerts on Projects, Settings, Research, Script, Voice, Cast, Shot plan, Board
and Animatic. Screenshots were taken from `work/bakasura-hi` read-only. The editable copy
`work/checkpoint-bakasura` accepted a script-line PUT and a shot-note estimate.

### 3. Estimates, secrets, CSP

- Every paid/model action opens `EstimateDialog`; the run button is disabled until the estimate resolves.
- `BUDGET_EXCEEDED` shows a second `Confirm budget override`; only that click adds `confirmBudget: true`.
- The e2e asserts `localStorage` and `sessionStorage` are empty, the URL has no token after bootstrap, the
  `fableon_token` cookie is HttpOnly, and `/` carries `default-src 'self'`.
- API key values are write-only and never echoed; the e2e covers storage, URL and CSP, and the Phase 4
  server tests cover token handling and secret echoes.

### 4. Screenshots and checkpoint

Committed in `docs/reports/phase-5/` (1440×900, Activity panel open), using `work/bakasura-hi` read-only:

| Screen | File |
|---|---|
| Projects | `01-projects.png` |
| Settings & usage | `02-settings.png` |
| Brief | `03-brief.png` |
| Research | `04-research.png` |
| Script | `05-script.png` |
| Voice | `06-voice.png` |
| Cast | `07-cast.png` |
| Shot plan | `08-shotplan.png` |
| Board | `09-board.png` |
| Animatic | `10-animatic.png` |

The user checkpoint was: **“working great”**. No user-requested fixes followed. The fixes between F7 and F8
were found while making the app verifiable: static MIME/bootstrap, new-project voice mapping, sequential
board→animatic jobs, waveform loading, fixture shadowing, board notes, live file refetch, first-script and
shot-plan actions, estimate coverage and Settings readability.

### 5. Commit order

```text
976bb9d docs: phase 5 prompt
d22941b feat(server): endpoints the studio needs
118e6fc fix(server): serve the studio index at root
bc8d1ca feat(web): app shell, design system and live data
2337cc2 feat(web): brief and research
cd3775e feat(web): script
d9c0763 feat(web): voice
052a86e feat(web): cast, shot plan and board
5110abd feat(web): animatic
...      fix commits from the build/checkpoint
787205c test(studio): unit, end-to-end and screenshots
...      docs(report): phase 5 report
```

## Measurements

- Machine: Apple M1, macOS 26.5.2. Browser e2e on Chromium (Playwright); screenshots on Chrome because
  headless Chromium does not decode the H.264 animatic and would photograph a black player.
- WebGL renderer from the engine checks: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`.
- Web build: 539.81 kB JS (164.88 kB gzip), 35.27 kB CSS (7.00 kB gzip).
- Screenshot folder: 1.8 MB for 10 PNGs at 1440×900.
- Unit tests: 12 tests in 1.4 s. E2E: one Chromium journey including the mock cast render and board.
- Real projects used read-only: `work/savitri-hi` (739 MB) and `work/bakasura-hi` (440 MB); checkpoint
  copy 57 MB (render/audio/qa excluded).

## Deviations from the prompt

- A test-only `mock` voice provider was added so the Playwright journey can run the real voice stage without
  a paid key or Kokoro. The UI picker still offers only Sarvam, ElevenLabs and Kokoro; `mock` is schema-valid
  for the fixture and is estimated at zero.
- The F8 e2e calls the `cast`, `shotplan` and `board` op endpoints to prepare the timeline. The app has Cast
  re-run, Shot plan run and Board run buttons; the e2e keeps the timing deterministic and focuses the UI
  assertions on the journey and timeline.
- `Run shot plan` and `Generate script` were added as small fixes because the user journey could otherwise
  not move from a new project to a board from the studio alone.
- Screenshots use Chrome rather than bundled Chromium for the animatic frame (codec support).

## Problems and open questions

- The work root on this Mac contains many old test projects, so the Projects list is noisy. Archive is
  available; filtering test roots is a later product decision.
- The final-render queue/export, look and sound controls beyond the per-scene mood, autopilot presets, a
  broader cost dashboard and a desktop wrapper remain Phase 6.
- The e2e uses the documented API for stage preparation; if we want a fully click-only journey later, add a
  cast/shotplan “prepare to board” action that chains the jobs in the UI.

## Please look at

- `docs/UI.md` — start, screens, estimates, events and keyboard reference.
- `docs/reports/phase-5/*.png` — the ten screens at 1440×900.
- `tests/e2e/studio.mjs` and `tests/e2e/screenshots.mjs` — the journey and the evidence.
- `web/src/components/EstimateDialog.tsx`, `web/src/hooks/useEvents.ts`, `web/src/App.tsx` — the estimate,
  event and refetch contracts.
- `work/checkpoint-bakasura` — the writable copy used for the checkpoint.
