# Fableon Studio

The studio is the local browser UI for stages 1–8 of a Fableon film: Brief, Research, Script, Voice,
Cast, Shot plan, Board and Animatic. It is a client of the documented API only and runs on the same Mac as
the server. The interface is English; briefs, scripts and narration stay in the project language. Hindi uses
Noto Sans Devanagari.

## Start

```bash
npm install
npm run web:build          # writes web/dist, served by the API server
npx fableon serve --root work --open
```

`fableon serve` prints a one-time token URL, for example:

```
http://127.0.0.1:4317/?token=…
```

Open that URL. The first request sets an HttpOnly, SameSite=Strict cookie and redirects to `/`. The token is
never read by the app, never written to localStorage or sessionStorage, and never put back into a URL. The
WebSocket uses the same-origin cookie. The server sends a strict CSP: no CDN fonts, scripts, analytics or other
external calls are made by the page.

Use `--port 4317` to choose a port and `--root work` to choose the project root. `fableon serve --dev` also
accepts the Vite development origin; do not use it for normal work.

## Screens

| Screen | What it does |
|---|---|
| **Projects** | Work projects and read-only fixtures. Create a project (topic, seconds, language, voice provider), open it, archive work projects. |
| **Brief** | Markdown editor and preview. `Draft with AI` runs the brief stage after an estimate; `Save` writes `brief.md`; `Approve` locks the stage. |
| **Research** | Drag/drop or choose `.md`, `.txt`, `.html` sources, toggle web search (shows whether `TAVILY_API_KEY` is set), run research with an estimate, inspect verified/unusable facts, approve. |
| **Script** | Generate the first draft (when absent), edit a line inline, select lines and regenerate with a director note, run fact-check, override a factual flag with a required reason, approve. Delivery marks and fact chips are inline; the header shows words vs the delivered-rate budget and pronunciation TODOs. |
| **Voice** | Provider/model/voice, pace and fit; run voice after an estimate; waveform from `/peaks` with word-level seek, per-line play and loop; pronunciation editor including `sayAs`; auditions and pace variants; voice QA; approve. |
| **Cast** | Cast sheet, character specs and swatches, `mustHave` traits, asset gaps with stand-ins, director notes and a cast re-run, approve. |
| **Shot plan / Board** | Timeline over the voice waveform with scenes coloured by mood, key ticks, a per-scene mood selector that edits `shotplan.json`, shot thumbnails, board findings, per-shot notes, `Run shot plan`, `Run board`, look-dev, both approvals. |
| **Animatic** | Range video player with shot markers from `/timeline`, click-to-jump, animatic QA with pass/warn badges, a per-shot note that re-runs the board shot and then the animatic, approve. |
| **Settings** | Write-only API keys, per-stage model routing and project overrides, usage by provider/stage/day, doctor checks. |

A project with `readOnly: true` (a fixture) shows a `fixture · read-only` badge; edit, run and approve controls
are disabled.

## Paid actions and estimates

Every action that can spend money or start a long local render opens an estimate first. The dialog shows the
provider, calls, characters, estimate in USD (and INR for Sarvam) and notes. Paid actions need an explicit
confirmation. If the server returns `BUDGET_EXCEEDED`, a second `Confirm budget override` click is required
and `confirmBudget` is only sent by that second click.

## Activity and live state

The right Activity panel lists queued/running/recent jobs for the project. Each job shows progress, ETA, the
current step and the log tail. Running jobs can be cancelled; interrupted resumable jobs (render/final/animatic)
show Resume. The panel can be collapsed with the × and reopened from the Activity button.

The app subscribes to `/api/events` with a WebSocket, reconnects with backoff, and falls back to SSE. `status`
and terminal `job` events invalidate the project, stage, job, file, timeline, peaks and list queries; duplicate
terminal `(job, status)` events are ignored. Focusing the window also refetches the project and stages.

## Keyboard and focus

- `Tab` / `Shift+Tab`: move through links, controls, editors and the Activity list.
- `Enter` / `Space`: activate the focused button, link, checkbox or switch.
- `↑` / `↓` / `Home` / `End` in a select: choose an option; `Enter` confirms and `Esc` closes.
- `Esc`: close a dialog, the New project dialog, the estimate or a select.
- Native media controls in the voice/animatic players provide Space (play/pause) and arrow-key seeking.
- Focus is always visible as an amber outline. There are no custom single-key shortcuts in this phase.

## Develop and test

```bash
# One terminal: API on 4317
npx fableon serve --root work --dev

# Another terminal: Vite on 5173, /api proxied to 4317
npm run web:dev

npm run web:test            # Vitest + React Testing Library
npm run web:e2e             # Playwright against a temp server, mock LLM, mock voice
npm run web:screens         # 1440×900 screenshots in docs/reports/phase-5/
npm test                    # engine, CLI, server, studio, golden and audio checks
```

The e2e uses a test-only `mock` voice provider, a deterministic tone with word timings, so the real voice
stage and timeline can be exercised without a paid key or the Kokoro model. It is not offered in the studio's
provider picker.

## Limits in this phase

The final render queue and export, look/sound controls beyond the scene mood, autopilot presets, a wider cost
dashboard and a desktop wrapper are Phase 6 work. The studio deliberately edits `shotplan.json` and then
re-runs the deterministic board rather than editing `board.json`.

## Phase 6 screens

- **Finish** (step 9): per-scene look cards (mood, exposure, warmth, glow, haze, shafts, vignette) with a before/after
  look preview; sound timeline with voice waveform, music, stingers and SFX, click-to-add/drag, keyboard move/delete,
  gain/seed inspector and one-effect preview; mix sliders and Rebuild mix; final segment strip, plan, estimate, player
  with A/B and final QA. `Save look`/`Save cues` must be pressed before Render final; edited cues leave the sound stage
  unapproved, so use **Approve sound** before final.
- **Publish** (step 10): generate the package, pick one of five titles, edit description/hashtags/tags/pinned comment
  with Copy buttons, choose a cover candidate/template and recompose, preview subtitles against the final, review the
  fact flags/checklist, export profiles, reveal the latest export in Finder and record a manual publish.
- **Queue**: batch from a preset, drag reorder, Start/Pause after current/Pause now, waiting-item links to the gate
  stage, retry/remove and spend vs estimate.
- **Presets**: built-in and user presets, duplicate, edit gates/budget/profiles, delete user presets.
- **Costs**: month picker, spend/effective/budget left/forecast/per-film/per-minute/cache tiles, stacked day chart
  with a table, stage/film tables, provider balances, CSV and budget editor.
- **Projects**: cover/status/duration/ten stage dots/spend cards, search/status filter, hide test projects, mark test,
  bulk archive. New project has a Style dropdown with a sample frame; the project header repeats it. After cast approval
  the change asks to confirm a rerun from cast.
- **Settings -> Styles**: ready/not-ready packs, sample frames, **Check** (contract plus a preview/final test still) and
  **Add from a skill folder** or a git URL. Imports are text only; `PORTING.md` lists the remaining porting tasks.
- **Settings**: channel profile used only by the publish prompt; API keys, routing, usage and doctor remain.

Keyboard: the same Tab/Enter/Escape conventions as Phase 5. On the Finish sound lane, select an SFX marker and use
Left/Right to move one word, Shift+Left/Right to move one frame, and Delete/Backspace to remove it. Ctrl/Cmd+C is not
overridden; the Copy buttons use the clipboard API.
