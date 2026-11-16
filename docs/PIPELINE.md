# Pipeline

Phase 3A adds a reusable writers'-room library under `cli/src/core/`, `cli/src/models/` and `cli/src/stages/`.
The CLI is a thin adapter; the Phase 4 server can drive the same `PipelineRunner` and consume its events.

## Commands

```bash
fableon new work/savitri --topic "Savitri and Satyavan" --seconds 90 --voice am_michael
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
path, retrievedAt, sha256 and chars. Facts carry claims, kinds, source quotes and confidence. The stage checks every
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

## Models, cache and budgets

`project.json.models.default` selects the provider; per-stage overrides are `brief`, `research`, `script`, `factcheck`,
`voice`. Providers are `deepseek`, `openai-compatible` (`baseUrl`, `keyEnv`) and `mock`. DeepSeek defaults to
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

`fableon voice` remains the fixture-compatible command. The pipeline voice stage runs `voice/make_voice.py` with the
project's voice/speed; when `script.json` exists the Python script uses actual beat changes for longer line pauses. If
the natural duration is within ±10 % of `project.seconds`, the stage applies pitch-preserving `ffmpeg atempo` to the
exact target and scales `words.json`; outside the band it stops with the measured length and a suggested word count.
`--fit off` keeps the natural length.
