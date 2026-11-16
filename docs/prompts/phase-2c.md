# Phase 2C — Authoring format, framing solver, in-frame validator, attachments, interpreter performance

## Why
The render storyboard (v1) can express the whole film, but it is 664 KB / 31k lines of explicit numbers for 121 s. No model can author that reliably, and hand-tuned cameras are where most review defects came from (subjects out of frame, props in front of faces, eyes too low). This phase adds the layer models and the future UI will write:
- an AUTHORING format (`board.json`): compact, semantic, model-friendly;
- a COMPILER (`fableon compile`) that expands it into the v1 render storyboard (`storyboard.json`), which stays the engine's only contract;
- a FRAMING SOLVER that turns semantic camera keys into v1 camera numbers;
- an IN-FRAME VALIDATOR that proves every named subject is visible, unobstructed and well placed — for ANY v1 storyboard, hand-written or compiled;
- ATTACHMENT points (head, hands…) so effects stop needing hand-tuned screen offsets;
- interpreter PERFORMANCE fixes (final render went 627 -> 854 s in 2B).

## Ground rules
- The fixture film (fixtures/adi-parva/storyboard.json) must keep rendering identically: golden frames stay <= 1.0 MAD (most at 0.000). Data refactors of the fixture must keep every golden frame within 0.1 of its current value.
- The render format v1 only gains ADDITIVE, optional fields in this phase (`subjects` on camera keys, actor-attached Points). Nothing existing changes meaning.
- Deterministic everywhere: the compiler and solver are pure functions of (board.json, words.json, catalog.json). Same input -> byte-identical storyboard.json.
- Every new field is in a JSON Schema (`schema/authoring.schema.json` for the authoring format, `schema/storyboard.schema.json` for v1 additions), described in docs (docs/AUTHORING.md new, docs/STORYBOARD_SCHEMA.md updated), and every catalog addition has a one-line description.
- Exact field names are yours unless given here; keep them short, consistent and model-friendly.

## Features (one commit each, in this order)

### F1  feat(catalog): set marks, keep-out volumes, subject measurements
- Marks: every set gets named marks in schema/catalog.json: { name, pos (world Point), facing (yaw in degrees the subject faces by default), description }. Derive them from the places/points the fixture already uses (e.g. village front, Kunti's hut door, palace courtyard centre, ghat top, the jar grid origin, the mango tree, hermitage mat and desk, deer clearing centre, lacquer house door and tunnel, arena dais, bow stand and pole, city clearing, naga floor). Each set also gets `front` (the default viewing direction, degrees) and `bounds` (an establishing box).
- Keep-out volumes: instrument the builders in engine/src/sets.ts so that every solid scenery object registers a simple volume as it is built (axis-aligned box or vertical cylinder: huts, house walls, pillars, arcades, tree trunks + canopy spheres, boats, rocks, pole, bow stand, palace blocks). Export them per set into schema/catalog.json (or schema/keepout.json if large) through the browser page (a new render.cjs mode, e.g. `catalog`), because the sets need the DOM to build. No visual change.
- Subject measurements: for every cast build (adult, slim, stout, big, elder, kid, baby) and every special, measure in metres at scale 1: standing height (sole to crown, crown included), seated height, eye height (standing and seated), head height, visible half-width. Measure by running the real drawing code with a no-op/recording Pen (no canvas pixels needed) — never by guessing. Export into the catalog under `measure`.

### F2  feat(engine): actor attachment points
- New v1 Point form: { "actor": "<id>", "attach": "head" | "eyes" | "crown" | "chest" | "feet" | "handL" | "handR" | "prop", "d": [dx, dy, dz] }, resolved per frame from the actor's CURRENT state (pose, beats, motion, scale, mirror, camera-facing yaw, special) by running the same drawing code with the recording Pen to get design-space points (person() already returns L, R, hc, chin, crown, u, HH), then mapping design units to world through the card transform (SU = 0.00216 m/unit, base at y 975, mirror, scale, yaw). Specials report sensible attach points (flat: head at the drawn head, ganesha: hands/leaf, deer: head).
- Actors referenced by attachments need an `id` (reuse the moving-target id).
- Re-express the two hand-tuned offsets of the fixture with attachments: the stars at the flat king's head (S28) and the sparkle on Arjuna's bowstring (S29, use the attachment of the hand holding the bow plus a small d). Report the golden MAD of those two shots (target <= 2.0); if larger, include both images in the report instead of forcing it, and keep the old numbers in the fixture.
- "screen" offsets stay supported (and are documented as horizontal-right, as implemented).

### F3  feat(compiler): authoring format and `fableon compile` (no camera solver yet)
New schema/authoring.schema.json, docs/AUTHORING.md, and `fableon compile --project <dir>` reading `board.json` (+ words.json + catalog) and writing `storyboard.json`, then running `fableon validate` on it. Authoring features:
- String anchors: "13.deer" (word), "13.deer#1" (nth occurrence), "13.deer-2f" / "13.deer+0.4s" (offset in frames or seconds), "shot+1.2s", "shot-10f", "end+4f", "f90" (absolute frame, discouraged). Cuts default to 2 frames before the word, as today ("cut at 13.deer" = 13.deer-2f).
- Units: seconds for durations/rates/delays, degrees for angles. The compiler converts to frames/radians.
- Placement by marks: "at": "village.front" with optional "nudge": [dx, dy, dz]; formations for several actors around a mark: { "row": [ids], "at": mark, "spacing": 0.8, "curve": 0.15, "facing": "camera" | degrees } -> expands to the same positions the fixture's ROW-style placements use.
- Cast: ids with spec ("C.kunti", "KIDS.bhima", inline spec), optional `variant` (e.g. "priest" = the PRIEST disguise transform in the fixture), groups (e.g. "brothers": [yudhi, bhima, arjuna, nakula, sahadeva] usable wherever a list of actors is allowed), and automatic deterministic seeds (stable hash of the id) unless a seed is given.
- Actor sugar: "says": ["13.deer", "13.die"] (talk cycle between the two anchors, then back to the previous expression), "do": [["14.chant", { "pose": "pray", "expr": "smile_closed" }], …] (beats), "enter"/"exit" (visibility), "appear": "16.Five" (+ stagger in seconds).
- Effects: same kinds as v1, positioned by mark, Point or attachment ({ "on": "kingFlat", "attach": "head" }), units in seconds.
- Set pieces and crowds: passed through with string anchors and seconds converted.
- Escape hatch: "raw": { …v1 fields… } on a shot/actor/effect for anything not yet semantic (validated as v1 after compile). Report how often the re-expressed fixture shots needed it.
- Camera keys in this commit accept only explicit v1 form (pos/look/fov) via raw; F4 adds semantic cameras.

### F4  feat(compiler): framing solver
Semantic camera keys in board.json:
{ "at": "5.her", "cut": true, "size": "close" | "medium" | "full" | "wide" | "establishing" | "insert", "on": [ids or a mark], "angle": "eye" | "low" | "high" | "overhead", "side": "front" | "left" | "right" | "frontLeft" | "frontRight" (relative to the set's front / the primary subject's facing), "move": "push" | "hold" | "glide" | "tiltUp" | "tiltDown" | "follow" | "crane", "punch": "5.king", "roll": 4, "fov": optional override, "glide": 0.8 (seconds, for glide/crane) }
The solver (deterministic, documented in docs/AUTHORING.md with the exact rules) computes pos, look, fov, roll, push/punch and the v1 key type, and fills `subjects` on the v1 key (F5). Rules (tune the constants by rendering, but keep these intents):
- Use the F1 measurements for subject sizes (kids are smaller, seated subjects lower, specials by their own measure). The 9:16 frame: horizontal fov from the vertical fov; both directions must fit.
- Vertical coverage: close = head and shoulders (about 2.4 head heights), medium = waist up, full = whole body with feet above the bottom safe line, wide = all subjects with ~30 % margin, establishing = the set's bounds, insert = the named mark/prop tight.
- Eye line: for close and medium, the primary subject's eyes sit 38-42 % from the top of the frame.
- Default fov by size: close 36-38, medium 38-40, full 40-42, wide 44-46, establishing 46-50 (match the fixture's ranges).
- Angle: eye = camera at the subject's eye height; low = camera near waist height looking up; high = 2.5-4 m above looking down; overhead = 8 m+.
- Push: default rates close 0.003, medium 0.0025, full 0.0022, wide 0.002, establishing 0.0018; "punch" -> 0.006 over 30 frames at that anchor; "hold" still creeps (rate 0.0015) — no static holds.
- DOF default by size: close 13, medium 11, full 8, wide/establishing 0; focus on the primary subject's eyes.
- Occlusion: cast rays from the camera to each subject's head and chest; if any keep-out volume blocks them, rotate around the subject +15, -15, +30, -30 degrees, then raise 1 m, then come 15 % closer (widening fov to keep the size); if still blocked, compile fails with "no clear view of <id> at <anchor>".
- Camera inside a keep-out volume is always rejected the same way.
- follow: pos/look relative to a moving target id (boat, pigeon…), as the fixture does.

### F5  feat(validator): in-frame and occlusion check for any v1 storyboard
- v1 CamKey gains optional `subjects: [actor ids]` (the compiler fills it from "on").
- `fableon frames --project <dir>` (and part of `fableon validate --deep`): for every camera key's first frame and every 6th frame while it is active, project each subject's measured bounding box (from F1, placed by its current pose/scale/seated state) into the frame. Safe area: 4 % left/right, 6 % top, 15 % bottom (Shorts UI). ERROR if more than 10 % of a subject's box is outside the safe area or its head is outside the frame; ERROR if the line of sight to its head is blocked by a keep-out volume; WARNING if a close/medium primary subject's eyes are outside the 30-50 % band. Output a table and `<project>/qa/frames.json`.
- Add `subjects` to every camera key of fixtures/adi-parva/storyboard.json (data only; golden unchanged) for the characters each shot is about. The fixture must pass with 0 errors; list warnings in the report. If the validator reports a true problem in the fixture, report it (do not "fix" the picture in this phase).

### F6  feat(fixture): authoring re-expression of eight shots
New fixture `fixtures/adi-parva-authoring/` (words.json, voice, pronunciations copied; board.json written by you) with these shots written ONLY in the authoring format with semantic cameras (raw allowed but counted): L5 (father's demand), L12 (glide between the princes), L16 (five brothers pop in), L13 (deer, arrow, sage, curse), L19 (jars + kids; set-piece passthrough), S27/L26 (contest: brothers walk past Draupadi, bow stand, tilt up the pole), L32 (the pigeon, follow camera), L35 (Agni in the burning forest). The other shots may be omitted (the film can be shorter for this fixture: compile only these eight in order, with their real anchors; gaps are fine as long as starts increase).
Acceptance for this fixture: compiles, validates, `fableon frames` 0 errors, renders. Produce a review sheet `docs/reports/phase-2c-shots.jpg`: for each of the eight shots, the compiled render at 3 frames (start, middle, a key beat) next to the golden/fixture frame of the same moment, labelled. Report authoring size vs v1 size for these shots (bytes) and the number of "raw" escapes used.

### F7  perf(engine): interpreter performance and fixture compaction
- Profile `world.update` + stage per frame (median and max per shot) at final size before and after. Fix obvious hot spots without changing output, e.g.: resolve anchors/points/path keys once per shot (or per frame) instead of per call; stop recreating motion closures inside actor() (`motionFn(...)` is built again per call for walk phase); cache jar grid positions per shot; avoid sorting beats every frame.
- Compact the fixture where the math allows: replace per-frame path keys (S25 and S26 are 40-53 KB because their walk paths store one key per frame) with the minimal key set reproducing the same positions (the legacy formulas are linear with clamps). Golden frames must stay within 0.1 of their current value. Report storyboard.json size before/after.
- Re-run the final-quality fixture film; record s/frame and total time in BENCHMARKS.md (target: back to about 2A speed or better).

### F8  docs(report): phase 2C report
docs/reports/phase-2c.md per the template, including: the solver rules as implemented (constants), the frames-validator results on the full fixture (errors/warnings table), the eight-shot review sheet, authoring vs v1 sizes, raw-escape count and why each was needed, F2 attachment MAD results, the before/after performance table, the storyboard size change, and a short "what a model must know to write board.json" section (it becomes the core of the Phase 3 director prompt).

## Acceptance (paste the evidence in the report)
1. npm test green after every commit (golden <= 1.0, reference stills, audio, validator, motion math) plus new tests: anchor-string parser, formation expansion, solver unit tests (eye-line band, both fov directions, occlusion fallback order), frames validator on a deliberately broken copy (a subject moved out of frame -> error; a pillar between camera and subject -> error).
2. `fableon frames --project work/adi` (full fixture with subjects): 0 errors.
3. The eight-shot authoring fixture compiles, validates, passes `fableon frames` with 0 errors, renders; review sheet committed.
4. Compiling the same board.json twice gives byte-identical storyboard.json.
5. Final-quality fixture run: QA PASS, 0 unexplained pops; time recorded.
6. `git log --oneline` shows the Step 0 docs commit followed by F1-F8 in order.

## Out of scope
AI/LLM calls (Phase 3), server, frontend, new sets or characters, changes to how the film looks.
