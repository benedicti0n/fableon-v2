# Phase 2F — Screen direction, editing rules, measurement fixes (last step before the AI pipeline)

## Why (architect review of docs/reports/phase-2e/*.jpg and frames.json)
1. S14 key 0 (f1225/1245): Pandu (the `over` actor) stares into the lens and aims his bow to screen-right, AWAY from the deer; the deer sits directly on his crown (silhouettes merge, it reads as a hat). The board's `facing:"left"`/`mirror:true` were copied from the fixture's camera; under the new camera they point the wrong way. Screen direction must be derived from a target, not authored as left/right.
2. S14 key 1 (f1253/1321): the sage's topknot bun is cut by the top frame edge in both frames, yet `head cut` passed: the head box excludes headwear (bun, crown, turban, hair). The close target (42.5 % head) is also far tighter than the reference film (26%).
3. S14 key 2: Pandu's shock beat at "13.and" (armsUp + shock) happens off-screen; the fixture shows it.
4. L5: key 0 lasts 3 frames (0.1 s), then cuts to an almost identical medium of the same fisher: a flash plus a jump cut.
5. L16: the leftmost brother's head touches the left frame edge (safe area not measured); the first key starts at "16.Five+1s" (a workaround for subjects that pop in at the shot start); the compiled frame (orange wall, hard shadow stripes) does not look like the fixture frame (cream floor, shaded wall).
6. S27: key 0 "wide on draupadi" is Draupadi against a blank wall (> 50 % of the frame is one wall; the arena is never established); key 2's bow "insert" (fov 75 workaround) reads as a brown beam and half a king is cut by the right edge; key 3's review shows only the tilt's end (f2672/2672) — the move's start is never checked or shown.
7. frames.json: headBox has x0 > x1 for 5 of 8 subjects (unsorted; left/right head-cut checks can miss real cuts). S38's first key also starts after the shot start.
8. Small: L12 key 1 has `move:"glide"` with `cut:true` (contradiction); `fableon frames --help` still describes the analytic check; frames.json is written both to the project root and to qa/; the fixture's v1 `subjects` labels produce 47 `subject hidden` warnings (e.g. S5 shantanu 0 % visible) that are labelling mistakes from the 2D data pass, and they pollute the calibration.

## Ground rules
- The full fixture film renders identically (golden <= 1.0, stills unchanged). Fixture edits are DATA ONLY (`subjects`, `scenery`).
- Deterministic compile/solve/validate. All thresholds in cli/src/composition.js with a comment each.
- Every new field: schema + docs/AUTHORING.md + docs/DIRECTOR_GUIDE.md. All thresholds in cli/src/composition.js with a comment each.

## Features (one commit each, in this order)

### F1  fix(validator): measurement fixes and move sampling
- headBox is normalised (x0 < x1, y0 < y1). Head cut uses the actor's real silhouette: the head region's top = the topmost ID pixel of that actor above its eye point (so buns, crowns, turbans and hair count).
- Measured safe area: every subject's head region and the `over` actor's head stay inside the side margins (4 %) and below the top margin (2 %) → ERROR `edge <id>`. Bodies may cross the bottom edge.
- WARNING `edge intruder <id>`: a NON-subject actor/special cut by the left/right/top frame edge, covering >= 1 % of the frame with < 50 % of its solo silhouette visible.
- Moving keys (tiltUp/tiltDown/pan/reveal/glide/follow/crane): check and review the first settled frame of the move AND its end, plus the middle; static keys keep settle/mid/end-2. `fableon review` uses the same sampling (one row per key).
- One frames.json location: `<project>/frames.json` (qa/ no longer gets a copy, or document why). Update `fableon frames --help`.
- Tests: the S14 sage close (bun cut) → `edge`/`head cut`; the L16 left brother → `edge`; a half-visible non-subject at the right edge → warning; unsorted box regression.

### F2  feat(compiler): screen direction with `face`
- Actor field `"face": "<actor id | mark | fx id>"` (also allowed inside a `do` beat). The compiler resolves it PER CAMERA KEY into the existing `facing`/`look`/`mirror` values so that, under the active camera, the actor's body/eyes turn toward the target's screen side, and aim props (bowDrawn, bow, spear, net, axe, torch) point toward it. A cut to the other side flips it automatically. No new art.
- `over` uses this automatically: the over actor faces the `on` subject (never the lens), unless the board sets `face` explicitly.
- Two-plane placement as specified in 2E: the `over` actor in the lower third on one side, the `on` subject in the upper part of the OPPOSITE side; their boxes must not overlap.
- Validator: ERROR `looks away <id>` when an actor with `face` (or an `over` actor) faces/aims away from its target on screen; ERROR `merge <a>/<b>` when the `over` actor's box overlaps the `on` subject's box by more than 10 % of the smaller box.
- Tests: S14-like setup from both sides of the line (facing flips, bow points at the deer); over actor never frontal; merge case fails.

### F3  feat(validator): editing rules
- ERROR `jump cut`: a cut between consecutive keys (also across a shot boundary in the same set) whose primary subject is the same, with a size change of less than one step AND a side/angle change of less than 30°. Hint: merge the keys, change size by a step, or move the camera >= 30°.
- ERROR `key too short`: a key shorter than 18 frames (0.6 s) — merge it into a neighbour. (Shots may be short; keys inside them may not.)
- ERROR `first key late`: the first camera key must be at the shot start. A subject that enters/appears within the first 0.5 s of a key counts as present (framed at full size, `later` not needed), so L16/S38-style workarounds are no longer necessary.
- ERROR `glide with cut`: `move:"glide"` (or a `glide` value) together with `cut:true`.
- WARNING `action off-screen <id>`: a `do` beat that changes pose/expr/prop, or an `enter`/`exit`/`appear`, happens while the actor covers < 4 % of the frame. A beat may set `"offscreen": true` to mark it deliberate.
- WARNING `flat wide`: in a `wide`/`establishing` key a single background id (one wall, ground, water or sky) fills > 55 % of the frame. Hint: add `with` context, change side/angle, or use a different size.
- Tests for each rule.

### F4  fix(solver): house-style targets, fill-based inserts, mark boxes
- Solver targets = the reference film's per-class medians from the 2E calibration data (after F5's label fix, recompute and report them); keep the bands. The S14 sage close must keep the bun inside the frame.
- `insert` is measured by FILL = max(box width / frame width, box height / frame height), band 55–90 %; the solver fits the target box in both directions. A long flat prop (the 5.2 m bow) then fills the frame width without an fov override.
- Mark boxes: a catalog mark may carry `box` (world-space AABB of the object it names, derived from the world meshes/volumes: e.g. palace.tree = trunk + canopy, arena.bow, arena.pole, city.forest, lac.house). `with` and `insert` frame the box, and `context missing` measures the object's own ID pixels. Remove the palace.tree canopy alias hack.

### F5  fix(fixture): reference labels and the director board
- Full fixture (data only): correct the v1 `subjects` labels so `subject hidden` remains only where the picture really hides the subject; list the corrected keys in the report; recompute the calibration (F4).
- Director board, using the new rules and no workarounds:
  - S14: Pandu `face:"deer"`, bow aimed at the deer, deer readable in the opposite upper area, no merge; the close on the sage with the whole bun inside; Pandu's shock at "13.and" ON SCREEN (e.g. a two-shot Pandu + Kunti, or a key on Pandu).
  - L5: no jump cut (one key on the fisher, or a real size/angle change such as a close at "father's").
  - L16: first key at the shot start; every brother's head inside the safe area (curve the row, reduce spacing or two rows).
  - S27: key 0 establishes the arena (Draupadi with `with` context such as the pole or the kings), no flat wall; the bow insert reads as a bow by fill, without fov; no half actor at an edge.
  - S38: first key at the shot start.
  - Light/sun: add a test that each director shot's light and sun equal the fixture shot that starts at the same anchor; any intended difference is listed in the report. Find out why L16 looks so different from the fixture and fix it.
  - Measured `frames`: 0 errors, 0 warnings. Regenerate docs/reports/phase-2f/ with `fableon review --compare fixtures/adi-parva --coverage --split`.

### F6  docs: director guide + phase 2F report
- docs/DIRECTOR_GUIDE.md: `face`, the editing rules (jump cut, key length, first key, action off-screen), `flat wide`, `edge`, insert by fill, mark boxes. Under 8 KB.
- docs/reports/phase-2f.md per the template: the recomputed targets; corrected fixture labels and the new warning counts; the director-board per-key table (add columns: facing target, edge margin, fill for inserts); a list of the visual checks below with the frame numbers that show each one.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0) plus the new tests.
2. Director board: 0 raw escapes, byte-identical recompile, measured frames 0 errors 0 warnings, no fov overrides unless justified in the report.
3. Visual checks, each with the review image and frame number: S14 Pandu aims at the deer and does not look into the lens; no deer-on-crown merge; sage bun inside the frame; Pandu's shock visible; L5 has no near-identical consecutive frames; L16 heads inside the margins and the light matches the fixture; S27 opening shows arena context, the bow insert reads as a bow, no half actor at an edge, and the tilt row shows both start and end.
4. `git log --oneline` shows the Step 0 docs commit followed by F1–F6 in order (or a documented dependency swap).

## Out of scope
AI/LLM calls (Phase 3), server, frontend, changing how the film looks.
