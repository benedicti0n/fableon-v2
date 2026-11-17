# Phase 3E — Model routing, Sarvam voice with performance, continuous scenes, Bakasura end to end

## Why (user rating of final.mp4: 7.8/10)
User: "the direction is good; the audio is still kinda robotic — use the Nachiket voice from Sarvam; the emphasis and proper pausing is lacking, it's like the audio is just narration; the background sound effects are repetitive and sound weird; the lighting is kinda flat." Also: "don't rely on just two providers — assign each task to the best and cheapest model."
Architect review:
1. Voice: Phase 3D capped every pause at 0.12 s to match the reference's pace, which also removed the performance. Wanted: fast speech WITH deliberate pauses and stressed words.
2. Models: Flash fell back to Pro 34 times (script 23, shotplan 8, sound 3). The shotplan failures came from asking the model to hit statistical shares (DOF %, foreground %, hold %). Models choose content well and quotas badly.
3. Editing: 24 crossfades in 28 shots. The reference dissolves only at place/time changes; inside a scene the camera keeps moving from subject to subject.
4. The Bakasura dry-run script passes the formula checks but the mystery question is never answered, the analogy is muddled and the payoff does not call back to the hook. Structural checks are necessary, not sufficient: script quality needs a stronger writer, chosen by blind human review.
5. Sound and lighting are Phase 3F (not this phase). Video-to-audio Foley models look non-commercial; Phase 3F will use licensed libraries plus context-aware selection.

## Ground rules
- The full Adi film renders identically (golden <= 1.0), Adi audio unchanged, authoring board 0/0.
- Keys (DEEPSEEK_API_KEY, ELEVENLABS_API_KEY, OPENROUTER_API_KEY, SARVAM_API_KEY) are never printed, logged, cached or committed. Requests to third parties carry no personal data; use a generic app name ("Fableon") in any attribaders.
- No new ElevenLabs calls (the Callum reference comes from cached takes).
- Budgets: OpenRouter spend in this phase <= $5; Sarvam <= ₹200; DeepSeek as needed. Abort a run that would exceed its budget.
- Every model output is schema-validated and cached; every fallback is logged.

## Features (one commit each, in this order)

### F1  feat(models): provider registry and OpenRouter
- Providers: `deepseek` (direct), `openrouter` (OpenAI-compatible; base https://openrouter.ai/api/v1; key OPENROUTER_API_KEY), `sarvam` (its chat LLM if the API offers one — verify), `mock`.
- `fableon models catalog --provider openrouter`: fetch the live model list with per-token prices, context length and supported parameters (response_format / structured outputs) into models.catalog.json (dated). Request privacy-respecting routing where OpenRouter supports it (e.g. a provider preference that denies data collection — verify in its docs).
- JSON: use response_format json_object where the model supports it; otherwise JSON-only prompting; ajv + repair either way.
- Routing in models.json: per stage {primary, fallback[]}, each {provider, model, settings}; cost computed from the catalog for OpenRouter and from models.json prices for DeepSeek.
- Tests with mocked HTTP for each provider (JSON mode on/off, error bodies, rate limits).

### F2  feat(director): the model chooses, code allocates; continuous scenes
- The shot-plan model outputs CONTENT only: scenes (place + time + light), shots (lines, who, what we see), keys (size, subject, with/mustShow), marks (punch, impact, drama, reveal), moves, beats, fx. It is never asked to hit percentages; remove film-level shares from its repair messages.
- A deterministic allocator assigns DOF, foreground props, creeping holds and push rates, low heights, transitions and easing so the film-level limits from 3D are met. Report the allocator's choices.
- Continuous scenes: the translator merges all consecutive shots of a scene into ONE board shot whose keys glide or burst between framings. Crossfades only at scene boundaries (target <= 6 for Savitri), a flash after the hook, <= 2 hard cuts.
- Holds must visibly creep: measured screen change over any 2 s hold >= 6 % (scale or position); add the check.
- Tests: a Flash plan that previously failed the shares now passes after allocation; merged scenes compile and pass measured frames.

### F3  feat(eval): bake-off harness and routing table
- `fableon bakeoff --stage <stage> --models <list> --cases <cases> [--budget <usd>]`: runs one stage on fixed, cached inputs across candidate models and records first-try pass, pass after repairs, repair count, tokens, cost, latency, plus stage-specific quality:
  - research: verified-quote rate, supports=yes rate, coverage of the reviewed Savitri/Bakasura fact lists;
  - script (hi): formula checks + a BLIND human ranking (see the checkpoint);
  - factcheck: a seeded test — take a clean script and plant 6 errors (3 unsupported claims, 2 distortions of numbers or who did what, 1 invented name) among clean lines; measure recall and false positives;
  - shotplan: content-check pass rate after allocation, plus anchor validity;
  - cast, sound cues, performance (F5): checks pass.
- Candidates: choose from the live catalog 5–7 models per stage across price tiers (cheap: DeepSeek Flash direct and comparable Gemini Flash / Qwen / GPT-mini / Llama / Mistral class models; premium: 1–2 flagship models, only for script and shotplan where token counts are small; plus Sarvam's LLM for the Hindi script if available). Put the shortlist with prices in the report BEFORE running.
- Cases: savitri-hi and bakasura-hi.
- USER CHECKPOINT (script): write bakeoff/script/blind.md with each model's Hindi script + gloss under anonymous labels (A, B, C…), STOP and ask the user to rank them. Reveal the names only after the ranking.
- Selection rule: per stage, the cheapest model whose quality is within 5 % of the best and whose first-try pass >= 80 % (script: the user's top choice unless it costs > 10× the runner-up). Write the routing table to models.json and the full results to docs/MODELS.md.

### F4  feat(voice): Sarvam provider, forced aligner, credit meter
- Verify Sarvam's current TTS docs and record in docs/VOICES.md: endpoint, Bulbul models, the speaker list (find "nachiket"; speaker names are lowercase and model-specific; if absent, list the closest male narrators and tell the user), pace range, request character limit, output formats, price, and the fact that Bulbul does not support SSML.
- Word timings: a local forced aligner using the known script text (e.g. torchaudio MMS forced alignment with romanisation; whisper word timestamps as a fallback). Validate on the Savitri ElevenLabs take against its true alignment: median |error| <= 50 ms, p95 <= 120 ms. Report the numbers.
- Performance without SSML: render phrase by phrase at the pause marks with exact local silences; pace through the API pace parameter (not DSP) where possible; test emphasis methods for Bulbul (comma or ellipsis before the word, a micro-split, or none) in the auditions.
- Credit meter: `fableon voice budget` shows the remaining quota/balance per provider (ElevenLabs subscription; Sarvam if its API exposes it) and warns before a run would exceed it. Provider fallback order in project.json.
- Draft/final voice: drafts with the cheapest configured voice, finals with the chosen one; the storyboard re-times automatically from word anchors.

### F5  feat(voice): performance direction and Nachiket auditions
- New `performance` stage (model from the routing table): reads the whole script like a voice director and marks, per line, tone, relative pace, pauses (after the hook, before punchlines, after a question, at the deadpan turn, before the payoff) and stressed words. Deterministic limits: total pause time <= 8 % of the narration; each pause 0.15–0.6 s; <= 2 stressed words per line; relative pace 0.9–1.2.
- Auditions in work/savitri-hi/voice/auditions/round3/ with round3.md: an 8-line Savitri excerpt (hook, deadpan pair, the fourth-boon trick, the twist) rendered with Sarvam Nachiket (each Bulbul model that offers him) × {plain, performance-marked} × pace {1.10, 1.25}, plus the cached Callum v3 round-2 take as the reference (no new ElevenLabs call).
- USER CHECKPOINT: STOP; the user chooses provider, voice, model, marked or plain, and pace.
- Then re-voice the full Savitri script with the choice (draft first if useful), align, fit "natural", and rebuild words.json; re-run shotplan → allocator → board → sound (the existing 3D sound stage) → animatic.
- USER CHECKPOINT: the user rates the Savitri animatic and gives notes.

### F6  feat(fixture): Bakasura end to end with the routed models
- work/bakasura-hi from topic to animatic, using the routing table: brief → research → script (USER CHECKPOINT: approve or give notes) → factcheck → performance → voice (the chosen voice) → cast (USER CHECKPOINT: cast sheet) → shotplan (USER CHECKPOINT: shotplan.md) → allocator → board → sound → animatic (USER CHECKPOINT: rating and notes).
- New props or set pieces the story needs (e.g. the cart of food) go to assets.todo.json with stand-ins; never invent catalog items.
- Commit fixtures/bakasura-hi/ (same file list as fixtures/savitri-hi, no mp4s or stems) and review images in docs/reports/phase-3e/.

### F7  docs: report and roadmap
- docs/reports/phase-3e.md per the template: the candidate shortlist with prices; the bake-off results tables per stage; the user's blind ranking; the routing table; the factcheck seeded-test recall/false positives; aligner accuracy; Sarvam facts and the Nachiket finding; the round-3 audition list and the user's choice; Savitri and Bakasura stats (cuts, crossfades, flashes, hold creep, punches); user ratings and notes; cost per provider and per stage; every fallback.
- docs/ROADMAP.md, Phase 3F: context-aware sound (licensed SFX libraries such as CC0 packs plus commercially-licensed generative fill; an LLM picks sounds per event and per scene ambience bed, with no-repeat rules; a licence ledger for every sound; music variation), lighting design (directional key per scene — side or three-quarter light, golden backlight with rim, moon key at night; a measured flat-lighting check calibrated on the reference: luma std, p2/p98), whip pans, new set kits, UI.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, Adi audio unchanged, authoring 0/0) with new tests: providers (mocked), allocator, continuous scenes, hold creep, bake-off scoring, seeded factcheck scoring, aligner accuracy check, performance limits, budget guard.
2. The routing table is in models.json, justified by the bake-off; OpenRouter spend <= $5.
3. Savitri re-voiced with the user's chosen voice, animatic rated by the user.
4. Bakasura made end to end with all four user checkpoints and an animatic rated by the user.
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F7 in order.

## Out of scope
New sound sources and lighting (Phase 3F), new set kits, server, frontend.
