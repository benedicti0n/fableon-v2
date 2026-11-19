# Phase 5 — The Fableon studio app (stages 1–6)

## User decisions
- English interface (scripts and narration stay in the project's language; Hindi must render correctly).
- Dark "studio" look, like a video editor: calm dark surfaces, the warm amber of the films' golden glow as the accent.
- A local app served by `fableon serve` on this Mac, one user, the Phase 4 token/cookie security. No external network calls from the browser: no CDN fonts, scripts or analytics.
- Both films were rated 9/10. The app must reproduce the workflow that made them, not change the pipeline.

## Answers to the Phase 4 open questions
1. Events vs polling: the app subscribes to /api/events (WebSocket, SSE fallback, auto-reconnect) for progress and treats `status`/terminal `job` events as refresh hints; it refetches the stage table only then (and on focus). De-duplicate terminal job events by (job, status).
2. Per-sd and look: edit `shotplan.json` (already editable) through the app; the board becomes stale and is re-run deterministically. No direct board.json editing in this phase.
3. Token: the first visit sets the HttpOnly cookie and redirects to `/`; the app never reads, stores or puts the token in localStorage, sessionStorage or a URL; WebSocket uses the same-origin cookie.
4. Paid ops (voice runs, auditions, model stages): the app always shows an estimate first (F1 `estimate`) and the live credit meter, and needs a click to confirm; `confirmBudget` only after an explicit second confirmation.
5. Resume: interrupted resumable jobs (render, final, animatic) show a Resume button that reruns the op (segments already rendered are skipped).
6. Terminal duplication: handled by the de-duplication in 1.

## Ground rules
- npm test green (golden <= 1.0, Adi audio unchanged); every CLI command and API behaviour from Phase 4 unchanged unless extended here.
- The app is a client of the documented API only; types are generated from server/openapi.json (no hand-written duplicates). Any new endpoint is added to openapi.json and docs/API.md in the same commit.
- Dependencies: React + Vite + TypeScript, Tailwind CSS, accessible primitives (Radix-based components committed in the repo), TanStack Query, React Router, openapi-typescript for types, wavesurfer.js (or an equivalent) for the waveform, fonts bundled locally (Inter + Noto Sans Devanagari). Justify each in the commit body; nothing else without justification.
- Accessibility: keyboard reachable, visible focus, labelled controls, WCAG AA contrast in the dark theme.

## Features (one commit each, in this order)

### F1  feat(server): endpoints the studio needs
- GET /api/projects/:id/timeline: resolved times (seconds and frames) for scenes (mood, light, transition), shots and keys (size, move, subjects, marks, punch/impact flags), script lines with words (from words.json), needsHuman shots and their findings; built with the existing anchor resolution and compiler code.
- GET /api/projects/:id/peaks?path=voice.wav|audio/mix.wav|audio/stem_*.wav: waveform peaks JSON (computed once with ffmpeg, cached by file hash).
- GET /api/projects/:id/list?dir=: safe directory listing for an allowlist (stills/, cast/, voice/auditions/**, voice/pace/, review/, qa/) with names, sizes, mtimes and media types.
- POST /api/projects/:id/estimate {op, args}: before running, return {provider, calls, characters, cachedCharacters, usd, inr?, notes}. Voice ops compute characters from the lines that would really be synthesized (cache hits excluded); model ops use the routing table and the project's recent stage usage; render/animatic return frame counts and a time estimate from recent jobs.
- New op `script-lines` {project, lines: [n], notes}: rewrite only those lines with the routed script model, honouring the notes and the script checks; other lines byte-identical; factcheck becomes stale; respects APPROVED_LOCKED (needs force from a non-autopilot request).
- `pronunciations.json` entries may carry `sayAs` (a respelling); every voice provider substitutes it before synthesis, while words.json keeps the original word. Tests for Sarvam and ElevenLabs request bodies (mocked).
- Serving the app: the server serves web/dist at / with an SPA fallback for non-/api paths, plus a strict CSP (default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:<port> ws://localhost:<port>; no inline scripts). `fableon serve --dev` additionally accepts the Vite dev origin for development only.

### F2  feat(web): app shell, design system and live data
- New workspace `web/`; `npm run web:dev` and `npm run web:build`; the build output is served by `fableon serve`.
- Design tokens (dark studio): surfaces ~#0f1115 / #151922 / #1c212b, text ~#e7e9ee / #a3a9b6, accent amber ~#f5a524, teal secondary, and status colours: missing grey, running blue (animated), fresh green, stale amber, edited violet, approved green with a lock icon, failed red.
- Inter for UI, Noto Sans Devanagari for Hindi text.
- Layout: a left rail (projects + settings), a project header with a stage stepper (Brief → Research → Script → Voice → Cast → Shot plan → Board → Animatic) showing each stage's status, the main stage screen, and a collapsible right Activity panel (live jobs with progress bars, ETA, log tail, Cancel, Resume).
- Live data: a typed API client generated from openapi.json, TanStack Query, and one events hook (WebSocket with backoff reconnect, SSE fallback, de-duplication, per-project subscription).
- Error UX: FableonError codes map to clear messages and next actions (WAITING_APPROVAL → "Approve <dep> first" with a button; APPROVED_LOCKED → "Approved and locked — unlock by re-running with force"; PROJECT_LOCKED → "Another job is writing this project"; BUDGET_EXCEEDED → the estimate and a confirm dialog).
- Screens in this commit: Projects (work projects; fixtures read-only), New project dialog (topic, seconds, language, voice provider), archive; Settings (API keys set/unset with write-only inputs; per-stage model routing with project overrides; usage by provider/stage/day; doctor checks).

### F3  feat(web): brief and research
- Brief: markdown editor with preview, "Draft with AI" (run brief), save (PUT), approve.
- Research: source list with drag-and-drop upload (.md/.txt/.html), the web-search toggle (project PATCH; shows whether TAVILY_API_KEY is set), run with estimate, facts table (claim, source, quote, supports/verified badges, filter to usable facts), approve.

### F4  feat(web): script
- Line table: n, beat chip, the line text (project language, Devanagari font for Hindi), English gloss, fact chips (hover shows claim and quote), fact-check verdict and craft badges, delivery marks (pauses/emphasis shown inline), the look hint.
- Actions: edit a line inline (PUT script.json, schema errors shown at the line); select lines → "Regenerate with note" (script-lines op, estimate first); run fact-check; override a factual flag with a required reason; approve.
- Header: word count vs budget, estimated duration from the voice's delivered rate, normaliser notes, pronunciation TODOs.

### F5  feat(web): voice
- Provider, model and voice selection (PATCH project voice) with the live voice list and credit meter; pace and fit settings.
- Run voice with an estimate (characters to bill, cached lines) and confirmation.
- Player: waveform from peaks, word-timeline highlighting the current word, click a line or word to seek, play just one line, loop a selection.
- Pronunciation editor (pronunciations.json, including sayAs), with "re-voice the affected lines" (estimate first).
- Auditions and pace variants: list from /list, side-by-side players, "use this" writes the choice (voice-pace choose / project PATCH).
- Voice QA: render voice-qa.md (silence %, pauses, clipping, bandwidth) with pass/warn badges. Approve.

### F6  feat(web): cast, shot plan and board
- Cast: the cast sheet image, a character list (name, colour swatches from the spec, mustHave traits), asset gaps with stand-ins, a notes box → re-run cast, approve.
- Shot plan and board timeline: a horizontal timeline over the voice waveform showing scenes (coloured by mood), shots and keys with times from /timeline. Per scene: a mood selector (warm-side / golden-glow / dusk / night-moon / noon) that edits shotplan.json. Per shot: a thumbnail (stills op on demand, listed via /list), size/move/subjects, board review findings (needsHuman highlighted), and a notes box → `board` op with {shot, notes}. Approve the shot plan; run the board.
- Look-dev: a button to render the look-dev sheet for the project and show it.

### F7  feat(web): animatic
- Video player (Range) with shot markers on the scrubber (from /timeline), click a marker to jump; the QA summary (animatic-qa.md) with pass/warn badges; per-shot notes → re-run that shot and re-render only its segment (board op with shot, then animatic); approve.

### USER CHECKPOINT (after F7)
Start `fableon serve`, STOP and ask the user to try the app on work/savitri-hi and work/bakasura-hi (browse everanimatic, try a script line edit on a COPY project, try a shot note). Collect their feedback. Fix small issues now (each as a fix commit); list bigger ones for Phase 6.

### F8  test and docs
- Vitest + React Testing Library for components (status stepper, events hook de-duplication and reconnect, error mapping, script line edit, estimate dialog).
- Playwright end-to-end tests against a temp server with the mock provider and the fake heavy op: create a project → upload a source → run research → approve → edit a script line → regenerate a line with a note (mock) → run voice (mock) → open the timeline → add a shot note → open the animatic page. Assert the live progress UI and that no token ever appears in localStorage, sessionStorage or any URL after bootstrap.
- Screenshots of every screen at 1440×900 (and the Activity panel open) in docs/reports/phase-5/, using the real work/bakasura-hi project read-only where possible.
- docs/UI.md (how to start, each screen, keyboard shortcuts) and docs/reports/phase-5.md per the template (screens, endpoints added, tests, the user's checkpoint feedback and what was fixed, the Phase 6 list).

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, Adi audio unchanged) plus the web unit tests and the Playwright e2e.
2. `npm run web:build && fableon serve` serves the studio; every screen in this phase works against work/bakasura-hi and work/savitri-hi (read paths) and a copy project (write paths).
3. Paid actions always show an estimate and need confirmation; no secrets or tokens in the bundle, storage or URLs; CSP active.
4. Screenshots committed; the user's checkpoint feedback recorded with what was fixed.
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F8 in order (fix commits from the checkpoint between F7 and F8).

## Out of scope (Phase 6)
The final-render queue and export, look and sound controls beyond the scene mood, autopilot presets, cost dashboards beyond Settings → usage, a desktop wrapper.
