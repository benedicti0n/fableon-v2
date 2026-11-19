# Phase 4 report

## Summary

The CLI library is server-ready: raw-byte hashing with a v1→v2 state migration, stable FableonError codes, one event
schema, stage progress and a per-project write lock. A local Fastify API now exposes every CLI action through a shared
operations registry, runs heavy work as isolated child jobs with NDJSON events over WebSocket/SSE, persists and cancels
jobs, serves artifacts with HTTP Range, keeps approved outputs read-only, and reports models, voices, usage and budget
guards. `fableon serve` is 127.0.0.1-only with a per-launch token, Host/Origin/traversal defences and write-only keys.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `30396d8` | `docs: phase 4 prompt` | The phase brief. |
| F1 | `63eb11b` | `refactor(core): server-ready library` | Errors, event schema, raw-byte hashes + v2 migration, progress, write lock. |
| F2 | `1f049e4` | `feat(cli): operations registry and NDJSON events` | Shared ops, `fableon ops --list --json`, stdout events / stderr human output, SIGTERM. |
| F3 | `a2dd4ad` | `feat(server): server skeleton and security` | `@fableon/server`, `fableon serve`, token/Host/Origin, health/doctor/settings. |
| F4 | `d22c0e5` | `feat(server): projects, stages and artifacts` | Projects/stages/approvals/notes, Range files, editable allowlist + history, uploads. |
| F5 | `71ba991` | `feat(server): jobs and live events` | Child jobs, one heavy/one writer, persistence/resume, WebSocket + SSE, cancel. |
| F6 | `ccfb5df` | `feat(server): models, voices, usage and budgets` | Routing/prices/keys, live/cached voices + credit, usage, budget guard. |
| F7 | `731638f` | `feat(server): integration tests, OpenAPI, demo and queue polish` | 23 HTTP checks, OpenAPI 3.1, API docs, demo, per-day usage, light/heavy queue polish, CLI and API write-lock hooks. |
| F7 | this commit | `docs(report): phase 4 report` | This report. |

Dependencies added in F3, with the reason in its body: `fastify@5.12.8`, `@fastify/websocket@11.3.7`,
`@fastify/multipart@10.1.9`. No other new dependencies.

## Acceptance checks

**1. npm test green, golden <= 1.0, Adi audio unchanged.**

```
PASS state migration + lock  12/12 checks
PASS ops + CLI events  11/11 checks
PASS server API  23/23 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

The existing 39-still golden and audio duration/loudness checks are unchanged; the event/migration/server tests run
offline with the mock provider and a fake heavy op.

**2. `fableon serve` and the demo.**

```
$ fableon serve --root work
http://127.0.0.1:4317/?token=…
```

`GET /api/health` with the bearer token returns `{ok:true,…}`; without it returns `401`. The demo starts a temp-root
server, creates a mock project, uploads `moon.md`, runs to factcheck as a job, prints WebSocket stage/progress/job
events, approves, PUTs `script.json` and prints `factcheck after edit stale`:

```
demo: job done
demo: factcheck after edit stale
demo: PASS
```

**3. Status timing and migration.**

On a copy of `fixtures/savitri-hi` with a synthetic v1 state, five-run minima for the whole stage table:

| | v1 text hashing | v2 raw-byte + memo |
|---|---:|---:|
| Savitri status (all stages) | **206.93 ms** | **3.81 ms** |

The migration test builds a v1 state for both `fixtures/savitri-hi` and `fixtures/bakasura-hi` (v1 hash + output hash
+ approval), compares every `status` and `approved` before and after `migrateState`, then exercises `loadState` writing
v2. `PASS state migration + lock 12/12`; no status or approval changed. The lock test rejects a live second writer with
`PROJECT_LOCKED` and reclaims a dead-pid lock.

**4. Every user-facing action is an op.**

`fableon ops --list --json` returns 23 entries: `run`, `approve`, `cast`, `shotplan`, `board`, `render`, `audio`,
`assemble`, `qa`, `animatic`, `final`, `lookdev`, `lookcheck`, `review`, `stills`, `voice-audition`, `voice-pace`,
`voice-budget`, `clean`, `usage`, `models-check`, `models-catalog`, `doctor` (plus test-only `mock-sleep`). Each has
`kind`, `heavy`, `cancellable`, `argsSchema` and `outputs`; `POST /api/projects/:id/ops/:op` validates args and starts
the same CLI child with `--events ndjson`. Progress is emitted at model calls, board shots, cast/sound sections, voice
and animatic/render segments; render reports frames done/total/ETA every second.

**5. Commit order.**

`git log --oneline 30396d8..HEAD` shows F1 → F2 → F3 → F4 → F5 → F6 → F7, with this report last.

## API surface

The full endpoint list and schemas are in `server/openapi.json` and `docs/API.md`. Groups:

- **Security/settings:** `GET /api/health`, `GET /api/doctor`, `GET/PUT/DELETE /api/settings/keys[/:name]`.
- **Projects:** list/create, `GET/PATCH /api/projects/:id`, archive, stages, approve, notes, run, ops.
- **Artifacts:** `GET/PUT /api/projects/:id/files/*path` (MIME + Range), multipart `/sources`, `/history`,
  `/history/restore`.
- **Jobs/events:** `/api/jobs`, `/api/jobs/:id`, `/api/jobs/:id/cancel`, `/api/events` (WebSocket),
  `/api/events/sse`.
- **Models/voices/usage:** `/api/models`, `/api/models/check`, `/api/voices`, `/api/usage` (with `byDay`).

The event schema has `ts`, `type` (`job|stage|progress|log|artifact|status|budget|error`), `project`, `job`, `stage`,
`op`, `step`, `done`, `total`, `etaMs`, `status`, `message` and `data`. Job statuses are
`queued|running|done|failed|cancelled|interrupted`; stage statuses are `missing|fresh|stale|edited|approved|failed|running`.
Approved outputs return `APPROVED_LOCKED` (403); concurrent writers return `PROJECT_LOCKED` (409); the budget guard
returns `BUDGET_EXCEEDED` (409) with a `budget` event.

## Security evidence

The 23/23 HTTP test covers:

- no token → 401; a foreign `Host` → 403; a foreign `Origin` → 403; encoded traversal → 400;
- a key written through `PUT /api/settings/keys/TAVILY_API_KEY` never appears in the response, `GET /api/settings/keys`,
  or `jobs.jsonl`; the test restores the user's `.env`;
- fixtures are read-only; approved outputs stay read-only; editable files are schema-validated and backed up;
- a Range request returns `206` with `content-range` and the exact bytes;
- a second writer gets `409 PROJECT_LOCKED`; cancel ends `cancelled`; a running job left in `jobs.jsonl` becomes
  `interrupted` and `resumable` on the next manager;
- the WebSocket receives stage/progress events for a real mock job.

## Measurements

- macOS 26.5.2 (25F84), Apple M1, 8-core CPU / 7-core GPU, Node **v25.9.0**, WebGL renderer unchanged from Phase 3F.
- Full `npm test` wall time is dominated by the existing golden/stills suite; the new server suite is a few seconds
  (mock provider, no Chromium/network). The server itself is idle-waiting for HTTP when not running jobs.
- Status table: **206.93 ms → 3.81 ms** (five-run min) on the Savitri fixture copy; the memo key is
  `(path,size,mtimeMs)` and binary inputs are hashed as bytes.
- The server process is small; jobs are child processes, so Chromium/Python/ffmpeg memory is released with the child.
- Disk: the server stores only `.fableon-server/jobs.jsonl` and per-job logs under `--root`; no media copies.

## Deviations from the prompt

- `GET /api/doctor` runs doctor synchronously and returns its checks; F5's job queue could make it a light job later.
  The endpoint is quick and read-only, so the demo/tests do not depend on a job.
- `GET /api/voices` calls ElevenLabs' account/voice and subscription endpoints only when the key is set, with a 5 s
  timeout and a 60 s memory cache; offline it returns the static Sarvam/Kokoro lists and a "set the key" credit note.
  Audition discovery remains an explicit paid op.
- The job manager emits both the child's terminal `job` event and its own terminal `job` event (same id/status); that
  is useful for clients that missed the child line but the UI should de-duplicate by `(job,status)`.
- A light job can run beside a heavy job only on a different project; any second writer on the same project gets
  `PROJECT_LOCKED`, as required.
- `GET /api/usage` returns the existing `fableon usage` project/stage/model rows plus `byDay`; provider balance reads
  remain the optional live checks from `fableon usage`.

## Problems and open questions for Phase 5 (UI)

1. **Polling vs events.** `GET /stages` is cheap after the v2 cache, but the UI should subscribe to `/api/events` for
   progress and treat the `status` event after a job as a refresh hint rather than recomputing on every event.
2. **Board/look editing.** The API PATCHes project-level default `look`, but per-shot mood is in the board/storyboard.
   Phase 5 needs either a board-editor endpoint or a UI that edits `board.json` through the history-safe file PUT
   (currently `board.json` is not in the editable allowlist because the board stage owns it).
3. **Token bootstrap.** The first visit sets the HttpOnly cookie and redirects to `/`; the UI should never put the
   token in localStorage or a URL after the first navigation.
4. **Audition/paying ops.** The UI should show `GET /api/voices` credit and `GET /api/usage` estimates before starting
   `voice-audition`; the generic budget guard only knows `project.budget.maxUsd` / `providers`.
5. **Resume UX.** `render`, `final` and `animatic` are marked resumable after restart; the UI needs a "resume" button
   that reruns the op (the renderer itself skips existing segments).
6. **Event terminal duplication.** De-duplicate terminal job events by id/status.

## Please look at

- `docs/API.md`, `server/openapi.json`
- `server/src/server.js`, `server/src/security.js`, `server/src/jobs.js`, `server/src/artifacts.js`
- `cli/src/core/errors.js`, `cli/src/core/events.js`, `cli/src/core/state.js`, `cli/src/core/ops.js`
- `tests/state.mjs`, `tests/events.mjs`, `tests/server.mjs`
- `server/scripts/demo.mjs` (run: `node server/scripts/demo.mjs`)
- `work/demo-phase4.log` (the recorded demo run)
