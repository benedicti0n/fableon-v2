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

`models.json` `stageDefaults`: `deepseek-flash` for brief, research, script, factcheck, cast and shotplan
(thinking disabled except factcheck: enabled, effort `low`, temperature 0.2). A project-level
`models.default.model` or `models.<stage>.model` overrides these. `models.board` / `models.boardEscalate` are kept
but unused (the board writer is deterministic; Phase 3E bake-off).

### Fallback

Each stage has an explicit `fallback` entry (`deepseek-v4-pro`; factcheck uses thinking enabled, effort `high`).
The router tries the primary model with its normal repair rounds, then runs the same validation loop once with the
fallback. Every fallback attempt is written to `logs/calls.jsonl` as `"fallback": true` with `fallbackFrom`, and the
stage usage records a `fallbacks` count. An explicit project model choice is honoured without a fallback unless the
project also sets `models.<stage>.fallback`; mock projects never fall back.

## Provider contract

- `deepseek`: OpenAI-compatible chat completions at `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`).
  `DEEPSEEK_MODEL` or `project.models.<stage>.model` selects the model; if omitted the router discovers it with
  `GET /models`. Prices are optional in `models.json`; cost is computed only when configured.
- `openai-compatible`: same protocol with a project-level `baseUrl` and `keyEnv` for OpenRouter/Ollama/LM Studio.
- `mock`: replays recorded responses from `tests/fixtures/llm/responses.json`; used by the offline tests.

JSON mode is requested with `response_format: {type:"json_object"}`, but the deterministic guard is local ajv
validation plus the script/factcheck checks and up to two repair turns. Requests include `max_tokens`; a
`finish_reason` of `length` is a hard error. Cache-hit usage fields are recorded in `logs/calls.jsonl`.
