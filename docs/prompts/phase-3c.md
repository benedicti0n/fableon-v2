# Phase 3C — The AI director: shot plan, board writer with measured repair loop, animatic

## Why (architect review of Phase 3B)
1. Vertical wides float: in the S14 opening, the S38 wide and S27, the characters sit in the upper half with an empty floor below. In a 9:16 frame the lowest feet should sit near the lower quarter.
2. S27 key 0 shows priests against a wall; the arena (pole) is never established. Narrative "must show" items need to become measurable `with` context.
3. The cast-sheet group shot has a tree trunk in front of Savitri, who is also cut by the right edge; the sheet board was never validated.
4. Yama's near-black skin (#2b1a1a) hides his black-ink eyes and mouth. USER DECISION: Yama becomes deep indigo-blue.
5. The `over` compile check (distance ratio <= 0.60) is unreachable by the solver (best ~0.66). Judge what the viewer sees instead.
6. The pipeline can write, fact-check, voice  story; it still cannot direct it. This phase adds that, with the same rule: deterministic checks decide, the model proposes, the user approves at checkpoints.

## Ground rules
- The full Adi film renders identically (golden <= 1.0). The authoring fixture may change (data only) and must stay at 0 errors / 0 warnings.
- Every model output is schema-validated and cached; budgets enforced; keys never printed.
- Stable prompt parts first (guide, craft notes, catalog card, examples, schema), variable parts last, so DeepSeek's prefix cache works; report cache-hit tokens.
- The model never invents catalog items; asset gaps use the stand-ins in assets.todo.json.

## Features (one commit each, in this order)

### F1  fix(solver): screen-space `over`, grounded wides, validated cast sheet
- `over`: replace the distance ratio with a screen rule: the over actor's head is 18–30 % of frame height AND at least 1.8 × the `on` subject's head height. The compile-time check predicts the same from geometry. The solver places the camera on the over→subject line at the distance that achieves it (it moves the camera, never the actors). Test: an S14-style two-plane (Pandu over, deer) compiles and passes from at least one side.
- Grounded framing for full/wide/establishing keys: the solver aims the lowest subject's feet at ~78 % from the top. New WARNING `floating subjects` when the lowest subject's feet are above 65 % of frame height. Report the reference film's distribution (warnings only there).
- Recompile the authoring board to 0/0 (data-only fixes where needed). S27 key 0 must establish the arena with `with: ["arena.pole"]`.
- The cast stage validates its own sheet board with measured frames (0 errors: no blocker in front of anyone, nobody cut by an edge); pick marks/side so it passes.

### F2  fix(cast): Yama indigo, face-contrast warning
- Cast check: WARNING `low face contrast <id>` when the skin's contrast ratio against the black ink is < 2.2 (relative luminance, WCAG formula). A warning, never an error: darker skin tones must stay allowed. Add to docs/ROADMAP.md: "feature ink adapts to dark skin tones (light rim on eyes/mouth) so every skin tone keeps readable expressions".
- Re-run `fableon cast --project work/savitri-hi --notes "Yama: deep indigo-blue skin, dark and imposing, traditional blue; keep red attire and crown"`. The skin hue must fall in the indigo/blue range and pass the contrast check. Re-render the cast sheet. Show it to the user at the F3 checkpoint; do not approve for them.

### F3  feat(director): shot plan stage
- New stage `shotplan` (after cast). Inputs: script.json (lines, gloss, beats, delivery, look hints), words.json presented as a compact per-line word table (index, word, start–end s), cast.json (ids, names, one-line look), assets.todo.json, `fableon catalog-card`, light presets, and a new craft file prompts/director-craft.md (<= 2.5 KB) with:
  one idea per key; cut on line or phrase boundaries; open each new place with a wide that shows a landmark of it (mustShow); punchlines and emotional beats closer (medium/close), reveals wider; keep screen direction with `face`; consecutive keys change size by a step or angle by >= 30°; no key longer than ~6 s; let pauses breathe (a key may start on the pause before a punchline); show the speaker when the narration quotes them, then a reaction; use stand-ins for asset gaps; Hindi anchors use word-index form `n:k`.
- Output shotplan.json (schema) + shotplan.md (readable table: shot, time span, Hindi line, gloss, what we see, keys). Shot fields: id, lines, start (anchor), set, light, characters, mustShow [actor | mark | fx | set-piece ids], action (English), keys [{at, size, on, with?, angle, side, move, note}], beats [{who, at, pose | expr | prop | face | talk…}], fx [{kind, at, note}], standIns.
- Deterministic checks (repair loop, max 2): lines covered contiguously from 0 to the last; starts strictly increasing; shot length 1.2–6 s (<= 8 s with `hold: true`), keys >= 0.6 s, average shot 2.5–4 s; every set/mark/character/pose/expr/prop/fx exists; the first shot and every new set open with a wide/establishing key that lists a landmark in mustShow; plan-level jump cuts rejected; every character in a line's look.who appears in that line's shot or the plan says why; light consistent within a scene unless a time change is narrated.
- `fableon shotplan --project P --notes "…"` re-runs with user notes.
- USER CHECKPOINT: show shotplan.md and the new cast sheet; STOP for the user's approval or notes; apply notes until approved (`fableon approve --stage shotplan`, `--stage cast`). Do not approve for them.

### F4  feat(director): board writer with measured repair loop
- `fableon schema --project P --shot <id>`: a slim per-shot schema (the shot's cast ids, its set's marks, catalog enums, fx kinds); report sizes (target <= 20 KB).
- Per shot, the model writes the board shot object. Prompt: [stable] director guide, craft file, catalog card, three example shots from fixtures/adi-parva-authoring chosen by type (two-shot, fx/action, establishing/insert), the slim schema; [variable] the shot-plan entry, the previous shot's last key and actor positions/facing (continuity), the shot's word table, cast ids, stand-ins.
- Loop per shot: write → validate (schema, catalog, anchors) → compile the partial board so far → measured frames for that shot → on any error or warning, send that shot's findings (code, id, measured value, fix hint) back → max 3 repair rounds. Escalate from models.board to models.boardEscalate (project.json) after 2 failed rounds. If it still fails, keep the best attempt, record it as needsHuman in board.review.json with its findings, and continue with the next shot.
- Reuse one engine/browser session for the whole stage (no Chromium restart per check).
- After all shots: compile the full (non-partial) board, validate --deep, measured frames, review images (--split --coverage).

### F5  feat(director): animatic
- Stage `animatic`: render the compiled storyboard at preview quality (540×960) with the existing segment workers, mux voice.wav only (no music/SFX yet), run short_qa (black/white/frozen, planned cuts subtracted) → <project>/animatic.mp4 (not committed) and animatic-qa.md.
- `fableon board --project P --shot <id> --notes "…"` re-runs one shot with a user note (plus the repair loop) and re-renders only that shot's segment.
- USER CHECKPOINT: the user watches animatic.mp4 and approves or gives per-shot notes; apply them until approved.

### F6  feat(fixture): direct Savitri
- For work/savitri-hi: cast (indigo Yama) → shotplan (checkpoint) → board → animatic (checkpoint). Commit to fixtures/savitri-hi: cast.json, cast/cast-sheet.jpg, shotplan.json, shotplan.md, board.json, storyboard.json, frames.json, board.review.json, animatic-qa.md, and review images in docs/reports/phase-3c/ (not the mp4).

### F7  docs: guide, craft, pipeline, roadmap, report
- docs/DIRECTOR_GUIDE.md: the screen-space `over` rule, grounded framing, mustShow → `with`. Stay under 8 KB.
- docs/ROADMAP.md: semantic fx placement (e.g. fire on a mark's box top; the S38 flames float above the trees), dark-skin feature ink, music/SFX for new projects, final-quality render of new projects, Sarvam + aligner, UI.
- docs/reports/phase-3c.md per the template: cost and cache-hit tokens per stage; per-shot rounds, escalations and needsHuman list; findings fixed by the loop (by code); the animatic QA; the user's notes and rounds at both checkpoints.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0) with new tests: screen-space over, grounded framing, face-contrast warning, shot-plan checks (mock), board loop with the mock provider (a shot that fails then passes, an escalation, a needsHuman case), per-shot schema size.
2. Authoring board 0/0, S27 key 0 showing the pole; the cast sheet passes measured frames.
3. Savitri: cast and shot plan approved by the user; full board compiled; measured frames 0 errors (warnings listed) or needsHuman shots listed with reasons; animatic rendered with QA PASS and approved by the user (notes and rounds listed).
4. `git log --oneline` shows the Step 0 docs commit followed by F1–F7 in order.

## Out of scope
Music/SFX for new projects, final-quality render, new sets/props/fx semantics, server, frontend.
