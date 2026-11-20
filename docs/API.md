# Fableon local API (Phase 4)

`fableon serve [--port 4317] [--root work] [--open]` starts a local-only backend for the browser UI. It binds
**127.0.0.1**, prints one token URL, and shares the CLI stage registry, operations registry and `.fableon/state.json`.
The CLI keeps working exactly as before.

```bash
fableon serve --root work
# http://127.0.0.1:4317/?token=…
```

## Security model

- **Token:** a random per-launch token. Send `Authorization: Bearer <token>` (or `X-Fableon-Token`); opening the
  printed URL once sets the `fableon_token` HttpOnly, SameSite=Strict cookie. Every `/api` request without a valid
  token gets `401`.
- **Host:** only `127.0.0.1:<port>` or `localhost:<port>` is accepted (`403` otherwise), for DNS-rebinding safety.
- **Origin:** a foreign `Origin` is rejected (`403`); no CORS headers are ever sent.
- **Paths:** every path is resolved inside the project root; `..`, absolute paths and encoded traversal get `400`.
- **Limits:** JSON bodies are capped at 2 MB, uploads at 10 MB and sources are limited to `.md`, `.txt`, `.html`.
- **Secrets:** `GET /api/settings/keys` returns only `set`/`unset`; `PUT`/`DELETE` write the repo-root `.env`
  atomically and never echo, log or event the value. Project `logs/` and `.fableon/` are not served.
- **Read-only:** fixtures are listed but never writable; approved stage outputs return `APPROVED_LOCKED` (`403`).

## Endpoints

| method | path | notes |
|---|---|---|
| GET | `/api/health` | ok, pid, uptime, root, version |
| GET | `/api/doctor` | local checks as JSON |
| GET | `/api/settings/keys` | `{NAME:"set"|"unset"}` allowlist |
| PUT/DELETE | `/api/settings/keys/:name` | write-only `.env` line |
| GET/POST | `/api/projects` | list work + fixtures / create like `fableon new` |
| GET/PATCH | `/api/projects/:id` | manifest, stages, usage / merge voice, models, autopilot, budget, look |
| POST | `/api/projects/:id/archive` | move to `work/.archive` |
| GET | `/api/projects/:id/stages` | fast stage table, approvals, TODOs, craft |
| POST | `/api/projects/:id/stages/:stage/approve` | optional `{override}` for factcheck |
| POST | `/api/projects/:id/stages/:stage/notes` | cast or shotplan notes |
| POST | `/api/projects/:id/run` | run to a checkpoint as a job |
| POST | `/api/projects/:id/ops/:op` | any registry op as a job |
| GET | `/api/projects/:id/files/*path` | MIME + HTTP Range (`206`) |
| PUT | `/api/projects/:id/files/*path` | editable allowlist, schema + history |
| POST | `/api/projects/:id/sources` | multipart source upload |
| GET | `/api/projects/:id/history?path=` | `.fableon/history` versions |
| POST | `/api/projects/:id/history/restore` | restore `{version}` |
| GET/POST | `/api/presets` | built-in and user production presets |
| PUT/DELETE | `/api/presets/:id` | edit/delete a user preset |
| GET | `/api/library` | shared research library files |
| GET | `/api/queue` | production queue state |
| POST | `/api/queue/from-preset` | create a batch of projects and queue items |
| POST | `/api/queue/start`, `/api/queue/pause` | queue controls |
| POST | `/api/queue/:id/:action` | retry, remove or reorder |
| GET | `/api/costs?month=YYYY-MM` | monthly ledger summary, budgets and alerts |
| GET | `/api/costs.csv?month=` | monthly ledger CSV (no prompts or keys) |
| GET/PUT | `/api/costs/budgets` | caps, thresholds, INR rate, fees and display currency |
| GET | `/api/costs/balances` | DeepSeek/ElevenLabs balances where keys exist |
| GET | `/api/projects/overview` | projects with stage dots, cover, spend and published state |
| GET | `/api/projects/:id/exports` | export folders for the film |
| GET/PUT | `/api/settings/channel` | channel profile used by the publish prompt |
| POST | `/api/projects/:id/published` | record a manual YouTube/Instagram publish |
| POST | `/api/projects/:id/publish/cover` | recompose the cover from a candidate/template |
| POST | `/api/projects/:id/publish/override` | accept publish fact flags with a reason |
| POST | `/api/projects/:id/exports/open` | reveal an export folder in Finder |
| GET | `/api/projects/:id/final/plan` | final segment cache plan: reasons, frames, time, disk |
| GET | `/api/projects/:id/timeline` | resolved scenes/shots/keys, script words, needsHuman |
| GET | `/api/projects/:id/peaks?path=` | waveform peaks, cached by file hash |
| GET | `/api/projects/:id/list?dir=` | safe stills/cast/auditions/pace/review/qa/sources listing |
| POST | `/api/projects/:id/estimate` | pre-run calls/characters/usd/time estimate |
| GET | `/api/jobs` | filter with `?project=` |
| GET | `/api/jobs/:id` | job + last 80 log lines |
| POST | `/api/jobs/:id/cancel` | SIGTERM, SIGKILL after 10 s |
| GET | `/api/events?project=` | WebSocket relay; `token` query accepted |
| GET | `/api/events/sse?project=` | SSE fallback |
| GET | `/api/models` | per-stage primary/fallbacks, prices and keys |
| POST | `/api/models/check` | light provider check job |
| GET | `/api/voices` | providers, cached auditions, credit meter |
| GET | `/api/usage?project=&from=&to=` | provider/stage/model aggregation |

The full machine-readable contract is `server/openapi.json` (OpenAPI 3.1). The editable file allowlist is
`brief.md`, `script.json`, `pronunciations.json`, `shotplan.json`, `cast.notes.json`, `shotplan.notes.json`.

## Events

One event schema (`schema/event.schema.json`) is used by the CLI, jobs and the live relay:

```json
{"ts":"2026-11-19T03:02:29.518Z","type":"progress","project":"demo","job":"job_8db…","stage":"factcheck","op":"run","step":"factcheck:confirm","done":2,"total":2,"etaMs":0,"message":"…","data":{}}
```

`type` is `job|stage|progress|log|artifact|status|budget|error`. Job statuses are
`queued|running|done|failed|cancelled|interrupted`. Stage progress is reported at model calls, board shots, cast,
sound sections, voice and animatic/render segments; render reports frames done/total/ETA every second.

The CLI equivalent is `fableon <command> --events ndjson`: stdout is one JSON event per line, human text goes to
stderr, and SIGTERM ends with a `cancelled` job event. This is exactly what the server child runs.

## Operations

`fableon ops --list --json` prints the registry. Every long action is reachable as
`POST /api/projects/:id/ops/:op` (or `/run` for the common case):

`run`, `approve`, `script-lines`, `export`, `sfx-preview`, `cast`, `shotplan`, `board`, `render`, `audio`, `assemble`, `qa`, `animatic`, `final`, `lookdev`,
`lookcheck`, `review`, `stills`, `voice-audition`, `voice-pace`, `voice-budget`, `clean`, `usage`,
`models-check`, `models-catalog`, `doctor` (plus the test-only `mock-sleep`). `script-lines` rewrites only selected lines with a note and keeps the other line objects unchanged.

Jobs run as isolated children. At most one **heavy** job runs at a time; light jobs may run in parallel, but a
project has at most one writer (`PROJECT_LOCKED`, `409`). Jobs persist in `work/.fableon-server/jobs.jsonl` with a
per-job log. On restart, running jobs become `interrupted`; `render`, `final` and `animatic` are marked resumable.

## Style packs

`GET /api/styles` lists every pack (including `testOnly`) with `status`, `sample` and contract errors.
`GET /api/styles/:id/sample` serves its first sample frame. `POST /api/styles/import` copies a skill folder
(`{from}`) or clones a git URL (`{git}`) into `styles/_incoming/`, scaffolds a not-ready pack and returns its id and
licence. `POST /api/styles/:id/check` validates the contract and renders a preview and final still; a passing check
flips the pack to `ready`.

`POST /api/projects/:id/style` with `{style, confirm}` changes the pack. Before cast approval this is a normal edit.
After it, the call returns `409 STYLE_RERUN` with `{estimate, from:"cast"}` unless `confirm:true`; a confirmed call
resets cast and later stages in state (history is kept) and queues a run from cast to final.

## Budgets

Before a job the server sums project stage cost and estimates the op (0.05 USD for model stages). If
`project.budget.maxUsd` or `project.budget.providers.<provider>` would be exceeded, it emits a `budget` event and
returns `BUDGET_EXCEEDED` (`409`). Post `{"confirmBudget":true}` with the request to override explicitly.

## Curl examples

```bash
TOKEN=… # from the startup line
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4317/api/health
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4317/api/projects
curl -H "Authorization: Bearer $TOKEN" -H 'Range: bytes=0-1023' \
  -o /tmp/head.wav http://127.0.0.1:4317/api/projects/savitri-hi/files/voice.wav
curl -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"to":"factcheck","autopilot":true}' \
  http://127.0.0.1:4317/api/projects/savitri-hi/run
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4317/api/jobs/JOB_ID
curl -H "Authorization: Bearer $TOKEN" -X POST \
  http://127.0.0.1:4317/api/jobs/JOB_ID/cancel
```

## Phase 5 questions for the UI

- Which stage screens should poll `GET /stages` versus wait for `status` events? The stage table is memoised per poll
  by the state cache; the event stream carries progress and a refresh hint after each job.
- Should the UI edit `brief.md` in a rich editor and `script.json` line-by-line, or treat the JSON as the source and
  render the markdown? The API accepts both through the editable allowlist.
- The look controls need `project.look` plus the per-shot `look` block; the API currently PATCHes project-level
  defaults only, while per-shot look remains in the board/artboard editor.
- Voice auditions are a heavy, paid op; the UI should confirm the character estimate from `GET /api/voices` and
  `GET /api/usage` before starting.
