# Phase 2A — Storyboard v1: schema, validator, runtime loading, interpreter (10 shots ported, parity-tested)

## Goal
The engine can build its shots from a project's `storyboard.json` at runtime instead of the compiled-in `engine/src/story.ts`. During the migration a storyboard may mark shots `"legacy": true`, which keeps using story.ts for those shots. In this phase you port 10 shots and prove with an automatic parity test that they render the same pixels as before. Phase 2B ports the other 29 shots and deletes the legacy path; Phase 2C adds automatic framing.

## Ground rules for this phase
- MOVE CODE, DO NOT REWRITE MATH. Every number and formula used by the ported shots (word anchors, pushK, dolly, glide, smooth, pop, talk, lidAt, writeT, the Ganesha gn() card, sparkle twinkle, the crossfade rule, the DOF ramp, kicks) must come from ONE shared implementation that both story.ts and the interpreter import, so they cannot drift.
- NO VISUAL CHANGE: `npm test` (the 9 reference stills) must pass after every commit, and the parity test (F8) must show mean absolute difference <= 0.5 (0-255 grayscale, full 540x960) on every ported-shot frame.
- world.ts and the post chain do not change. The interpreter outputs the same ShotDef objects and the same exports (SHOTS, TOTAL, FLASH_AT, XFADE, layersAt, dofAt, kickCam, KICKS) that main.ts imports from story.ts today.

## The 10 shots to port (by their definition in story.ts)
L1 (dictation + condition), L2 (his counter), L5 (father's demand), L6 (the perfect heir, sparkles), L7 (gives up the throne / what about your kids), L8 (the vow), L10 (the gift, golden, sun override az -30 el 9), L12 (a generation later, glide between the princes), L14 (Kunti's chant, halo), L16 (five brothers pop in).
They use: dolly cameras with push/punch/roll, cuts and glides, DOF entries, who() actors with poses/expressions/props/facing/look/seated/headTilt and beats at word anchors, talk() mouths (. rate 1.6), the Ganesha special (write, writeSpeed, puzzled, down, look, pen), `appear` scale pops with per-actor stagger and base scale, `visible` ranges, sparkle (with twinkle), halo and knot effects, and the `pages` set piece.

## Features (one commit each, in this order)

### F1  refactor(engine): runtime catalog lists
Add runtime arrays and derive the TypeScript types from them (no behaviour change): POSES (people.ts Pose), EXPRS (toon.ts Expr), PROPS (people.ts PropK), SPECIALS (ganesha, agni, deer, naga, baby, pot, flat), LIGHTS_NAMES, and export the place names from places.ts as PLACES.

### F2  feat(schema): storyboard JSON Schema v1 and catalog export
- schema/storyboard.schema.json (JSON Schema 2020-12, additionalProperties: false everywhere) implementing exactly docs/STORYBOARD_SCHEMA.md, with only what Phase 2A implements: Anchor, Point, Animated number, top level, Shot, CamKey (dolly | fixed | tilt), Actor (person + `special` with an open `params` object), Effect (sparkle | halo | knot; sparkle adds twinkle: { "freq": 9, "depth": 0.2 }), SetAction (pages).
- engine/scripts/export-catalog.mjs -> schema/catalog.json: places, set groups, cast spec keys (C, KIDS, plus the kaurava generator), poses, expressions, props, specials, effect kinds, set pieces, lights. A one-line description per entry is welcome but optional in 2A.

### F3  feat(cli): fableon validate
`fableon validate --project <dir>`: ajv schema validation (new dependency ajv; say why in the commit body), catalog names, word anchors exist in words.json, shot starts strictly increase, camera keys and beats in time order. Errors print the JSON path and a one-line reason. Exit code 1 on any error.

### F4  feat(engine): load the project at runtime
- render.cjs gets `--project <dir>` and serves that folder under /project/; the CLI passes it on every engine call.
- main.ts initialises asynchronously: fetch /project/words.json and /project/storyboard.json (if present) BEFORE building anything; window.ready = true only after that. Without a storyboard everything behaves exactly as today.

### F5  refactor(engine): shared timing, camera and Ganesha helpers
Move (do not change) from story.ts into shared modules, e.g. engine/src/core/timing.ts (clamp01, smooth, glide, ease, pop, talk, writeT), engine/src/core/camera.ts (run, pushK, dolly, kickAt, kickCam, Key/Shot types), engine/src/core/anchors.ts (word lookup A/K/END working on a words array passed in), engine/src/core/specials.ts (gn() and future specials). story.ts imports them. Regression stills must be identical.

### F6  feat(engine): storyboard interpreter with legacy hybrid
engine/src/storyboard/ builds ShotDef[] from storyboard + runtime words, plus the same exports as story.ts:
- anchors, points (named points, places, and a registry of moving targets for later), animated numbers;
- camera keys -> (f) => Cam with the shared run/dolly/pushK (dolly, fixed, tilt);
- DOF entries (shots without `dof` get { at: start, cInf: 0 }, as story.ts does); kicks, flash, crossfade;
- actors -> who() / card() calls with beats, talk, appear, visible, specials (ganesha now; others in 2B);
- effects sparkle, halo, knot; set piece pages;
- the per-shot wrapper story.ts applies today (hide jars, hide city, hide laddu plate, pages height 0.3) for every shot;
- hybrid: a `legacy: true` shot uses the story.ts ShotDef whose start frame equals the storyboard shot's start frame (error if none) and the story.ts DOF entries inside that shot's range (export story.ts's sorted DOF list for this).
main.ts uses the storyboard build when a storyboard was loaded, else story.ts.

### F7  feat(fixture): Adi Parva storyboard, 10 shots ported
fixtures/adi-parva/storyboard.json with all 39 shots in order (correct start, light, sets, and sun where story.ts overrides it); the 10 shots above fully described (legacy: false), the other 29 legacy: true; top-level flash, crossfade: 10, tailFrames: 36, all 21 kicks, and the cast with the same identity seeds story.ts passes to who(). `fableon init` copies storyboard.json too. `fableon validate` must pass on it.

### F8  test: storyboard parity and validator tests
- Parity: for every non-legacy shot render, in legacy mode (no storyboard) and storyboard mode at 540x960, the frames a, a+1, the middle, b-1, and every camera-key / beat / effect anchor frame inside the shot (and the frame after each), up to 12 per shot. Compare at full 540x960 grayscale; fail if any MAD > 0.5. Print a table per shot.
- Validator: the fixture passes; three broken copies (unknown pose, a word that is not in the line, decreasing shot starts) each fail with the expected message.
- Add both to `npm test`.

### F9  feat(cli): storyboard-aware pipeline and a final-quality run
- shots, stills, render and all run validate first and stop on errors.
- A project may render if its storyboard has no legacy shots, or its words.json equals the fixture's (legacy shots depend on the compiled-in timeline). Otherwise stop with a clear message.
- Run the whole fixture once at final quality: `fableon all --project work/adi --quality final --workers 2` (use --workers 1 if memory gets tight on 8 GB). Record time, peak memory if you can, and output size in docs/BENCHMARKS.md.

### F10  docs(report): phase 2A report
docs/reports/phase-2a.md per docs/REPORT_TEMPLATE.md, including the parity table, the validator test results, the final-quality run numbers, and the list of everything in the 10 ported shots that the schema could NOT express cleanly (this list drives Phase 2B).

## Acceptance (paste the evidence in the report)
1. npm test passes: reference stills, audio, parity (every ported-shot frame MAD <= 0.5), validator tests.
2. `fableon validate --project work/adi` passes; `fableon all --project work/adi --quality preview` still yields the same QA summary as Phase 1.
3. The final-quality film exists: 1440x2560, 3639 frames, 121.3 s.
4. `git log --oneline` shows the docs commit from Step 0 followed by the 10 feature commits above, in order.

## Out of scope
Porting the other 29 shots, new effect kinds or set pieces beyond those listed, removing the QA pop allowlist (2B), framing solver / semantic cameras (2C), any AI/LLM calls, server, frontend, any visual change.
