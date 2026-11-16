## Precondition
Run `npx fableon models check --provider deepseek`. If it still reports the key as MISSING, STOP and report that; do not fake any result. Never print, log, echo, open or commit the key or the .env file.

## Features (one commit each, in this order)

### F1  fix(models): DeepSeek verified live
- Run `models list` and `models check`. Record in docs/MODELS.md (with the date): the model ids; which is a non-thinking chat model and which is a reasoning model; the JSON-mode result (is the word "json" required in the prompt, did empty content ever occur); the strict tool-call result; the usage fields returned (including any cache-hit / cache-miss token fields and any reasoning-content field); limits if exposed.
- Fill the optional prices in models.json from DeepSeek's official pricing page (cite the URL and date in docs/MODELS.md) so runs report cost.
- Defaults in models.json: the non-thinking chat model for brief, research and script; the reasoning model for factcheck if it supports JSON mode (otherwise the chat model).
- If the real response shape differs from what the provider assumed (usage fields, reasoning field, error bodies, rate-limit headers), fix the provider and update the mock fixtures to mirror the real shape. Tests green.

### F2  fix(stages): stop no-op revisions
- If a fact-check revision round leaves every failing line unchanged, or the new reviewerdicts equal the previous round's, stop the loop immediately and report the failing lines instead of spending another round. Mock test.

### F3  feat(research): optional Tavily web search
- Implement the opt-in branch from 3A F4 (only when project.json research.web is true AND TAVILY_API_KEY is set): up to 5 model-proposed queries; results saved as sources (url, title, retrievedAt, content) and passed through the same verbatim-quote verification. Verify the request/response format against Tavily's current API docs and note it in docs/PIPELINE.md. Mock test always; a live test only if TAVILY_API_KEY exists (otherwise write "not run" in the report).

### F4  feat(fixture): the live Savitri run
- Do acceptance items 3 and 4 of docs/prompts/phase-3a.md exactly: `fableon new work/savitri …`, put the Ganguli source text (with its URL) into research/sources/, `fableon run --project work/savitri --to voice --autopilot`, a second run with zero model calls, then the hand edit with `fableon status` before/after.
- If the fact-check or a script check still fails after the allowed rounds, do NOT hand-edit to make it pass; report the failing lines.
- Commit the result as the Phase 3B input fixture fixtures/savitri/: project.json (no secrets), brief.md, research/sources.json, research/facts.json, script.json, SCRIPT.md, script.review.json, pronunciations.json, voice.wav, words.json. Do not commit the source text if it is larger than 200 KB (its URL and sha256 stay in sources.json). Never commit .fableon/cache, logs or .env.

### F5  docs(report): docs/reports/phase-3a-live.md per the template
- The `models check` output; per-stage time, calls, tokens (including cache-hit tokens if reported) and cost; total cost; facts total / verified / unverified; the full "## Script" section of SCRIPT.md; the fact-check table; word count vs target; voice length before and after the fit; the pronunciation TODO list; the cache re-run and edit evidence; anything the live model did that surprised you (repairs needed, retries, empty responses, slow calls).
