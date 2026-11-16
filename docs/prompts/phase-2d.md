# Phase 2D — Director-ready authoring: visibility-aware solver, composition grammar, blocker checks, strict schema

## Why (architect review of the Phase 2C review sheet)
The authoring layer compiles, but the review sheet shows framing failures that the validator did not catch. These are exactly the mistakes a model director will make on every film, so they must be impossible or caught before Phase 3:
1. S14 frames 1300/1337: the close-up is "on deer" after the deer has exited; the sage now stands at the same spot and the camera sits centimetres from his body — the frame is a giant brown torso. The validator passed because an invisible subject is skipped and a non-subject filling the frame is not checked.
2. S14 frame 1220: the wide key frames deer + pandu + kunti, but Kunti only enters at "13.and"; framing all three makes everyone tiny. The original fixture is an over-the-shoulder composition (Pandu foreground, deer background), which the grammar cannot express.
3. S27: "tiltUp upadi" tilts from Draupadi into the canopy; there is no "tilt from A to B (the target)" and no insert on a prop/mark (the bow stand).
4. The authoring schema still has open objects (fx, set, crowds, motion, animate, params, Anchor objects, Camera additionalProperties true): a cheap model can invent fields that the schema accepts.
5. The eight-shot board uses the fixture's legacy points (FA, DR, KS…) rather than set marks, so it is not yet a good example for a model.
6. Partial boards stretch shots across gaps; previews need to render only the selected shots.

## Ground rules
- The full fixture film (fixtures/adi-parva/storyboard.json) keeps rendering identically: golden frames <= 1.0 MAD. Changes to that fixture in this phase are DATA ONLY in `subjects`/`scenery` fields.
- The compiler and solver stay deterministic (byte-identical output for the same inputs).
- Every new field: schema + docs (docs/AUTHORING.md) + catalog description where relevant.

## Features (one commit each, in this order)

### F1  fix(solver): visibility-aware subjects
- A camera key frames only subjects that are VISIBLE at the key's start (enter/exit/appear/visible windows, crowds and specials included). For a subject that moves during the key (path/ballistic), frame the union of its positions sampled every 6 frames over the key's active span.
- A listed subject that is not visible at the key start is a compile ERROR: "subject <id> is not visible at <anchor> (enters at …/exited at …)". A key may opt out per subject with `"later": ["kunti"]` (framed from its first visible frame inside the key, if any) — use it rarely.
- Effects with an id (pigeon) can be subjects; give each effect kind a measured size in the catalog `measure` (pigeon, emblems, arrow, splash, burst, fire card…).

### F2  feat(solver): composition grammar
Add these to semantic camera keys (documented with exact rules and constants in docs/AUTHORING.md):
- `"over": "<id>"` — over-the-shoulder: the `over` actor's head/shoulder sits large in a lower front corner (left or right per `side`), the `on` subject is framed by `size` in the far third; the camera is behind and beside the `over` actor. (Re-creates the S14 opening: over Pandu, on the deer.)
- `"to": "<id or mark>"` with `move: "tiltUp" | "tiltDown" | "pan" | "reveal"` — the key starts framed on `on` and moves its look (tilt/pan) or the whole camera (reveal = crane out) to frame `to` over `glide` seconds. (Re-creates S27: tilt from the arena floor up the pole to the target.)
- `size: "insert"` on a mark or prop: add marks for the props the fixture films (arena.bowstand, arena.target at the top of the pole, arena.dais, palace.jars, palace.tree, palace.plate, lac.tunnel, lac.house, hermitage.desk, village.hutDoor, naga.floor, city.palace) if missing.
- `"third": "left" | "right"` — place the primary subject on a vertical third instead of the centre (look room).
- Keep everything deterministic; occlusion fallback applies to all of them.

### F3  feat(validator): blockers, invisible subjects, explicit scenery
`fableon frames` (and `validate --deep`) add these checks at every checked frame:
- ERROR "subject <id> not visible": a listed subject is invisible for more than 6 consecutive checked frames of its key (allow `later` subjects until they enter).
- ERROR "foreground blocker <id>": any visible actor/special/effect card that is NOT a subject covers more than 30 % of the frame area, or is closer than 1.2 m to the camera while inside the view.
- ERROR "subject too close <id>": a subject's head is not fully inside the frame, or its projected height exceeds 3x the frame height.
- ERROR "empty key": a key with no subjects must be marked `"scenery": true` (an explicit intent: establishing, transition, effect-only). Add `scenery` to the authoring and v1 schemas.
- Apply to the full fixture as DATA ONLY: give each of the 45 empty-subject keys either the correct subjects (if the shot is about someone) or `"scenery": true`. The full fixture must end with 0 errors; if a true error remains in the hand-tuned film, list it in the report (do not change the picture).
- Tests: the S14 "close on an exited deer" case, a foreground blocker, a too-close subject, an unmarked empty key — each must produce its error.

### F4  feat(schema): strict authoring schema + per-project schema
- Close every open object in schema/authoring.schema.json: typed definitions for every effect kind, set piece, crowd, motion (path/ballistic), animate, special params (one per special), Anchor (string grammar via `pattern`, plus the v1 object form only where needed), Camera (semantic form and an explicit `raw` form, nothing else). `additionalProperties: false` everywhere except where a map is required (cast, points, groups).
- `fableon schema --project <dir> [--out file]`: write a PER-PROJECT specialised schema: enums for cast ids (from the board's cast), poses, expressions, props, specials, effect kinds and variants, set pieces, sets, marks, lights; the anchor pattern restricted to the project's line numbers. This is the schema a model will receive as its structured-output contract in Phase 3. Report its size in bytes for the full fixture.
- `fableon catalog-card [--out file]`: a compact plain-text summary of the catalog (sets with marks and one-line descriptions, poses, expressions, props, specials with params, effects with key params, set pieces, measured sizes) under 12 KB, for model prompts.

### F5  feat(compiler): partial boards and shot previews
- A board may set `"partial": true`; then every shot must have an explicit `"end"` anchor, and the compiled output renders only those shot ranges (no stretching across gaps).
- `fableon stills --shots S14,S27 --frames start,mid,end` and `fableon render --shots …` render only the selected shots' ranges.
- `fableon review --project <dir> [--compare <otherProject>] --shots … --out sheet.jpg`: the labelled side-by-side review sheet tool (what F6 of 2C did by hand), reusable for every future phase and for the UI.

### F6  feat(fixture): director-quality authoring example
Rewrite fixtures/adi-parva-authoring/board.json as a `partial` board that a model could have written: marks instead of legacy points everywhere (add marks to the catalog where a needed spot is missing), groups where natural, and the new grammar. Shots: the eight from 2C (L5, L12, L16, S14, S20, S27, S33, S38) plus four more diverse ones: the opening hook (Ganesha special at the hermitage), L4 (Satyavati's boat with a follow camera), L21 (Bhima shaking the mango tree, kids falling), S26/L25 (the lacquer house fire at night). Requirements: 0 raw escapes, compile + validate --deep + frames with 0 errors, and a review sheet `docs/reports/phase-2d-shots.jpg` (12 rows: compiled vs original fixture at start, a key beat and end) made with `fableon review`. In particular S14 must open over Pandu's shoulder on the deer and the close-up must be on the sage; S27 must tilt from the floor to the target and insert on the bow stand.

### F7  docs: director guide + phase 2D report
- docs/DIRECTOR_GUIDE.md (for models, under 8 KB): what a board is, the anchor grammar, marks/rows/groups, actor sugar, the camera grammar with when to use each size/angle/move/over/to/third/insert/scenery, the validator errors and how to fix each, and two short worked examples taken from the F6 board. This becomes the core of the Phase 3 director prompt.
- docs/reports/phase-2d.md per the template: per-project schema size, catalog card size, the full-fixture frames table (errors/warnings), the 45 keys' resolution (subjects vs scenery), the review sheet, what still needed workarounds.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, stills, audio, validator, authoring, solver, frames + the new tests).
2. Full fixture: `fableon frames` 0 errors; no camera key without subjects unless it has `scenery: true`.
3. Director-quality fixture: 12 shots, 0 raw escapes, compile/validate --deep/frames 0 errors, byte-identical recompile, review sheet committed.
4. `fableon schema --project fixtures/adi-parva-authoring` produces a strict schema with no open objects except maps; `fableon catalog-card` under 12 KB.
5. `git log --oneline` shows the Step 0 docs commit followed by F1-F7 in order.

## Out of scope
AI/LLM calls (Phase 3), server, frontend, changing how the film looks.
