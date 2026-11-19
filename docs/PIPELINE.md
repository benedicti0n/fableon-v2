# Pipeline

Phase 3A adds a reusable writers'-room library under `cli/src/core/`, `cli/src/models/` and `cli/src/stages/`.
The CLI is a thin adapter; the Phase 4 server can drive the same `PipelineRunner` and consume its events.

## Commands

```bash
fableon new work/savitri --topic "Savitri and Satyavan" --seconds 90 --voice am_michael
fableon new work/savitri-hi --topic "…" --seconds 90 --language hi
fableon voice check --provider elevenlabs
fableon voice audition --project work/savitri-hi --voices 5
fableon status --project work/savitri
fableon approve --project work/savitri --stage brief
fableon run --project work/savitri --to research [--autopilot] [--force] [--no-cache]
fableon models list --provider deepseek
fableon models check --provider deepseek
```

`run` executes `brief → research → script → factcheck → voice` in dependency order. Missing, stale and failed stages
run; fresh/approved stages are skipped. Hand-edited outputs are never overwritten without `--force`. Without
`--autopilot` (or `"autopilot": true` in `project.json`) a stage waits until every dependency is approved, and the
error names the review file and the exact `fableon approve` command.

## Artifacts

| stage | outputs | schema |
|---|---|---|
| brief | `brief.md` | Markdown; the template has `<!-- fableon:brief-template -->` |
| research | `research/sources.json`, `research/facts.json` | `schema/sources.schema.json`, `schema/facts.schema.json` |
| script | `script.json`, `SCRIPT.md` | `schema/script.schema.json` |
| factcheck | `script.review.json` | `schema/review.schema.json` |
| voice | `voice.wav`, `words.json` | `schema/words.schema.json` (words) |
| state | `.fableon/state.json` | `schema/state.schema.json` |
| manifest | `project.json` | `schema/project.schema.json` |
| names | `pronunciations.json` | `schema/pronunciations.schema.json` |

All JSON is validated with ajv on read and write. Writes go to a temporary file in the same directory and are renamed;
a replaced output is copied to `.fableon/history/<stage>/<timestamp>/<path>` first.

## Hashing, status and approvals

Each stage stores `hash = sha256(stage name, version, relevant project.json keys, model id, prompt template, input
files)`. The output hash is stored separately. `status` reports `missing`, `fresh`, `stale`, `edited`, `approved`,
`failed` or `running`:

- edit an upstream artifact → downstream stages become `stale`;
- edit a stage's own output → it becomes `edited` and loses approval;
- approve → the current hash is recorded; a later input change or edit invalidates it.

`brief.md` is user-owned: if it does not carry the template marker, the brief stage keeps it. The status TODO list shows
names in `script.names` without a `pronunciations.json` entry (Kokoro mispronounces unknown names).

## Research sources

Put `.md`, `.txt` or `.html` files in `research/sources/`; HTML tags are stripped. The registry records title, kind,
path, retrievedAt, sha256 and chars, plus a `url` when the file header contains one (the Savitri fixture records its
source page this way). Facts carry claims, kinds, source quotes and confidence. The stage checks every
quote as a normalised verbatim substring of the named source; quotes shorter than 30 characters or quotes that do not
occur mark the fact `verified: false`, and the script may not cite it.

Web research is opt-in: set `"research": {"web": true, ...}` in `project.json` **and** provide `TAVILY_API_KEY`. The
model proposes up to five queries; each query calls Tavily and the results are stored in `research/sources.json` with
`kind: "web"`, `url`, `title`, `retrievedAt`, `content`, `sha256` and `chars` (file sources keep their `path`). Web
content goes through the same normalised verbatim-quote check as file sources. The total is capped by
`research.maxSources`; duplicate URLs are dropped. Without the key the stage keeps the file sources and reports that
web search did not run. The Savitri run used a file source, not Tavily.

Tavily format verified against <https://docs.tavily.com/documentation/api-reference/endpoint/search> on 2026-11-16:
`POST https://api.tavily.com/search` with `Authorization: Bearer <key>` and JSON
`{"query": "...", "search_depth": "basic", "max_results": N}`; the response is
`{"query","results":[{"title","url","content","score",...}],"response_time",...}`. We keep `content` (the snippets the
docs say are pulled from the source) because the quote check must run against text we actually received.

## Hindi script v2

Hindi projects use a separate script prompt: conversational Hindustani in Devanagari with an English `gloss` per line,
short lines, and a line count scaled to the 10-14 formula lines. Every line carries `delivery` and catalog look fields
(set, mark, character ids, pose, expression, prop). New scripts follow the STYLE_BIBLE formula: hook line 0 (a paradox
stated as fact, at most 16 words, no setup), 1-2 setting lines, 3-6 escalation lines with a short quoted in-character
line, exactly one mystery line ending in `?`, a pivot line starting with `दरअसल,` or `असल में,` (configurable via
`project.script.pivots.hi`), one everyday analogy, and a 1-2 line ironic payoff. A deadpan good-news/bad-news pair is
an optional escalation device. The deterministic checks enforce the counts and order, the pivot phrase, median
sentence length (Hindi 8-14, English 10-16 words), literal looks (who + catalog pose), facts on
setting/escalation/pivot/analogy, and the model's advisory `hookAdvisory`. Old scripts keep their legacy checks and
map old beats (`action`/`snap`/`deadpan`/`consequence` → escalation, `explain` → analogy, `twist` → payoff) when read.
Repeated fact lines and over-long Hindi lines are normalised (merged/split) before validation.

Research adds `supports: yes|partly|no` per fact; only `yes` facts are citable. The fact-check prompt compares the
Hindi line with the English facts through its gloss and adds a craft verdict (`ok`/`weak`); weak or unsupported lines
go through the same selective revision/no-op guard. The fixture is `fixtures/savitri-hi/`.

## Director stages (Phase 3C)

The stage list is now `brief → research → script → factcheck → cast → voice → shotplan → board → sound → animatic`.
`cast` designs every character/mention, checks mustHave traits and colour distinctness, writes asset gaps and renders
`cast/cast-sheet.jpg`; `fableon cast --notes` stores notes in `cast.notes.json`. `shotplan` turns the script/words,
cast and asset gaps into a 20-32-shot plan grouped into scenes (`scene`, one place+time), with per-boundary
`transition` (crossfade 6-8 f | flash 4 f | cut), direction marks (`punch`, `impact`, `drama`, `reveal`,
`foreground`, `ease:"burst"`), walk/run `moves` paths and follow keys. A deterministic allocator fills DOF/foreground/hold shares, low heights, transitions and required punches after the model supplies content; continuous shots in one scene merge into one board shot with gliding keys. `fableon qa` also writes `voice-qa.md` for the voice stem: digital/perceptual silence, pause guard, clipping, bandwidth, lead-in/tail and pitch falls. The deterministic checks enforce <=2 cuts,
a flash after the hook (max 3), a crossfade on place/time changes, 70-85 % hold share, 25-40 % DOF and foreground
shares, low full/wide heights and a punch on every hook/mystery/payoff line; `fableon shotplan --notes` stores
`shotplan.notes.json`. `board` writes the authoring shots from the approved plan, translates the marks and moves,
compiles each shot, measures the full board and repairs edge/head-cut staging with deterministic variants; a compiled
film-level check records cuts/DOF/foreground stats and failures in `board.review.json` as `needsHuman`. `fableon board
--shot <id>` reruns and re-renders that segment. `animatic` renders preview segments, concatenates them, muxes
`voice.wav` only and runs short_qa; `animatic-qa.md` carries the verdict. The animatic mp4 stays in `work/`.

| stage | outputs | schema |
|---|---|---|
| cast | `cast.json`, `assets.todo.json`, `cast/cast-sheet.jpg` | `schema/cast.schema.json`, `schema/assets.schema.json` |
| shotplan | `shotplan.json`, `shotplan.md` | `schema/shotplan.schema.json` |
| board | `board.json`, `board.review.json`, `storyboard.json` | `schema/authoring.schema.json` |
| animatic | `animatic-qa.md` (+ `animatic.mp4` in the project) | Markdown; QA meta |

`fableon schema --project P --shot <id>` writes the slim per-shot board schema (about 7.5 KB for Savitri, target
<=20 KB). The board prompt uses the guide, craft file, catalog card, three authoring examples and that schema; the
shot plan and previous shot are variable. The current board writer's deterministic base + measured variants keeps
`needsHuman` honest rather than pretending a bad shot passed; a model staging patch is a Phase 3C follow-up.
Model defaults: `cast` and `board` are DeepSeek flash at 0.4, `shotplan` and `boardEscalate` are DeepSeek v4-pro
(thinking disabled); every call is cached and logged.

## Models, cache and budgets

`project.json.models.default` selects the provider; per-stage overrides are `brief`, `research`, `script`, `factcheck`,
`voice`. An override can set `provider`, `model`, `baseUrl`, `keyEnv`, `temperature`, `maxTokens`, `thinking`
(`enabled`/`disabled`) and `reasoningEffort` (`none`/`low`/`high`/`max`). Thinking tokens count against `max_tokens`,
so a thinking fact-check needs a large budget (the repo default is 24000). Providers are `deepseek`, `openai-compatible` (`baseUrl`, `keyEnv`) and `mock`. DeepSeek defaults to
`https://api.deepseek.com`; `DEEPSEEK_MODEL` or the project model selects the model. Repo defaults live in
`models.json` with no ids or secrets. Keys are read from the environment and then repo-root `.env`; they are never
printed, cached or logged.

Structured calls use JSON mode plus ajv validation and at most two repair turns. The prompt must contain the word
"json"; `finish_reason: length` fails with the token count; empty content retries. Stable prompt sections come before
the variable DATA blocks. Requests retry 429/5xx/network with exponential backoff and jitter, timeout at 120 s by
default, and cache by `sha256(provider, baseUrl, model, messages, params)`. A repeat with identical inputs makes zero
network calls; `--no-cache` bypasses the cache.

`logs/calls.jsonl` records timestamps, stage, provider, model, request hash, cached, ms, tokens, cache-hit fields,
optional cost, finish reason, attempt and ok — never message text or keys. `project.budget` can cap calls per stage and
tokens per run.

## Voice

`fableon voice` remains the fixture-compatible Kokoro command. A pipeline project selects a provider with
`project.voice.provider` (or the legacy `engine`): `kokoro` for English or `elevenlabs` for Hindi. ElevenLabs uses
`/v1/text-to-speech/{voice_id}/with-timestamps`. For v3 it sends the whole script in one request when the rendered
text is within the documented 5,000-character limit, then cuts exact pause silences at word gaps from the alignment;
per-block requests are the fallback. v3 rejects `previous_text`/`next_text`; v2/flash use that stitching and SSML
breaks. Beat alignment is mapped to `words.json`. Every take is
cached by request hash; `voice.maxCharsPerRun` (default 10,000) caps live characters and `logs/calls.jsonl` records
characters and cost. See `docs/VOICES.md` for the verified API facts and prices.

Script lines can carry `delivery` (`tone`, `pauseBefore`, `pauses`, `emphasis`); every referenced word is validated
against the line. ElevenLabs renders v3 tone tags/ellipses and v2 SSML breaks/per-tone settings, inserts exact local
silence for `pauseBefore`, and strips markup before `words.json`. `voice.tones` stores the per-tone stability/style/speed.
The measured `voice.rate` (words/s, characters/s) sets the script word budget and the provider speed, then the ±10 %
atempo fit handles the remainder.

After synthesis the stage applies the same length fit: if the natural duration is within ±10 % of
`project.seconds`, pitch-preserving `ffmpeg atempo` goes to the exact target and `words.json` is scaled; outside the
band it stops with the measured length and a suggested word count. `--fit off` keeps the natural length. Kokoro can
report a small negative start for the first word; the stage clamps timings at zero before validating `words.json`.

## Final picture and the segment cache (Phase 6)

`final` is a real stage after `animatic`/`sound`. The renderer still owns each shot, but the final compiler stores
one solo segment per storyboard shot plus one global composite per boundary transition (crossfade/flash) under
`render/final/segments/` and `render/final/transitions/`. The manifest keys each segment by the compiled shot
description, its resolved range, the cast/look/board hashes, quality/size and an engine build id (engine source +
three.js + the known ANGLE string). A changed shot re-renders its own segment and the boundary composites that
contain it; its neighbours' shot segments stay cached. Assembly trims each piece frame-exactly, re-encodes once to
BT.709 yuv420p and muxes `audio/mix.wav`; audio-only changes take the remux path and render zero frames.

`GET /api/projects/:id/final/plan` returns the segment strip, dirty reasons (`new`, `board`, `look`, `engine`,
`quality`, `transition`), frames, estimated minutes and disk need. The final renderer checks `DISK_LOW` (need + 3 GB),
runs `short_qa` and `lookcheck`, writes `final-qa.md`, keeps `final.prev.mp4` for A/B, and uses `caffeinate` on macOS.
`fableon clean` can remove unreferenced `render/final` segments.

## Publishing package (Phase 6)

`publish` depends on `final`. It asks the publish route for five Hindi/English titles, descriptions, hashtags, tags,
thumbnail text, pinned comment and recommendations; the deterministic validator and a fact pass against the
verified facts and factchecked script are blocking. Covers come from scored `final.mp4` frame grabs (head/face,
sharpness, contrast, saturation, beat, cast count) composed by the engine's headless browser with bundled Noto
Sans Devanagari; sidecar Hindi/English SRTs stay outside the video. `export` writes
`<root>/exports/<date>-<project>/` with the video profiles, cover, SRTs, `publish.md`, `publish.json` and
`export-qa.md`. See `docs/PUBLISHING.md`.

## Production queue (Phase 6)

Presets in `presets/` (built-in) and `<root>/.fableon/presets/` (user) define seconds, language, voice, routing,
library sources, mix offsets, gates, budget and publish profiles. A batch creates collision-safe projects and queue
items in `<root>/.fableon/queue.json`; one estimate confirms the batch. The queue runs one stage per existing job,
never pre-empts a running item, waits at gates (`script`, `animatic`, `publish` by default), auto-approves non-gate
stages with `by: "autopilot"`, and stops on QA failure, fact flags, `DISK_LOW`, budget overrun or an exhausted
provider. Restart turns a running item into paused. Controls: start, pause after current, pause now, retry, remove,
reorder.
