# Phase 2E — Camera truth: measure what the camera sees

## Why (architect review of docs/reports/phase-2d-shots.jpg)
Every 2D acceptance number passed, yet the sheet shows frames a human would reject. All of them passed the validator because it estimates the picture from geometry instead of measuring it:
1. S14 f1220: `over` puts Pandu's face in the lower-left corner, cut by the frame edge and looking into the lens. Characters are flat cards with no back view, so a literal over-the-shoulder reads as "Pandu stares at us".
2. S27 f2511: a full-height column stands in the middle of the frame in front of the arena; Draupadi is not visible. The blocker check only knows actors/effects, not set geometry.
3. S5 f465: "wide" on Shantanu (ghat) + Satyavati (boat) renders both as specks (< 5 % of frame height). Nothing checks minimum size.
4. S22 f1978/2029: "widn kidBhima frames him like a full shot against a trunk; the mango tree (the point of the shot) is out of frame. Today `wide` on one subject == `full`.
5. L5: the camera cuts to Satyavati exactly when the fisher starts talking ("5.father's"); the speaker is off-screen for his whole line. The medium also looks out to sea instead of at the hut.
6. S38: the board uses `golden`, and the treetop fire is not in frame; the original fixture is night with the forest burning behind Agni. The story beat is lost.
7. The review sheet samples each shot's exact start frame, which is inside the crossfade: 9 of 12 opening frames are double exposures, and keys between start/mid/end (S27's insert, Draupadi's medium) never appear.
8. Two objects are still open: the `params` inside a `do` beat and an actor's `params` when `special` is absent are `{"type":"object"}` (JSON Schema treats that as open even without `additionalProperties: true`).
Phase 3 will have an AI director repair its boards from validator feedback. The feedback must measure what is really on screen.

## Ground rules
- The full fixture film renders identically: golden <= 1.0 MAD, stills test unchanged. The new coverage render is a separate path and never runs in normal renders.
- Compiler, solver and validator stay deterministic.
- Every new field: schema + docs/AUTHORING.md + docs/DIRECTOR_GUIDE.md.
- All thresholds live in ONE constants module (e.g. cli/src/composition.js) with a comment per value.

## Features (one commit each, in this order)

### F1  fix(schema): close the last open objects
- `do` beat `params`: typed per the actor's `special` (same defs as the actor's params); forbidden when the actor has no special.
- Actor `params` without `special`: forbidden.
- In the base authoring schema, Row `pose`/`expr`, actor `pose`/`expr`, `do` beat `pose`/`expr` and Talk `base` use the catalog enums (not free strings); `prop` uses the props enum or null.
- Add a test that walks the generated per-project schema and fails on ANY object schema that lacks `additionalProperties: false` (except the declared maps: cast, points, groups) — not just on `additionalProperties: true`.

### F2  feat(engine): coverage pass (object-ID render)
- Engine: `window.coverageFrame(f, opts)` evaluates frame f exactly like `renderFrame(f)` (same shot, camera, actors, effects, set pieces) but renders a flat ID image: every material replaced by an unlit ID colour, no post chain, no fog, no DOF/lens blur, no crossfade blend (measure only the shot that owns frame f). Cut-out cards (people, specials, effect cards) must keep their exact silhouette: the ID material samples the card's alpha (alphaTest 0.5). Render into a WebGLRenderTarget without AA (NearestFilter), default 180x320, IDs encoded in RGB.
- IDs: each actor (cast id or generated id), each special, each effect (fx id or `kind#index`), each set piece, world meshes grouped by catalog name/volume (e.g. `world:arena.pillar`), and reserved ids for sky, ground and water.
- Output per frame: for every id → pixel count, bbox (0..1), nearest camera distance; for every person/special → projected head box (top of hair/crown to chin) and eye point from the rig; for every SUBJECT of the active key (and the `over` actor and `with` items, see F4) → visible fraction = visible pixels / pixels when rendered alone (a solo pass with everything else hidden).
- `render.cjs coverage --frames … --out cov.json [--png dir]` (`--png` writes the ID image plus a legend for debugging).
- Record ms/frame at 180x320 on this machine in docs/BENCHMARKS.md (target <= 60 ms incl. solo passes for up to 6 subjects).
### F3  feat(validator): measured composition checks
`fableon frames` uses the coverage pass by default (`--fast` keeps the old analytic path). Checked frames per camera key: the SETTLE frame (first frame >= key start with no crossfade active and any glide/tilt finished; for a cut, at least key start + 6), the key's middle, and key end - 2; plus every 12 frames for keys longer than 2 s.
- Checks (ERRORS for semantic keys from boards; for hand-written v1 keys the same findings are WARNINGS):
- `subject hidden <id>`: visible fraction < 0.6 (the `over` actor is exempt).
- `subject too small <id>` / `subject too large <id>`: the primary subject (first in `on`) outside its size band; any other listed subject below the band's floor. Starting bands (head = head-box height / frame height; body = top of head to feet / frame height):
  close head 40–60 % · medium head 26–42 % · full body 50–85 % · wide body 15–50 % (others >= 10 %) · establishing: listed subjects >= 5 % · insert: target box 30–85 %.
  CALIBRATE before freezing them: measure every keyed settle frame of the hand-tuned full fixture, classify each key by the band its primary subject matches best, publish the distribution in the report, and widen a band if it would reject more than 10 % of comparable fixture keys (say which and why). The fixture is the house style.
- `head cut <id>`: a subject's or the `over` actor's head box crosses a frame edge (top/left/right; bottom only allowed for `close` when the chin is inside).
- `blocker <id>`: any non-subject id (actor, effect, set piece OR world mesh; sky/ground/water excluded; ambient effect kinds exempt as in 2D) that is nearer than the nearest subject AND covers > 12 % of the frame or overlaps the primary subject's box by > 25 %. The `over` actor is exempt while it stays in its corner.
- `context missing <id>`: an item listed in the key's `with` (F4) covers < 2 % of the frame or less than 40 % of it is visible.
- WARNING `speaker off-screen <id>`: an actor whose `talk`/`says` is active for >= 1 s while covering < 4 % of the frame, unless the key has `"reaction": true` (deliberate cutaway; add to schema).
- Eye line stays a WARNING, now measured from the projected eye point.
- Write `frames.json` next to the board: per key → checked frames, per subject {height %, visible fraction, head box, eye line %}, blockers, context items, errors, warnings, each with a one-line fix hint. Document the format in docs/AUTHORING.md: this is the Phase 3 repair-loop input.
- Tests: the S27 column case (a world mesh in front) → `blocker`; two far-apart subjects in a wide → `subject too small`; a head crossing the top edge → `head cut`; an off-screen talker → warning; an over actor looking into the lens is not a test here (F4).
- Until F6, the director-fixture test keeps `--fast`; F6 switches it to measured checks.

### F4  feat(solver): size bands, context, mark views, two-plane over, ride
- Sizes are screen targets, not "fit": the solver aims the primary subject at the centre of its band (F3). `wide` on one subject frames that subject at ~30 % body height with its surroundings.
- `"with": [mark | set-piece id | fx id | actor id]` on a camera key: context that must be in frame but is not the subject. The solver includes it in the framing while keeping the primary subject inside its band; if impossible, compile ERROR `cannot frame <with> at size <size>` with the needed size.
- Vertical group rule: if the key's subjects cannot all reach the band floor inside a 9:16 frame, compile ERROR `group too wide for a vertical frame (<width> m)` with the fix hint "split into keys, use pan, curve the row or reduce spacing". Never shrink silently.
- Mark views: each catalog mark gets `view` (the camera heading that puts the set's characteristic background behind the subject, e.g. village.front faces the hut, not the sea). Derive it from the fixture: the median heading of the fixture's camera keys whose look point is within 4 m of the mark; if none, keep the set's default face. `side` is relative to the subject's mark view. Report the derived table.
- Two-plane `over`: the `over` actor's head is fully inside the lower-left or lower-right third (per `side`), head height 18–30 %, its gaze turned toward the `on` subject (set facing/look/mirror so it never looks into the lens); the `on` subject sits in the opposite upper third at its band. Both heads inside the safe area.
- `"ride": "<set-piece id>"` on an actor: the actor's feet follow a moving set piece (offset by `nudge`), so S5 no longer duplicates the boat path on Satyavati. A camera may `follow` a set-piece id.
- Tests: wide on one subject lands in the wide band; `with` keeps the tree box in frame; a too-wide group fails with the hint; `over` produces a head fully in frame, looking toward the subject; `ride` matches the boat path within 1 cm.

### F5  feat(review): per-key, settled review sheets
- `fableon review` samples per CAMERA KEY: its settle frame and key end - 2 (never a crossfade frame). One row per key, labelled `shot · key n · size/move/on · frame · verdict (OK or first error)`.
- Columns: compiled | `--compare` project (same frames) | `--coverage` ID image. Also write `review.json`.
- `--split`: one image per shot (`<out-dir>/<shotId>.jpg`, at most 1600 px tall) so sheets stay legible when uploaded to chat.

### F6  fix(fixture): director board passes the measured checks
Fix fixtures/adi-parva-authoring/board.json with the new grammar until `fableon frames` (measured) reports 0 errors AND 0 warnings:
- S5: Shantanu and Satyavati readable (e.g. Shantanu medium at the ghat, then follow Satyavati on the boat via `ride`; or a two-plane `over` Shantanu → boat).
- S14: two-plane opening (Pandu in the foreground turned to the deer, the deer readable behind), close on the sage with his whole head in frame, then Kunti with Pandu's shock visible (Pandu's armsUp/shock beat must be on screen).
- L5: stay on the fisher while he talks; Satyavati only as a `reaction` key after his line or as a two-plane shot; the background is the hut.
- S22: `with: ["palace.tree"]`; Bhima and the falling Kaurava kids readable.
- S27: no blocker; Draupadi readable on the dais; the bow-stand insert shows the bow; the floor-to-target tilt as before.
- S38: the fixture's light, and the burning forest in frame via `with` (give the fire fx an id).
- Every shot keeps the fixture shot's `light` and `sets` unless the report gives a reason.
- Full fixture: run measured `frames` (warnings only for v1 keys). Do NOT change its pixels; list the findings in the report.
- Commit the review: `fableon review --project fixtures/adi-parva-authoring --compare fixtures/adi-parva --coverage --split --out docs/reports/phase-2e/` (one image per shot).

### F7  docs: director guide + phase 2E report
- docs/DIRECTOR_GUIDE.md (still under 8 KB): the size-band table, `with`, two-plane `over`, `ride`, `reaction`, the vertical group rule, the speaker rule, and every measured error with its fix.
- docs/reports/phase-2e.md per the template: coverage timing; the calibrated band table with the fixture distribution; the mark-view table; full-fixture measured findings (counts + the 10 worst); a director-board table, one row per key: shot, key, size, primary subject %, visible fraction, eye line %, verdict; what still needed workarounds.

## Acceptance (paste the evidence in the report)
1. npm test green: golden <= 1.0, stills, audio and all earlier tests plus the new coverage/validator/solver/schema tests.
2. Coverage pass timing recorded; normal renders unchanged.
3. Director board: 12 shots, 0 raw escapes, byte-identical recompile, measured `frames` 0 errors 0 warnings, per-shot review images committed (no crossfade frames, one row per key).
4. Per-project schema: the strict-walk test passes (no open object schemas except the declared maps).
5. `git log --oneline` shows the Step 0 docs commit followed by F1–F7 in order.

## Out of scope
AI/LLM calls (Phase 3), server, frontend, changing how the film looks.
