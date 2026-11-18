# Models

## 2026-11-16 — DeepSeek verified live

Command and output (no secret is shown; the key value is never printed):

```text
$ npx fableon models list --provider deepseek
deepseek-flash
deepseek-v4-pro

$ npx fableon models check --provider deepseek
provider: deepseek
key: SET (DEEPSEEK_API_KEY)
models: deepseek-flash, deepseek-v4-pro
json mode: OK ({"ok":true})
usage fields: prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details, prompt_cache_hit_tokens, prompt_cache_miss_tokens
json word required: YES (HTTP 400: Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.)
strict tool call (beta): OK (returned a tool call)
```

### Model ids and roles

| id | name | role in this phase |
|---|---|---|
| `deepseek-flash` | DeepSeek-V4.1-Flash-1017 | default for every stage; fact-check runs thinking-enabled at effort `low` |
| `deepseek-v4-pro` | DeepSeek-V4-Pro-0813 | explicit per-stage fallback only, after the flash repairs fail |

Both models support both non-thinking and thinking modes; thinking is the default. The router sends
`thinking: {type: "disabled"}` for brief/research/script/cast/shotplan, and `thinking: {type: "enabled"}` plus
`reasoning_effort: "low"` for fact-check. The effort levels reported by `GET /models` are `low`, `high`, `max`
(default `high`).

### Limits (from `GET /models` and the pricing page)

| field | value |
|---|---|
| context window | 1,048,576 tokens (1M) |
| max output | 393,216 tokens (384K) |
| input modalities | `deepseek-flash`: text + image; `deepseek-v4-pro`: text |
| concurrency limit | flash 2500, pro 500 (provider-side) |

### JSON mode

- `response_format: {type: "json_object"}` works on both models (probe: `{"ok":true}`).
- The prompt must contain the word "json" in some form. Without it the API returns HTTP 400:
  `Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.`
  Every pipeline prompt therefore contains "json"; the router also injects a JSON-only system line if no message does.
- No empty `content` response was observed in this run. The local ajv validation plus up to two repair turns remains
  the guard, and empty content is retried by the repair loop.
- Thinking responses include `choices[0].message.reasoning_content`, separate from `content`. The router only uses
  `content`; it records whether reasoning content was present.
- `finish_reason: "length"` fails the call with the completion-token count (as before).
- `max_tokens` covers reasoning plus visible content when thinking is enabled. A 17-line fact-check review with
  `deepseek-v4-pro` at effort `high` used about 9.3k completion tokens, and the reasoning pass can consume the whole
  budget before any JSON is written; the repo fact-check default is 24000.

### Tool calls

- A `strict: true` function tool call succeeds only on the beta base URL
  `https://api.deepseek.com/beta/chat/completions`. It returned a real `tool_calls` entry. The pipeline does not depend
  on tool calls; the probe is informational.

### Usage fields returned

```text
prompt_tokens, completion_tokens, total_tokens,
prompt_tokens_details.cached_tokens,
completion_tokens_details.reasoning_tokens,
prompt_cache_hit_tokens, prompt_cache_miss_tokens
```

`logs/calls.jsonl` records `promptTokens`, `completionTokens`, `cacheHitTokens`, `cacheMissTokens`,
`reasoningTokens`, `reasoningContent` and `costUsd` when present.

### Prices

Source: <https://api-docs.deepseek.com/quick_start/pricing>, read 2026-11-16. Prices are USD per 1M tokens and the
table lists the **peak** rate (off-peak is half; peak is 01:00–04:00 and 06:00–10:00 UTC, Mon–Fri). `models.json`
uses the peak rate, so reported cost is an upper bound.

| model | input (cache miss) | input (cache hit) | output |
|---|---|---|---|
| `deepseek-flash` | $0.30 | $0.006 | $1.20 |
| `deepseek-v4-pro` | $1.32 | $0.044 | $3.96 |

Cost is computed only when `models.json` has a price for the resolved model:
`cacheHit * cacheInput + cacheMiss * input + completion * output`, all divided by 1,000,000.

### Stage defaults

`models.json` `stageDefaults` (Phase 3E routing): brief/research/performance/cast/shotplan/sound use `deepseek-flash`; factcheck uses
`deepseek-flash` with thinking enabled at effort `low`; script uses `gemini-3.1-flash-lite` after the blind ranking, with
Gemini 3.1 Pro, Sarvam 105B and DeepSeek Flash as explicit fallbacks. A project-level
`models.default.model` or `models.<stage>.model` overrides these. `models.board` / `models.boardEscalate` are kept
but unused (the board writer is deterministic; Phase 3E bake-off).

### Fallback

Each stage has a `fallbacks` list (primary first; see the table above). The router tries the primary model with its
normal repair rounds, then runs the same validation loop on each fallback in order. Every fallback attempt is written to
`logs/calls.jsonl` as `"fallback": true` with `fallbackFrom`, and the stage usage records a `fallbacks` count. An
explicit project model choice is honoured without fallbacks unless the project also sets
`models.<stage>.fallback`/`fallbacks`; mock projects never fall back.

## Provider registry (Phase 3E)

`cli/src/models/providers.js` registers `deepseek` (direct), `openrouter` (OpenAI-compatible at
`https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY`), `sarvam` (chat at `https://api.sarvam.ai/v1/chat/completions`,
`sarvam-105b` / `sarvam-105b-conversations`, `api-subscription-key` header), `openai`
(`https://api.openai.com/v1`, `OPENAI_API_KEY`), `gemini` (`https://generativelanguage.googleapis.com/v1beta/openai`,
`GEMINI_API_KEY`), `openai-compatible` and `mock`. OpenRouter is kept for code/tests but **unused in Phase 3E**: the key
reported USD 0 credits and the `data_collection: deny` privacy filter removed the free endpoints. The user chose direct
providers instead of topping it up.
OpenRouter requests send `HTTP-Referer: https://fableon.local`, `X-Title: Fableon` and
`provider: {data_collection: "deny"}` so routing only uses providers that do not store the request. The live catalog is
`models.catalog.json` (dated 2026-11-17): 439 models with context, max output, supported parameters and prices per 1M
tokens. `fableon models catalog --provider openrouter` refreshes it. JSON mode is requested only when the catalog says
the model supports `response_format`/`structured_outputs`; otherwise the prompt is JSON-only and ajv+repairs still gate
every output. Costs for OpenRouter come from this catalog; DeepSeek, OpenAI, Gemini and Sarvam costs come from `models.json` prices
(official source URL and date per model; Sarvam is INR ₹10/₹25 per 1M converted at ₹88/USD for the USD log).

## Phase 3E routing and blind ranking

Script bake-off cases: `fixtures/savitri-hi` and `work/bakasura-hi`. The blind sheet is `bakeoff/script/blind.md`; after
the user ranked it, the labels resolved to: Savitri **B = Gemini 3.1 Flash-Lite**, Bakasura **D = Gemini 3.1 Pro**
(the user's top choices). The default script route is Gemini 3.1 Flash-Lite because it passed both cases and was the
cheapest passing Savitri script; the Bakasura project will override `models.script` to Gemini 3.1 Pro for its top
choice. Fallbacks are Gemini 3.1 Pro, Sarvam 105B and DeepSeek Flash. Full results and the seeded factcheck test are in
`docs/reports/phase-3e.md` and `bakeoff/script/results.json`.

### Phase 3E script bake-off

Fixed cases: `fixtures/savitri-hi` and `work/bakasura-hi`. Spend **$0.15208** (DeepSeek $0.00450, Sarvam $0.05183,
Gemini $0.09576; OpenAI failed validation before billing). No candidate passed first try; every passing script needed
repairs.

| case | model | result | repairs | cost USD |
|---|---|---|---:|---:|
| Savitri | Sarvam 105B | PASS | 5 | 0.040011 |
| Savitri | Gemini 3.1 Flash-Lite | PASS | 2 | 0.010058 |
| Savitri | DeepSeek Flash / V4 Pro / GPT-5.4 nano / mini / Gemini Pro | FAIL | — | 0 |
| Bakasura | DeepSeek Flash | PASS | 1 | 0.004496 |
| Bakasura | Sarvam 105B | PASS | 1 | 0.011820 |
| Bakasura | Gemini 3.1 Flash-Lite | PASS | 1 | 0.005567 |
| Bakasura | Gemini 3.1 Pro | PASS | 1 | 0.080132 |
| Bakasura | DeepSeek V4 Pro / GPT-5.4 nano / mini | FAIL | — | 0 |

The user ranked Savitri **B = Gemini 3.1 Flash-Lite** and Bakasura **D = Gemini 3.1 Pro**; those are the script routes.
Only the script stage has a full bake-off; the other stages are routed but not yet head-to-head. Full tables, latencies
and failure reasons are in `docs/reports/phase-3e.md` and `bakeoff/script/results.json`.

## Provider contract

- `deepseek`: OpenAI-compatible chat completions at `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`).
  `DEEPSEEK_MODEL` or `project.models.<stage>.model` selects the model; if omitted the router discovers it with
  `GET /models`. Prices are optional in `models.json`; cost is computed only when configured.
- `openai-compatible`: same protocol with a project-level `baseUrl` and `keyEnv` for OpenRouter/Ollama/LM Studio.
- `mock`: replays recorded responses from `tests/fixtures/llm/responses.json`; used by the offline tests.

JSON mode is requested with `response_format: {type:"json_object"}`, but the deterministic guard is local ajv
validation plus the script/factcheck checks and up to two repair turns. Requests include `max_tokens`; a
`finish_reason` of `length` is a hard error. Cache-hit usage fields are recorded in `logs/calls.jsonl`.
