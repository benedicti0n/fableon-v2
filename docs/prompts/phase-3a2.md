# Phase 3A-2 — Hindi narration, voice providers (ElevenLabs), script v2

## Why
1. The audience is Hindi: narration must be Hindi, and Kokoro sounds robotic. Voice becomes a pluggable provider. ElevenLabs is first because it returns character-level timestamps (we need word timings for words.json). Sarvam Bulbul (cheaper, India-native, no word timings → needs a local aligner) is a later phase.
2. Architect review of fixtures/savitri (English):
   a. Lines average ~19 words (reference film: ~12 words, one line every ~3.2 s); the fixed 17-line template forces long, list-like lines.
   b. The deadpan pair fails: "Unluckily, Yama kept granting wishes" is not bad news.
   c. Lines 9 and 11 repeat the same wishes; the "explain" beat recaps instead of explaining; the analogy is muddled.
   d. The real trick (Yama grants "a hundred sons with Satyavan" without noticing he is dead) lands flat, and the twist line is confused.
   e. F1's quote is verbatim but does not support its claim: the quote check proves existence, not support.
   f. Look notes use gestures the cards cannot do (counting on fingers); they must use catalog poses/props/expressions.
3. Word matching is ASCII-only today (norm() keeps a-z and apostrophes): every Devanagari word would normalise to "" and every anchor would break.

## Ground rules
- The English Adi Parva fixture stays identical: golden/stills/audio tests, its anchors and words.json unchanged. fixtures/savitri (English, Kokoro) stays as the English regression fixture; the Hindi result is a new fixture.
- ELEVENLABS_API_KEY comes from the environment/.env with the same rules as the DeepSeek key: never printed, logged, cached or committed. If it is missing, stop at F2's live check and report.
- Voice calls cost money: cache every take by request hash (identical text + settings never billed twice), log characters billed and cost per call in logs/calls.jsonl, and enforce project.json voice.maxCharsPerRun (default .

## Features (one commit each, in this order)

### F1  feat(i18n): Unicode words, anchors and Hindi text
- One shared word normaliser used by the CLI and the engine: NFC, lowercase, keep Unicode letters, combining marks, digits and apostrophes (\p{L}\p{M}\p{N}'), strip danda (। ॥) and other punctuation. ASCII text must normalise exactly as before: a test resolves every Adi fixture anchor to the same frame as today.
- Anchor grammar accepts Unicode words (`12.यम`, `12.यम#1+0.3s`) and a word-index form `12:4` (the 5th word of line 12, 0-based) with the same offsets. Update the authoring schema pattern (Unicode-aware), the per-project schema, docs/AUTHORING.md and docs/DIRECTOR_GUIDE.md.
- project.json `language`: "en" | "hi". Word counts split on whitespace after normalisation. The capitalised-name check applies only to Latin scripts; for Hindi, `names` is checked against script.characters.

### F2  feat(voice): provider interface + ElevenLabs
- Voice provider interface: synth(blocks, settings) → audio + word timings. Providers: `kokoro` (existing; English; output unchanged) and `elevenlabs`.
- Verify against the CURRENT ElevenLabs API docs and record in a new docs/VOICES.md: the text-to-speech with-timestamps endpoint (character alignment and normalized alignment), request stitching for continuity across requests (whatever the docs recommend: previous/next text or request ids), voice settings (stability, similarity, style, speed and its range), which models support Hindi, which output formats the account's plan allows, and current prices.
- Synthesize per BEAT block (consecutive lines with the same beat) with stitching; insert beat pauses locally (as Kokoro does). Build words.json from the alignment: split on whitespace, map every word to its script line; if text normalisation changed characters, use the normalized alignment and map back. Any word whose timing cannot be mapped is interpolated and listed as a warning.
- Write voice.wav in the format audio/mix.py expects (check its sample-rate/channel assumptions; convert with ffmpeg).
- The voice stage reads project.json voice: {provider, model, voiceId, settings, language}.
- Live check (`fableon voice check --provider elevenlabs`): synthesize one short Hindi sentence; print characters billed, cost and the first 5 words with timings. No key in any output.

### F3  feat(voice): auditions
- `fableon voice audition --project P [--voices 4] [--models …]`: find Hindi narration voices (the account's voices plus the shared voice library filtered by Hindi / narration if the API allows — verify), synthesize the SAME short Hindi sample with each candidate voice on each Hindi-capable model, write work/<p>/voice/auditions/<model>__<voice-name>.mp3 and auditions.md (voice name, id, model, characters, cost). Keep the total under 3,000 characters.
- USER CHECKPOINT: after the auditions exist, STOP and ask the user to listen and choose a voice and model. Do not choose for them. Continue with F4 only after they answer.

### F4  feat(voice): measured speaking rate and length fit
- Measure words/s and characters/s from the auditions (or the first take) for the chosen provider + voice + model + language; store it in project.json voice.rate. The script stage uses it for its budgets; 3.75 w/s stays only as the English/Kokoro default.
- Length fit: first the provider's speed setting (within its allowed range), then atempo within ±10 % as before.

### F5  feat(script): script v2 (Hindi, pacing, craft)
- Line count from the target: lines ≈ seconds / 3.2 (reference film: 37 lines in 120 s); words per line from the measured rate. Remove the fixed 17-line template; beats keep the formula order but their line counts scale with length.
- Hindi: conversational Hindi (Hindustani) in Devanagari, short spoken sentences, English loanwords written in Devanagari where natural. Each line gets `gloss` (English translation) in script.json for the fact-check, the director and non-Hindi readers; SCRIPT.md shows the Hindi lines (gloss in the notes section).
- Craft rules in the prompt, and checked where deterministic:
  - deadpan pair = two consecutive lines, good news then bad news (beat check; the fact-check model also judges "is the second line really bad news?");
  - no repeated content: a fact id may be cited by at most one action/snap/consequence line unless that line adds a new fact;
  - explain = ONE line with one everyday analogy for the story's key trick, never a recap;
  - the twist calls back to the hook.
- Look notes use catalog vocabulary only: set + mark, characters, pose, expression, prop as listed by `fableon catalog-card` (check that every named item exists).
- Research: each fact gets `supports: yes | partly | no` from a model check of quote vs claim; only `yes` facts can be cited (F1-style weak quotes drop out).
- Fact-check: cross-lingual (Hindi line vs English facts, using the gloss), plus a craft verdict per line (ok | weak, with a note); weak lines go through the same revise loop (max 2 rounds, no-op guard).

### F6  feat(fixture): Hindi Savitri
- New project from the same topic and source with language "hi" and the user's chosen voice; run brief → voice with --autopilot. Commit fixtures/savitri-hi/ (same file list as fixtures/savitri, plus voice/auditions/auditions.md but NOT the audition mp3s).

### F7  docs: VOICES.md, PIPELINE.md, ROADMAP, report
- docs/ROADMAP.md: add the Sarvam Bulbul provider + a local forced aligner for providers without word timings, and voice/provider selection in the UI.
- docs/reports/phase-3a2.md per the template.

## Acceptance (paste the evidence in the report)
1. npm test green: Adi fixture identical; Unicode anchor tests (Hindi words, word-index anchors, ASCII unchanged); craft-rule tests with the mock provider.
2. docs/VOICES.md with the verified ElevenLabs facts and prices (date + URLs).
3. Auditions made; the user's choice recorded.
4. fixtures/savitri-hi: the script passes every check; fact-check all ok/opinion with no weak craft lines; voice length vs target; words.json monotonic with every word mapped (or warnings listed); per-stage cost including voice characters and $.
5. The report includes the full Hindi script with its English gloss, the fact-check table (facts + craft), the measured speaking rate and the audition list.
6. `git log --oneline` shows the Step 0 docs commit followed by F1–F7 in order.

## Out of scope
Sarvam/other voice providers, the local aligner, the AI director (Phase 3B), music/SFX, server, frontend.
