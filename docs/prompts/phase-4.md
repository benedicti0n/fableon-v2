# Phase 4 — Backend API (local server for the pipeline)

## Decisions (user defaults)
- A local web app on this Mac, used by one person. No accounts. The server binds to 127.0.0.1 only and is protected by a per-launch access token.
- The CLI and the server share ONE stage registry, ONE operations registry and ONE state; the CLI keeps working exactly as today.
- Long or heavy work runs in child processes (isolation: Chromium, Python, ffmpeg); quick reads run in-process.

## Why (architect review of cli/src/core)
1. computeHash reads every input file with readFileSync(p, 'utf8'), including binary voice.wav / mix.wav. Every status call re-reads tens of MB, and binary decoded as UTF-8 can collapse different bytes to U+FFFD, so two different takes could hash alike in theory. A server will poll status constantly.
2. Errors are plain message strings ("waiting for … approval", "approved and read-only", "cancelled"); a UI needs stable error codes.
3. Progress is only "stage start" (progress 0)mplete"; voice lines, board shots, animatic segments and render frames are not reported.
4. Several operations live only as CLI commands (cast/shotplan notes, board --shot, lookdev, lookcheck, review, stills, voice audition/pace/budget, final render + assemble + qa, clean, usage, models check). The UI must reach all of them.

## Ground rules
- npm test stays green (golden <= 1.0, Adi audio unchanged); every existing CLI command behaves as before.
- Library modules never print or call process.exit; commands do the printing.
- Keys are never returned, logged or included in events or errors.
- New dependencies only where justified in the commit body (a small HTTP framework with WebSocket, multipart and static/range support is fine, e.g. Fastify + its official plugins).

## Features (one commit each, in this order)

### F1  refactor(core): server-ready library
- Structured errors: a FableonError(code, message, details) used across core and stages. Codes at least: WAITING_APPROVAL {stage, dep}, EDITED_OUTPUT {stage}, APPROVED_LOCKED {stage}, CANCELLED, STAGE_FAILED {stage}, VALIDATION {schema, errors}, BUDGET_EXCEEDED {provider, limit}, NOT_FOUND, PROJECT_LOCKED {by}, BAD_REQUEST. The CLI prints them as today.
- One event schema (schema/event.schema.json): {ts, type: job|stage|progress|log|artifact|status|budget|error, project, job?, stage?, op?, step?, done?, total?, etaMs?, message, data?}. Stages report progress through ctx.progress({step, done, total}): research/script/factcheck/shotplan per model call; voice per line or request; cast per character; board per shot; sound per section; animatic, render and final per segment and per frame (the render workers already know frames done/total and ETA).
- Fast, correct hashing: hash input files as raw bytes, memoised by (path, size, mtimeMs) in-process. State schema v2 with a migration: on first load of a v1 state, recompute each stage's v1 hash; if it matches what v1 stored, carry status and approval over to the new v2 hash. Test on copies of fixtures/savitri-hi and fixtures/bakasura-hi: every status and approval is identical before and after the migration. Measure `status` time before/after on Savitri.
- Per-project write lock (.fableon/lock with pid, op and start time; stale-lock detection when the pid is dead). Every writing operation takes it; reads never do.

### F2  feat(cli): operations registry and NDJSON events
- An operations registry (cli/src/core/ops.js): every user-facing action as {name, description, kind: stage|job, heavy: bool, cancellable: bool, argsSchema (JSON Schema), outputs}. It covers at least: run (to/only/force/autopilot/noCache), approve (including the factcheck override with a reason), cast notes, shotplan notes, board shot rerun with notes, voice audition, voice pace, voice budget, lookdev, lookcheck, review, stills, final (render at final quality → assemble → qa → lookcheck as one op with sub-steps), clean (dry run and real), usage, models check/catalog, doctor.
- `fableon ops --list --json` prints the registry. Every long command accepts `--events ndjson`: events (schema/event.schema.json) on stdout, human text on stderr, exit code 0/1 with a final {type: "job", status: "done"|"failed"|"cancelled", error?} event.
- SIGTERM cancels cleanly through the existing AbortSignal paths (render workers stopped, partial *.part files removed as today), ending with a "cancelled" event.

### F3  feat(server): server skeleton and security
- New workspace `server/` (@fableon/server) and `fableon serve [--port 4317] [--root work] [--open]`.
- Security (a local server that can run commands and write files must not be reachable by other web pages):
  - bind 127.0.0.1 only;
  - a random per-launch token: the startup line prints http://127.0.0.1:<port>/?token=…; the token is accepted from the Authorization header or an HttpOnly SameSite=Strict cookie set on first visit; every /api request without it gets 401;
  - reject requests whose Host is not 127.0.0.1:<port> or localhost:<port> (DNS rebinding), and requests with a foreign Origin (CSRF); no CORS;
  - every path is resolved inside the project root (traversal attempts → 400);
  - body-size limits; uploads limited to text sources (.md .txt .html) and known media types.
- Endpoints: GET /api/health; GET /api/doctor (runs doctor as a light job and returns its checks).
- Settings: GET /api/settings/keys returns {name: set|unset} for an allowlist (DEEPSEEK_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, SARVAM_API_KEY, ELEVENLABS_API_KEY, OPENROUTER_API_KEY, TAVILY_API_KEY). PUT /api/settings/keys/:name writes that line in the repo-root .env atomically (write-only; the value is never returned or logged). DELETE removes it.

### F4  feat(server): projects, stages and artifacts
- Projects: GET /api/projects (projects under --root; fixtures listed read-only); POST /api/projects (topic, seconds, language, voice, as `fableon new`); GET /api/projects/:id (manifest, stage table, approvals, pronunciation TODOs, craft notes, usage and cost); PATCH /api/projects/:id (JSON-merge into project.json, schema-validated: voice, models per stage, autopilot, budget, look); POST /api/projects/:id/archive (move to work/.archive, never delete).
- Stages: GET /api/projects/:id/stages (fast, memoised); POST …/stages/:stage/approve (optional override reason for factcheck); POST …/stages/:stage/notes (cast, shotplan); POST …/run → returns a job.
- Artifacts: GET /api/projects/:id/files/*path with the correct content type and HTTP Range for audio and video (the UI must seek in voice.wav, animatic.mp4 and final.mp4). PUT on an editable allowlist (brief.md, script.json, pronunciations.json, shotplan.json, cast.notes.json, shotplan.notes.json): schema-validated, history backup, the stage becomes `edited`. POST …/sources (multipart upload into research/sources/). GET …/history?path= lists versions from .fableon/history; POST …/history/restore restores one.
- Approved outputs stay read-only through the API exactly as in the CLI (APPROVED_LOCKED).

### F5  feat(server): jobs and live events
- POST /api/projects/:id/ops/:op with args validated against the op's argsSchema → a job {id, project, op, args, status: queued|running|done|failed|cancelled|interrupted, createdAt, startedAt, finishedAt, progress, error}. Jobs run as child processes: `fableon <op> … --events ndjson`.
- Queue: at most ONE heavy job at a time on the machine (8 GB M1); light jobs may run in parallel but never two writers on one project (PROJECT_LOCKED → 409).
- Persist jobs in work/.fableon-server/jobs.jsonl with per-job logs. On server start, jobs left running become `interrupted` and resumable ops (render, final, animatic) offer resume.
- Live events: WebSocket /api/events?project=<id> (and an SSE fallback at /api/events/sse) relays every event from the child plus status changes after each job. GET /api/jobs, GET /api/jobs/:id (with a log tail), POST /api/jobs/:id/cancel (SIGTERM, then SIGKILL after 10 s).

### F6  feat(server): models, voices, usage and budgets
- GET /api/models: the routing table per stage (primary and fallbacks), prices with source and date, and which provider keys are set. POST /api/models/check {provider} → a light job.
- GET /api/voices: providers, cached voice lists (ElevenLabs account voices, Sarvam speakers for the configured model) and the credit meter (voice budget). POST audition / pace ops go through F5.
- GET /api/usage?project=&from=&to=: the `fableon usage` aggregation (per provider, stage, model and day; peak and off-peak estimates).
- Budget guard: before a job starts, estimate its spend from the routing table and recent stage usage; if project.budget or a provider budget would be exceeded, emit a `budget` event and refuse the job unless the request carries confirmBudget: true.

### F7  docs, tests and report
- server/openapi.json (OpenAPI 3.1, every endpoint, reusing schema/*.json) and docs/API.md (auth/token, security model, events, jobs, ops, examples with curl).
- Integration tests over HTTP with the mock provider and a fake heavy op (no network, no Chromium):
  - create a project → upload a source → run to factcheck as a job → receive progress events over WebSocket → approve → PUT script.json → downstream becomes stale;
  - a cast notes op;
  - cancel a running job; a server restart marks it interrupted;
  - a Range request on a media file returns 206 with the right bytes;
  - security: no token → 401; a bad Host → 403; a foreign Origin → 403; path traversal → 400; a PUT key value is never echoed in responses, logs, events or job files;
  - one heavy job at a time; PROJECT_LOCKED on concurrent writers.
- A demo script (server/scripts/demo.mjs) that starts the server, drives a mock project through the API and prints the events.
- docs/reports/phase-4.md per the template: endpoint list, event schema, op registry, status timing before/after the hashing change, migration evidence (fixture statuses identical), security tests, and the open questions for Phase 5 (UI).

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, Adi audio unchanged) including the new core, CLI-events and server tests.
2. `fableon serve` starts on 127.0.0.1 with a token; `server/scripts/demo.mjs` completes.
3. Status on Savitri is measurably faster, and every fixture status and approval is preserved by the v2 migration.
4. Every user-facing CLI action is reachable as an op over the API, with progress events for every long op.
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F7 in order.

## Out of scope
The browser interface (Phase 5), remote or multi-user access, accounts, desktop packaging, new pipeline features.
