# Phase 3D — Reference-style direction, pace and sound; the first complete film

## Why (user rating of the Savitri animatic: 6/10)
User: "the voice over is very good and expressive but it can be a little faster, maybe 15 %; the camera direction is ok-ish; follow the cartoon-3d-short skill for camera work, script generation, hooks and sound effects."
Architect review against the skill's measured style (SKILL.md, STYLE_BIBLE.md):
1. Editing: the reference has 0–1 hard cuts per video; transitions are continuous camera moves (follow an object from one subject to the next, fast pans), a 6–8 f crossfade on place changes, and white flashes. Our plan is 29 shots joined by hard cuts.
2. Camera: the reference holds ~80 % of frames with a creeping push-in (0.15–0.35 %/f, 0.6 %/f on punch words); moves are ease-out bursts (peak speed on the first frame, decaying over ~8–10 f); 4–5° rolls for drama; flip shakes decaying over 7 f on impacts; DOF on ~1/3 of screen time (close-ups 12–14 px, mediums 10–12 px at 1080 wide, wides sharp); foreground props in ~1/3 of shots; low camera heights; every visual reaction lands 0–3 frames before its word; lighting changes with story beats (day → sunset → night). Our keys are almost all eye-level / front / push, with no punch-ins, rolls, kicks, DOF choices, flashes or foreground props.
3. Pace: the reference narrator is fast and steady with almost no pauses (word gaps > 0.25 s total < 1 s per video). Our delivery added many dramatic pauses.
4. Sound: the animatic has no SFX or music; new projects have no sound stage.
5. S20 is a "follow" shot in which nobody walks (no motion path), cker and a too-small face.
6. Script formula (STYLE_BIBLE, 20/20 videos): hook = a paradox stated as fact in sentence 1, no setup, ~10–16 words; setting in 1–2 lines; escalation 3–6 beats with short in-character dialogue lines and 1–2 exaggeration jokes; one mystery beat (a question); the pivot "You see," into the real mechanism, often via an everyday analogy; an ironic payoff in the last 1–2 sentences; the video ends on the last word. The Savitri script spends 6 lines on setting and has no mystery beat or pivot.

## Decisions (from the user)
- DeepSeek V4.1 Flash (`deepseek-flash`) is the default for EVERY stage. A stage may fall back to deepseek-v4-pro only after all its repairs fail; record every fallback in the report. (Per-stage model routing across providers is Phase 3E.)
- No new ElevenLabs calls in this phase (805 characters left on the free plan). Pace changes are made locally from the cached base take.
- The board writer stays deterministic (plan → board + measured variants). Creativithe shot plan; the translator learns the reference camera language. Keep models.board/boardEscalate in models.json, marked "unused, Phase 3E bake-off".

## Ground rules
- The full Adi film renders identically (golden <= 1.0) and its audio test is unchanged. Every new engine feature (transitions, easing, rolls…) is opt-in, with old defaults unchanged.
- The authoring fixture stays 0 errors / 0 warnings (data-only changes allowed).
- Every model output is schema-validated and cached; budgets enforced; keys never printed.

## Features (one commit each, in this order)

### F1  chore(models): flash by default
- models.json stageDefaults: deepseek-flash for brief, research, script, factcheck (thinking enabled at the lowest effort that passes), cast, shotplan. Per-stage fallback to deepseek-v4-pro only via an explicit `fallback` entry, used after repairs fail and logged as a fallback.

### F2  feat(voice): reference pace (local, free)
- Rebuild the voice from the CACHED Savitri base take (no ElevenLabs call): dramatic pauses only before the hook's punchline, the second line of the deadpan pair and the twist (each <= 0.35 s); every other planned pause <= 0.12 s; beat gaps <= 0.15 s.
- Make three variants with pitch-preserving tempo on speech: pace 1.10, 1.15 and 1.20. Write work/savitri-hi/voice/pace/{1.10,1.15,1.20}.wav and pace.md (length, words/s).
- USER CHECKPOINT: STOP and ask the user to listen and choose a pace. Do not choose for them. Then write the chosen voice.wav + words.json (word timings from the alignment, scaled; monotonic and complete) and store voice.pace and voice.pauses in project.json.
- For future takes: apply pace with the provider speed setting at generation when the model honours it (better quality than DSP), local tempo only for the final fit. The script budget uses the paced delivered rate.

### F3  feat(script): reference script formula
- Script prompt rewritten from STYLE_BIBLE's formula (story mode, present tense) with a language table for pivots: en "You see," / hi "दरअसल," or "असल में," (configurable).
- Beats: hook | setting | escalation | mystery | pivot | analogy | payoff (keep the deadpan pair as an optional escalation device; map the old beats when reading old scripts).
- Deterministic checks (repair loop): the hook is line 0, <= 16 words, no setup clause; setting <= 2 lines; escalation 3–6 lines with >= 1 short quoted in-character dialogue line; exactly one mystery line ending in "?" before the pivot; the pivot line starts with a pivot phrase; the payoff is the last 1–2 lines; the median sentence length is within the language's band (en 10–16 words, hi 8–14); every visual line is literal (look hint with who + action). The model gives an advisory judgment of "paradox stated as fact" for the hook.
- Dry run (script only, no voice): a NEW project `work/bakasura-hi`, topic "Bhima and Bakasura: the demon's dinner who ate the dinner first", source = the Ganguli Adi Parva, Vaka-vadha section (public domain; find the exact pages and record the URL), language  script → factcheck with flash. Report the full script with gloss and the checks. Do NOT run voice (ElevenLabs quota).

### F4  feat(director): reference camera language
- Scenes and transitions: the shot plan groups shots into scenes (one place + time). Inside a scene the camera is continuous: framing changes are glides (smootherstep 18–40 f) or ease-out bursts (new easing "burst": peak speed on the first frame, decaying over 8–10 f), pans, or follows from one subject to the next. Between scenes: `transition` per boundary = crossfade (6–8 f) | flash (4-frame white) | cut. Add `transition` to the board schema, compiler and engine (opt-in; default stays as today). Film-level limits (checked): <= 2 hard cuts per film, a flash after the hook (at most 3 flashes), a crossfade on every place/time change.
- Direction marks the planner sets on keys/beats (schema + translator + checks):
  - `punch: "<anchor>"` → push burst 0.6 %/f at that word (holds otherwise creep 0.15–0.35 %/f; no static hold >= 4 f);
  - `impact: "<anchor>"` → flip shake decaying over 7 f;
  - `drama: true` → 4–5° roll;
  - `reveal: true` → pull-back / crane;
  - reactions land 0–3 f before their word (translator offsets the beat);
  - `foreground: "<prop or mark>"` → a recognisable near-framing prop >= 2 m from the lens (target ~1/3 of keys; measured: not a blob, not cut by an edge);
  - DOF per size (close 12–14 px, medium 10–12 px at 1080 wide, wides/establishing 0), on ~25–40 % of screen time;
  - low camera heights by default for full/wide.
- Movement: shot-plan `moves: [{who, from, to, at, until, gait: walk|run}]` → motion paths with the walk cycle; a `follow` key must follow a moving subject (fixes S20).
- Light tells time: the planner may progress day → golden → night across scenes (crossfade at each change), following the story.
- Film-level checks (deterministic, in the shot-plan repair loop and after compile): cuts <= 2; hold share 70–85 %; DOF share 25–40 %; foreground share 25–40 % of keys; at least one punch per payoff/mystery/hook line; every impact in the narration has a kick or fx; every measured rule still applies.
- Update prompts/director-craft.md (<= 3 KB) and docs/DIRECTOR_GUIDE.md (<= 8 KB) with these rules, citing the skill's numbers.

### F5  feat(sound): sound stage for new projects
- Stage `sound` (after board). The model (flash) writes cues.json from the script, the shot plan and the board's events: music sections per scene (mood, tempo, intensity, instruments from the existing synth set: tanpura drone, sitar-like pluck, flute, tabla, plus any others in instruments.py), stingers (hook, mystery, payoff), and SFX events tied to anchors. A deterministic default map turns board events into SFX without asking the model: puff → poof, sparkle → shimmer, kick/impact → thud, flash → whoosh-hit, appear → pop, arrow → whoosh+thunk, walk → soft steps, burst glide → light whoosh. Checks: anchors resolve; <= 1 SFX per 1.2 s; no SFX on a punch word's first 0.2 s unless it is the impact itself.
- Generalise the existing audio code (audio/ + the skill's templates/audio) to render from cues.json: synthesized SFX + an original score, ducked under the voice (bed 5–10 dB below speech), the skill's standard mix (music +3 dB, SFX −6 dB, voice unchanged), −14 LUFS integrated, true peak <= −1.3 dBTP, length exactly equal to the video. The Adi fixture's audio test stays unchanged.
- Output mix.wav + stems + cues.md (human-readable cue sheet).

### F6  feat(fixture): Savitri v2, animatic with sound, final render
- With the chosen pace (F2): shot plan v2 with scenes, transitions and direction marks (USER CHECKPOINT: show shotplan.md, STOP for approval or notes) → board → sound → animatic WITH the mix (USER CHECKPOINT: the user watches it and rates it out of 10 with notes; apply notes per shot with `fableon board --shot … --notes`, re-render only those segments; repeat until approved) → final render 1440×2560 + short_qa → work/savitri-hi/final.mp4.
- Commit to fixtures/saviyboard.json, frames.json, board.review.json, cues.json, cues.md, animatic-qa.md, final-qa.md, and review images in docs/reports/phase-3d/. Do NOT commit the mp4s or stems.

### F7  docs: report
- docs/reports/phase-3d.md per the template: the pace variants and the user's choice; flash usage and every fallback; the Bakasura dry-run script with gloss and its checks; film-level camera stats for Savitri v2 (cuts, hold share, DOF share, foreground share, punches, kicks, rolls, transitions); the cue sheet summary and the loudness/peaks; the user's animatic rating, notes and rounds; final render time and QA; cost per stage (DeepSeek $, ElevenLabs characters = 0); ROADMAP update (Phase 3E: per-stage model bake-off across OpenRouter models + direct providers, Sarvam voice + local aligner, credit meter, draft/final voice; later: whip pans with motion blur, new set kits, semantic fx placement, UI).

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, Adi audio unchanged) with new tests: pace rebuild from cache, script formula checks (mock), transitions/burst easing/roll/kick/DOF/foreground translation, film-level camera checks, motion paths for follow, the cue-sheet checks and the mix loudness.
2. Authoring board 0/0.
3. Savitri v2: pace chosen by the user; shot plan approved; film-level camera stats within the limits; animatic with sound approved with the user's rating; final 1440×2560 render QA PASS.
4. Zero ElevenLabs characters billed in this phase; DeepSeek flash by default with fallbacks listed.
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F7 in order.

## Out of scope
Per-stage multi-provider routing and the bake-off (3E), Sarvam, new sets/props, whip pans with motion blur, server, frontend.
