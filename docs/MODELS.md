# Models

## 2026-11-16 — deepseek check

Command:

```text
$ fableon models check --provider deepseek
provider: deepseek
key: MISSING (DEEPSEEK_API_KEY)
```

The key is not present in the environment or repo-root `.env`, so this run could not discover model ids, verify JSON
mode, try a `strict` tool call, or record context/output limits. No secret was printed. The router is implemented and
the offline mock path is exercised by `npm test`; DeepSeek ids and limits must be filled in after a key is supplied.

## Provider contract

- `deepseek`: OpenAI-compatible chat completions at `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`).
  `DEEPSEEK_MODEL` or `project.models.<stage>.model` selects the model; if omitted the router discovers it with
  `GET /models`. Prices are optional in `models.json`; cost is computed only when configured.
- `openai-compatible`: same protocol with a project-level `baseUrl` and `keyEnv` for OpenRouter/Ollama/LM Studio.
- `mock`: replays recorded JSON responses from `tests/fixtures/llm/responses.json`; used by the offline tests.

JSON mode is requested with `response_format: {type:"json_object"}`, but the deterministic guard is local ajv
validation plus the script/factcheck checks and up to two repair turns. The requests include `max_tokens`; a
`finish_reason` of `length` is a hard error. Cache-hit usage fields returned by the provider are recorded in
`logs/calls.jsonl` when present.
