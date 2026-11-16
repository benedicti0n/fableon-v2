# Phase 3A — Pipeline core and the writers' room (brief → research → script → fact-check → voice) on DeepSeek

## Goal
A new project can go from a topic to an approved, fact-checked script and a narration track (voice.wav + words.json) with one command, stage by stage, with every artifact a plain editable file. The user controls each stage (approve, edit, re-run) or runs everything with --autopilot. Models are called through a provider-neutral router; the first live provider is the DeepSeek API. The storyboard/AI director is Phase 3B; nothing in this phase touches the renderer.

## Architecture rules
- Build the pipeline as a LIBRARY (e.g. cli/src/core/, cli/src/models/, cli/src/stages/) that takes a project directory and emits progress events (EventEmitter: {stage, status, progress, message}). The CLI is a thin layer over it. Phase 4's server will reuse the same library, so no console.log inside the library; no process.exit CLI.
- No new npm dependencies unless unavoidable (Node 20 has fetch, crypto, fs/promises; ajv is already here). If you add one, say why in the commit body.
- All JSON artifacts have a JSON Schema in schema/ and are validated with ajv on write and on read.
- Writes are atomic (write temp file, then rename). Never overwrite a file the user edited by hand without --force; when a stage replaces an output, move the old one to .fableon/history/<stage>/<timestamp>/.
- Secrets: read from the environment, then from a repo-root .env (KEY=VALUE, tiny parser, no dependency). Add .env to .gitignore and commit .env.example. Never print, log, cache or commit a key; redact Authorization headers in any debug output. `fableon doctor` reports which keys are SET (never their values).
- Model inputs that come from sources or the web are untrusted DATA: put them inside clearly delimited blocks and tell the model to treat them as material, not instructions. The deterministic checks below (verbatim quotes, schema, catalog names) are the real guard.
- The existing fixture flow must not change: `fableon all --project work/adi`, the golden/stills/audio tests and the fixture's voice.wav/words.json stay exactly as they are.

## Project layout (new projects)
```
<project>/
  project.json              # manifest (schema/project.schema.json)
  brief.md                  # stage brief (editable)
  research/sources/*        # user sources: .md .txt .html (strip tags); PDF is out of scope
  research/sources.json     # registry: id, title, kind (file|web), path or url, retrievedAt, sha256, chars
  research/facts.json       # facts with verified verbatim quotes
  script.json               # structured script (source of truth)
  SCRIPT.md                 # rendered from script.json, same format as fixtures/adi-parva/SCRIPT.md
  script.review.json        # fact-check verdicts
  pronunciations.json       # existing format
  voice.wav, words.json     # voice stage outputs (same place and format as the fixture)
  .fableon/state.json       # per-stage hash, status, approvals, timings, usage
  .fableon/cache/           # model response cache (by request hash)
  .fableon/history/         # replaced outputs
  logs/run-<ts>.log, logs/calls.jsonl
```
project.json (minimum): version, id, title, topic, seconds (target length), language "en", voice {engine "kokoro", voice "am_michael", speed 1.35}, research {web false, maxSources 8}, models {default {provider, model}, <stage> overrides}, autopilot false.

## Features (one commit each, in this order)

### F1  feat(core): project manifest, artifacts and stage state
- `fableon new <dir> --topic "…" [--seconds 90] [--voice am_michael]` creates the layout above with project.json and a brief.md template.
- Stage registry: each stage declares name, version, inputs (files + project.json keys), outputs, and its prompt template (if any). Stage hash = sha256 of (stage name, stage version, relevant project.json keys, model id, prompt template content, input file contents).
- Status per stage: missing | fresh | stale | edited (output changed by hand since the stage wrote it) | approved | failed | running. Editing an artifact makes every downstream stage stale. Approvals are stored with the hash they approved; a stale stage loses its approval.
- `fableon status --project P` prints the stage table (stage, status, approved?, last run, tokens, cost).
- `fableon approve --project P --stage <s>` approves the current output.
- Tests: hashing, staleness propagation on edit, `edited` detection, approval invalidation, history on overwrite.

### F2  feat(core): stage runner and `fableon run`
- `fableon run --project P --to <stage> [--only <stage>] [--force] [--autopilot]`: runs missing/stale stages in dependency order. Without --autopilot it stops before any stage whose upstream output is not approved and prints exactly what to review and the approve command. With --autopilot (flag or project.json) it does not stop.
- Progress events, a run log in logs/, Ctrl-C cancels cleanly (the running stage is marked failed, partial outputs are not left in place), a second run resumes.
- Stage order for this phase: brief → research → script → factcheck → voice.

### F3  feat(models): model router
- Providers: `deepseek` (OpenAI-compatible chat completions; DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL default https://api.deepseek.com, optional DEEPSEEK_MODEL), `openai-compatible` (baseUrl + key env name; for OpenRouter / Ollama / LM Studio later; only unit-tested now), `mock` (replays recorded responses from tests/fixtures/llm/; used by npm test).
- Per-stage model selection from project.json `models` (default + overrides), with repo defaults in models.json (no secrets in it). Do NOT hard-code DeepSeek model ids or prices: discover ids with GET /models; prices are optional config (per 1M input / output tokens) and cost is computed only when set.
- Structured output: JSON mode (`response_format: {type: "json_object"}`) + local ajv validation + a repair loop (send the ajv errors back, max 2 repairs) — this works on every provider. Known DeepSeek JSON-mode caveats to VERIFY live and handle: the prompt must contain the word "json"; set max_tokens so output is not truncated; content can occasionally be empty (retry). Put the stable parts of every prompt (rules, catalog card, examples) FIRST and the variable parts last, so provider-side prefix caching can work; record any cache-hit usage fields the API returns.
- Robustness: request timeout (default 120 s, configurable), retries with exponential backoff + jitter on 429 / 5xx / network errors (max 4), finish_reason "length" → clear error with the token count.
- Response cache keyed by sha256 of (provider, base URL, model, messages, params): a re-run with identical inputs makes zero calls. `--no-cache` bypasses it.
- Usage log logs/calls.jsonl: ts, stage, provider, model, requestHash, cached, ms, promptTokens, completionTokens, any cache-hit token fields, costUsd (if prices set), finishReason, attempt, ok. No message contents, no keys.
- Budget guard: project.json `budget` {maxCallsPerStage, maxTokensPerRun}; exceeding it stops the run with a clear message.
- `fableon models list --provider deepseek` and `fableon models check --provider deepseek`: list model ids; make one tiny JSON-mode call; try a tool call with `strict` if the API supports it (record result, do not depend on it); report context/output limits if the API exposes them. Write the findings (date, ids, what worked) to docs/MODELS.md.

### F4  feat(stages): brief and research
- brief: if brief.md was written by the user, keep it (status edited/approved). Otherwise the model drafts it from project.json: audience, tone (deadpan, witty, like the reference film), angle (two or three hook options), must-include points, things to avoid, target length.
- research inputs: brief.md + research/sources/* (+ web search only if project.json research.web is true AND TAVILY_API_KEY is set: the model proposes up to 5 queries, results are saved as sources with url, title, retrievedAt; verify the Tavily request format against its current docs and note it in docs/PIPELINE.md).
- Sources are chunked (~1,500 words, overlap); if everything does not fit the model's budget, choose chunks by simple keyword overlap with the brief (deterministic, no embeddings).
- research/facts.json: facts [{id "F1", claim, kind event|person|place|number|tradition, sources [{source "S1", quote}], confidence high|medium|low, verified}]. DETERMINISTIC CHECK: every quote must be a verbatim substring of its source text (after whitespace/case normalisation, quotes >= 30 characters); facts whose quotes fail are marked verified:false and cannot be used by the script. Report counts.

### F5  feat(stages): script writer
- Inputs: brief.md, verified facts, the style rules below, `fableon catalog-card` output (so every line can be staged with the sets/characters that exist), target seconds and words per second (3.75 w/s, measured on the fixture: 451 words / 120.1 s; keep it as a constant with that comment).
- Style rules for the prompt (from the reference film): one steady narrator, our own wording; beat formula — hook (the absurd fact in one line) → setting → action (escalating, 3–4 beats) → snap → deadpan double line ("Luckily … / Unluckily …") → explanation through one everyday analogy → consequence → callback twist; never describe what the viewer already sees; no on-screen text.
- script.json: {version, title, seconds, wps, characters [{id, name, role, look}], names [{word, phonemes|null, suggested}], lines [{n (0-based), text, beat hook|setting|action|snap|deadpan|explain|consequence|twist, facts [ids], look {set (catalog set), who [character ids], note}}]}.
- DETERMINISTIC CHECKS (errors go back to the model through the repair loop, max 2, then fail): total words within ±7 % of seconds × wps; <= 22 words per line, hook <= 16 words; line 0 is the hook and the last line is the twist; beats follow the formula order (action may repeat); every setting/action/snap/consequence line cites >= 1 verified fact; look.set is a catalog set and look.who are declared characters; every capitalised name that is not a sentence start is listed in `names`; no 8-word run of any line appears verbatim in any source (our own wording).
- Render SCRIPT.md in exactly the fixture's format (title, facts with sources, "## Script (voice, ~N words)" one sentence per line, "## Look/beat notes", followed by another "## " section) so voice/make_voice.py parses it.
- Pronunciations: names without an entry in pronunciations.json get a model suggestion stored with "suggested": true and are listed by `fableon status` as a TODO for the user to approve (Kokoro gets unknown names wrong; LESSONS.md).

### F6  feat(stages): fact-check and revise
- factcheck uses its own model setting (may differ from the writer). Per line: verdict ok | unsupported | distorted | opinion (jokes, analogies, framing), cited facts, a one-line note and a suggested fix → script.review.json.
- Gate: any unsupported/distorted line fails the stage with a readable list. With --autopilot: send the failing lines and notes back to the script stage, which rewrites ONLY those lines (others stay byte-identical), then fact-check again; at most 2 rounds, then stop for the user.

### F7  feat(stages): voice stage
- Make voice/make_voice.py project-aware without changing the fixture's output: SCRIPT.md, pronunciations.json and (new) beat starts from script.json (longer pause before each line whose beat differs from the previous line); when script.json is absent it keeps the fixture's current behaviour. The stage passes the project's voice/speed settings.
- Length fit: if the natural length is within ±10 % of project.seconds, time-stretch with ffmpeg atempo (pitch-preserving) to the exact target and scale words.json by the same factor (LESSONS.md); otherwise stop with the measured length and the suggested word-count change (`--fit off` keeps the natural length).
- Output voice.wav + words.json in the project root, same format as the fixture.

### F8  test: offline pipeline tests (mock provider)
- tests/fixtures/pipeline/mini: a tiny topic with one short public-domain source text and recorded mock responses for brief, research, script, factcheck (including one invalid JSON response and one failing fact-check to exercise the repair and revise loops).
- npm test runs: new → run --to factcheck --autopilot with the mock provider; schema validity of every artifact; quote verification (a planted fake quote is marked unverified); script checks (a planted over-long line and an unknown set are caught and repaired); cache hit on re-run (zero calls); edit → stale propagation; approval gating without autopilot; no key text in logs/calls.jsonl or cache files. Voice stays out of npm test (Kokoro is slow); it is covered by the live run.

### F9  docs: pipeline docs, models, report
- docs/PIPELINE.md: stages, artifacts, commands, approvals/autopilot, caching, budgets, how to add sources.
- docs/MODELS.md: what `models check` found (ids, JSON mode, strict tools, limits, caching fields, date).
- docs/ROADMAP.md: add under Phase 3B the carry-over list: (1) body of a subject leaving the side of the frame and the `over` actor's size band are unchecked (S14 opening: small Pandu under a big deer cut at the left edge); (2) edge-intruder warning missed Satyavati's sliver at the right edge in L5; (3) tangents: a pole/pillar/trunk landing on a head (S27 opening, middle priest); (4) expression/talk beats need a readable face (S38 Agni at ~22 % body: pained → relief and burp unreadable); (5) Kunti's entrance in S14 happens off-screen unflagged; the L16 pop-in was removed instead of using the 0.5 s rule; (6) the guide must describe each size by what it shows in this house style (close ≈ head to knees, medium ≈ whole figure), not by film-school names. Also note: the renderer only has the 8 Adi Parva sets; new set kits are a later phase, so topics must be stageable in those sets for now.
- docs/reports/phase-3a.md per the template.

## Acceptance (paste the evidence in the report)
1. npm test green (all earlier tests + the new offline pipeline tests); `fableon all --project work/adi --quality preview` behaves exactly as before.
2. `fableon models check --provider deepseek` output (no secrets) and docs/MODELS.md.
3. LIVE RUN with your DeepSeek key:
   `fableon new work/savitri --topic "Savitri and Satyavan: the princess who out-argued Death" --seconds 90`
   Put the Savitri episode of the K. M. Ganguli Mahabharata translation (public domain; Vana Parva, the Pativrata-mahatmya section, roughly sections CCXCII–CCXCIX — find the exact pages) as plain text in work/savitri/research/sources/, with its URL recorded. Then:
   `fableon run --project work/savitri --to voice --autopilot`
   In the report: per-stage time, calls, tokens and cost; facts (total / verified / unverified); the full "## Script" section of SCRIPT.md; the fact-check table; word count vs target; voice length before and after the fit; the pronunciation TODO list.
4. Run it again: zero model calls (cache). Edit one line of script.json by hand: show `fableon status` before and after (factcheck and voice stale, script `edited`).
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F9 in order.

## Out of scope
Storyboard / AI director (3B), new sets or characters, music/SFX for new projects, rendering new projects, server, frontend, PDF parsing.
