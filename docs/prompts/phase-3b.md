# Phase 3B — Director foundations: script/voice integrity, composition rules v3, cast design

## Why (architect review of fixtures/savitri-hi and the 2F carry-over)
1. The script normaliser glued sentences together without punctuation (lines 7, 8, 10, 15, 17: "…गया काम करते-करते…", "…प्रकट हुए काले शरीर…", "…चल दिए सावित्री…", "…मिलें दूसरा…", "…हों यम ने…") and copied line 15's gloss onto line 16. Automatic repairs must never damage text.
2. F2 ("Twice I shall not select.", verbatim, 25 characters) was rejected by the 30-character quote minimum, losing the story's strongest character line. Narada (नारद) is named in line 2 but declared nowhere.
3. The narration was sped up 9.9 % (98.89 → 90.0 s) because p.
4. The look hints stage the forest scenes (lines 7–20: wood-cutting, Yama, the walk south, the boons) in the village set.
5. The 2F carry-over (docs/ROADMAP.md, Phase 3B): body of a subject leaving the side of the frame and the `over` actor's size are unchecked; the edge-intruder warning missed Satyavati's sliver in L5; tangents (a pole on a head, S27); faces too small for expression beats (S38 Agni); entrances off-screen unflagged (S14 Kunti); the guide names sizes by film-school terms instead of what they show in this house style.
6. The AI director (Phase 3C) needs a designed, approved cast for any new story.

## Ground rules
- The Adi Parva film renders identically (golden <= 1.0, stills, audio); fixture edits in this phase are DATA ONLY.
- The director board fixture (fixtures/adi-parva-authoring) must end at 0 errors / 0 warnings again under the new rules (data-only fixes, no pixels of the full film change).
- Changes to fixtures/savitri-hi go THROUGH the pipeline (hand edit of script.json as a user would, then `fableon run`), never by writing outputs directly.
- Voice/LLM calls: cache, budgets and logs as before; keys never printed.

## Features (one commit each, in this order)

### F1  fix(script): text integrity, quotes, names, pause-aware budget and fit
- The deterministic normaliser never produces malformed text: a merge joins sentences with "।" (hi) or "." (en) plus a space; a split splits the gloss too (or asks the model for the two glosses); a gloss is never duplicated. Every normaliser intervention is logged in the stage result (count + lines) and shown in the report. Prefer prevention: give the model the line plan (one slot per line with its beat and target word count) so it rarely needs repair. Tests reproduce the five glued lines and the duplicated gloss.
- Quote verification: verified if verbatim AND (>= 30 characters OR it occurs exactly once in the source and is >= 12 characters). Test: F2 passes, a 12-character quote that occurs twice fails.
- Names: the script lists every named person/place in `names`; each named person must be in `characters` or in a new `mentions` list ({id, name, role}); checked for Hindi and English.
- Pause-aware budget: word budget = (seconds − planned pauses − beat gaps) × rate.
- Fit modes in project.json voice.fit: "natural" (default for eleven_v3 and other expressive voices): keep the natural length if it is within ±12 % of seconds; otherwise (1) scale our own local pauses down (not below 60 % of planned), (2) the provider's speed setting if the model honours it (verify for v3), (3) atempo for the rest, at most ±6 %, else fail with the suggested word change. "exact": hit seconds exactly as now. Report each step's contribution.

### F2  fix(fixture): refresh savitri-hi through the pipeline
Hand-edit fixtures/savitri-hi/script.json (as a user would), then run the stale stages:
- line 0 → "एक राजकुमारी ने ऐसे आदमी से शादी की, जिसके पास जीने के लिए सिर्फ़ एक साल बचा था।" (gloss unchanged; "जिसकी उम्र सिर्फ़ एक साल थी" can read as "who was one year old").
- line 7 → "एक दिन सत्यवान जंगल में लकड़ी काटने गया। काम करते-करते उसके सिर में तेज़ दर्द हुआ।"
- line 8 → "वहीं यम प्रकट हुए। काला शरीर, लाल आँखें, लाल वस्त्र, हाथ में पाश।" (update delivery.emphasis काले → काला)
- line 10 → "यम ने सत्यवान के प्राण निकालकर बाँध लिए और दक्षिण की ओर चल दिए। सावित्री पीछे-पीछे चल दी।"
- line 15 → "सावित्री ने पहला वर माँगा: ससुर की आँखें वापस मिलें। दूसरा: ससुर का राज्य वापस मिले।" with gloss "Savitri asked the first boon: her father-in-law's eyesight restored. Second: his kingdom restored."
- line 16 gloss → "Third: a hundred sons for her father."
- line 17 → "चौथा वर: सावित्री और सत्यवान के सौ पुत्र हों। यम ने तुरंत कहा, तथास्तु।"
- look hints for lines 7–20: set "deer" (the forest clearing), marks chosen from that set; keep who/pose/expr/prop.
- add `mentions`: नारद (Narada, the sage who warns).
Then `fableon status` (script edited; factcheck, voice stale) and `fableon run --to voice` with voice.fit "natural". Report: the fact-check result, natural length, the fit steps used, words.json checks, cost. Add F2 ("Twice I shall not select.") to research only if the research stage is re-run for another reason; do not re-run research just for it.

### F3  fix(validator): composition rules v3 (the 2F carry-over)
Each rule with a regression test built from the 2F case named:
- ERROR `cut subject <id>`: in full/wide/establishing keys a subject's whole silhouette must stay inside the side margins (close/medium may cut the body at the bottom only). (S14 opening deer.)
- ERROR `over not foreground <id>`: the `over` actor's head must be 18–30 % of frame height and it must be nearer than the `on` subject (distance ratio <= 0.6). (S14 opening Pandu.)
- Fix the edge-intruder bug: a non-subject actor cut by a side edge with >= 1 % area and < 50 % visible must warn. (L5 Satyavati sliver, frames 508/544/571.)
- WARNING `tangent <world>/<actor>`: a thin world object (pole, pillar, trunk, post: height/width >= 4) whose silhouette touches or crosses a person's head box. (S27 opening, middle priest.)
- WARNING `face too small <id>`: a `do` beat changing expr, or a talk/says window, while that actor's head is < 6 % of frame height. (S38 Agni.)
- WARNING `entrance off-screen <id>`: enter/exit/appear of ANY actor (subject or not) while it covers < 4 % of the frame, unless the beat has `offscreen: true`. (S14 Kunti.)
- Re-run the director board: fix it (data only) to 0 errors / 0 warnings; restore the L16 brothers' staggered pop-in using the 0.5 s present rule. Update the full-fixture warning table (warnings only, pixels unchanged).

### F4  docs(guide): sizes by what they show
- From the calibrated targets, describe each size by what is visible on these bean characters (e.g. close ≈ head to knees, medium ≈ whole figure filling about half the frame height, …) with reference frames from the director fixture. Rewrite the size table in docs/DIRECTOR_GUIDE.md that way and add the F3 rules and fixes. Keep it under 8 KB.

### F5  feat(director): cast stage and cast sheet
- New stage `cast` (depends on script): inputs script characters + mentions + their look text, the facts, and the catalog's Spec vocabulary (builds, heads, clothing fields, colours) with the existing castlist (C.*, KIDS.*) as examples.
- Output cast.json: {characters: [{id, name, spec (inline Spec) | castlist key, scale, mustHave: [traits], notes}]}, validated against the Spec schema.
- Deterministic checks: every character and mention present; main characters visually distinct (skin, top/drape/sari colours differ by CIE ΔE >= 15 between any two main characters; not all the same build/head); every mustHave trait maps to a Spec field (e.g. Yama: dark skin, red attire, crown/diadem — from the source; Savitri: woman, sari, long hair; Satyavan: young man, simple forest clothes; Narada: sage, topknot, beard).
- Asset gaps: objects the script needs that the catalog lacks (e.g. Yama's noose) go to assets.todo.json (object, lines, suggested stand-in such as `net`, priority). Never invent catalog items.
- Cast sheet: compile a one-shot board on a neutral set (hermitage clearing, day light) with all characters in a row at full size, plus one solo still per character; write <project>/cast/cast-sheet.jpg (labelled, ≤ 1600 px tall). `fableon cast --project P [--notes "…"]` re-runs the stage with the user's notes (e.g. "make Yama more menacing").
- Run it for fixtures/savitri-hi and commit cast.json, assets.todo.json and cast/cast-sheet.jpg.
- USER CHECKPOINT: after the cast sheet exists, STOP and ask the user to look at it and approve or give notes. Apply notes with `fableon cast --notes` until they approve, then `fableon approve --stage cast`. Do not approve for them.

### F6  docs: report
- docs/reports/phase-3b.md per the template: normaliser interventions; the quote rule; F2 refresh results (fact-check, natural length, fit steps, cost); the F3 rule table with regression cases and the director board back at 0/0; the new size table; the cast (cast.json summary, mustHave mapping, asset gaps) and the cast-sheet image path; total cost.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0) plus the new tests.
2. fixtures/savitri-hi: the edited lines are correct, fact-check clean, voice re-made with natural fit (length and fit steps reported), words.json monotonic and complete.
3. Director board 0 errors / 0 warnings under the v3 rules; the L16 pop-in restored.
4. Cast sheet committed and approved by the user (their notes and the rounds listed in the report).
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F6 in order.

## Out of scope
The shot plan, board writer and animatic (Phase 3C), new sets or props, music/SFX, server, frontend.
