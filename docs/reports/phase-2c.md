# Phase 2C report

## Summary

The renderer now has an authoring layer: a compact `board.json` compiles deterministically into the v1 storyboard,
semantic camera keys go through a measured framing solver, and `fableon frames` proves named subjects are inside the
Shorts safe area with a clear line of sight. The fixture keeps every golden frame (max 0.107) while shrinking from
680,366 to 260,942 bytes; the final-quality film is back to **619.4 s** (0.170 s/frame) and QA PASS. An eight-shot
authoring fixture compiles with **0 raw escapes** and passes the in-frame check with **0 errors / 0 warnings**; the full
fixture passes with **0 errors / 42 warnings** (true eye-line findings, left untouched as instructed).

## Commits

| # | Hash | Message | What / why (one line) |
|---|---|---|---|
| 0 | `668e14f` | `docs: phase 2C prompt` | Saved the phase instructions before coding. |
| F1 | `5f07d00` | `feat(catalog): set marks, keep-out volumes, subject measurements` | 36 marks, 8 set fronts/bounds, keep-out volumes, measured builds/specials. |
| F2 | `1909b6b` | `feat(engine): actor attachment points` | Head/eyes/crown/chest/feet/hands/prop from an actor id's current drawing. |
| F3 | `7336bcb` | `feat(compiler): authoring format and fableon compile` | `board.json` schema/docs, string anchors, marks, rows, sugar, deterministic compiler. |
| F4 | `08cb04c` | `feat(compiler): framing solver` | Semantic camera keys -> measured pos/look/fov/push/tilt/DOF with occlusion fallback. |
| F5 | `bd332f6` | `feat(validator): in-frame and occlusion check for any v1 storyboard` | `fableon frames`, `validate --deep`, fixture subjects, safe-area/occlusion tests. |
| F6 | `d22674b` | `feat(fixture): authoring re-expression of eight shots` | Eight-shot authoring fixture, semantic cameras, review sheet, 0 raw escapes. |
| F7 | `8f9e670` | `perf(engine): interpreter performance and fixture compaction` | Per-shot caches, 1,691 path keys removed, final run 619.4 s. |
| F8 | this commit | `docs(report): phase 2C report` | This report. |

## Acceptance checks

### 1. `npm test` after every commit

Final run (`npm test`, after F7):

```text
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS catalog metadata  8 sets, 36 marks, 610 volumes, 13 measures
PASS authoring  15/15 checks
PASS framing solver  8/8 checks
PASS frames validator  3/3 checks
PASS validator (5/5)
PASS shot starts: 39 resolved
PASS motion math (9/9)
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

New tests cover the anchor-string parser (`13.deer`, nth/offset/seconds, shot/end/frame), formation expansion
(exact 5-row x/z positions), solver eye-line band (close/medium 0.400), both fov directions (horizontal dominates a
4 m wide subject), occlusion fallback order, and `fableon frames` on a copy with a moved subject and with a test pillar
between camera and subject (both produce errors).

### 2. Full fixture in-frame check

```text
$ npx fableon frames --project work/adi
frames: 639 checks, 0 error(s), 42 warning(s) — …/work/adi/qa/frames.json

$ npx fableon validate --deep --project fixtures/adi-parva
validate: OK (39 shots, 71 cast ids) — …/fixtures/adi-parva/storyboard.json
validate --deep: in-frame 639 checks, 0 error(s), 42 warning(s)
```

Warnings (all true eye-line findings; the picture was not changed):

| shot | checks | frames | subject | eye line |
|---|---:|---|---|---|
| S5 | 4 | 486-504 | shantanu | 28.8 % (just above the 30 % band) |
| L10 | 9 | 932-980 | shantanu | 51.9 % |
| L12 | 14 | 1105-1183 | dhritarashtra | 59.1 % |
| S14 | 1 | 1247 | deer | 61.3 % |
| L14 | 9 | 1337-1385 | kunti | 54.7 % |
| S19 | 5 | 1725-1749 | vyasa | 51.8 % |

83 camera keys carry `subjects`; 45 are empty scenery/transition keys where no actor remains inside the safe area for
the whole active interval. Naming a subject there would create false errors; this is listed under open questions.

### 3. Eight-shot authoring fixture

```text
$ npx fableon compile --project fixtures/adi-parva-authoring
validate: OK (8 shots, 29 cast ids) — …/fixtures/adi-parva-authoring/storyboard.json
compile: …/storyboard.json (8 shots, 0 raw escape(s))

$ npx fableon frames --project fixtures/adi-parva-authoring
frames: 554 checks, 0 error(s), 0 warning(s)

$ sha256sum fixtures/adi-parva-authoring/storyboard.json …; npx fableon compile …; sha256sum -c
… OK (byte-identical)
```

The compiled and original renders were produced at 270x480 for each shot's start, middle and a key beat; the labelled
sheet is `docs/reports/phase-2c-shots.jpg` (8 rows × 3 frame pairs, compiled left of each pair, fixture right).

Authoring vs v1 size for these eight shots (compact JSON):

| artifact | bytes |
|---|---:|
| `board.json`, selected shot payloads | 9,897 |
| original fixture v1, same shot payloads | 14,969 |
| compiled v1, same shot payloads | 14,660 |
| whole `board.json` | 33,021 |
| whole compiled `storyboard.json` | 47,408 |

Raw escapes: **0**. Every shot, actor, effect and camera used the authoring layer; no `raw` object was needed. The
fixture's full `fableon all` run renders the film but QA reports pops because omitted shots stretch the eight retained
shots across their multi-second gaps; that run is not the acceptance film.

### 4. Deterministic compile

Compiling the same board twice produced byte-identical `storyboard.json` (SHA-256 check above). The compiler never uses
time, random values or object identity; seeds are a stable FNV hash of the cast id unless given.

### 5. Final-quality fixture run

```text
$ npx fableon all --project work/adi-final --quality final --workers 2
SPECS 1440x2560 30/1 fps, 3639 frames, 121.300 s; audio: aac 48000 Hz 2ch
planned events ignored (±1 frame): 214 frames from events.json
unexplained pops: none
Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
real 619.39
```

### 6. Commit order

`git log --oneline` shows `668e14f docs: phase 2C prompt` followed by F1-F8 in order (see the table above).

## Solver rules as implemented

`cli/src/solver.js`; constants are the defaults, `fov`/`roll`/`punch`/`glide` in the board override them.

| size | fov | coverage | push rate | DOF |
|---|---:|---|---:|---:|
| close | 37 | 2.4 head heights, eye line 40 % | 0.003 | 13 |
| medium | 39 | 0.62 standing heights, eye line 40 % | 0.0025 | 11 |
| full | 41 | 1.12 standing heights | 0.0022 | 8 |
| wide | 45 | subject box + 30 % | 0.002 | 0 |
| establishing | 48 | set bounds + 10 % safe margin | 0.0018 | 0 |
| insert | 35 | 0.8 m around the mark | 0.0025 | 11 |

- Frame aspect 9:16; `fovH = 2·atan(tan(vfov/2)·9/16)`. Distance is the larger of the vertical and horizontal fit.
  Close/medium/full add a 20 % safe-area margin so the box does not sit against the Shorts UI bands.
- Eye line: the look point is `0.10·span` below the eyes for close/medium, putting the eyes at 40 % from the top.
- Angles: eye = measured eye height; low = 45 % of body height; high = 2.5-4 m; overhead = 8 m.
- `hold` uses rate 0.0015; `push` uses the size rate; `punch` adds 0.006 over 30 frames; `glide`/`crane` compile to a
  0.8 s key transition; `tiltUp`/`tiltDown` become v1 tilt keys.
- `follow` requires a moving id and writes camera `pos`/`look` relative to it.
- Occlusion samples the camera-to-head and camera-to-chest rays against set keep-out volumes. If blocked, yaw
  `+15`, `-15`, `+30`, `-30`; then raise 1 m; then move 15 % closer and widen fov to keep coverage. Camera inside a
  volume is rejected. Final failure: `no clear view of <id> at <anchor>`.
- DOF default entries are appended only when the shot has no explicit DOF; focus is the primary subject's eyes via an
  actor attachment when the actor has a moving id, otherwise an absolute eye point.

## F2 attachment results

The two hand-tuned fixture offsets were re-expressed with attachments:

| shot | expression | golden MAD |
|---|---|---:|
| S28 | stars at `kingFlat` `head` + `[-0.085, 0.48, -0.015]` | **0.056** |
| S29 | sparkle at `arjuna` `handL` + `[0.03, 0.26, -0.15]` | **0.107** |

Both are below the 2.0 target and below the 1.0 golden gate. `screen` offsets remain supported as horizontal-right.

## Performance

Profile: start / middle / end-2 per shot at 1440x2560, `world.update` + stage from `render.cjs stills`.

| metric | before F7 | after F7 |
|---|---:|---:|
| `fixtures/adi-parva/storyboard.json` | 680,366 B | **260,942 B** (−61.7 %) |
| update+stage median | 1 ms | 1 ms |
| update+stage max | 24 ms (S21) | 24 ms (S21) |
| final film wall | 853.8 s (2B) | **619.4 s** |
| final s/frame | 0.235 | **0.170** |
| QA | PASS | PASS, 0 unexplained pops |

The stage was already render-bound at this film length; caches (anchors, path key frames, motion closures, beats,
animated values, crowd/jar specs, jar grids, spec keys) mainly remove allocations. The wall-time improvement comes from
the smaller fixture and a less loaded machine; the target (2A speed 626.8 s) is met.

## Storyboard size

`fixtures/adi-parva/storyboard.json`: **680,366 → 260,942 bytes**, 39 shots. The compaction removed 1,691 per-frame path
keys from S25/S26/S30 by fitting the minimal key set that reproduces the same position **at every frame**, not merely
the same geometric line (the paths are linear but non-uniform in time). Golden frames for S25/S26/S30 remain 0.000.

## What a model must know to write `board.json`

1. Use the JSON Schema `schema/authoring.schema.json`; top level is `version`, optional `fps/tailFrames/crossfade/flash`,
   `cast`, optional `groups/kicks/points`, and `shots`.
2. Anchor strings are `line.word`, `line.word#nth`, optional `±Nf`/`±N.s`, `shot±…`, `end±…`, or `fN`. Plain word
   anchors default to 2 frames before the word. Durations/rates are seconds; angles are degrees.
3. Declare cast ids with `spec: "C.x"`/`"KIDS.x"` or an inline spec; optionally `variant: "priest"`; omit seed unless a
   specific identity is wanted. Groups live in `groups`.
4. Place actors at marks (`"village.front"`), mark+nudge, world arrays, or actor attachments (`{"on": id, "attach":
   "head"}`). A `row` expands a group around a mark with `spacing` and `curve`.
5. `says`, `do`, `enter`, `exit`, `appear` are actor sugar; `fx`/`set` use the v1 kinds with string anchors.
6. Semantic cameras use `size/on/angle/side/move`; the solver fills v1 camera numbers, subjects and default DOF.
7. Run `fableon compile --project <dir>`, then `fableon validate --deep` and `fableon frames`; fix errors, read warnings.
8. Use `raw` only for a field the authoring layer does not express; every occurrence is counted by the compiler.

## Deviations from the prompt

- **45 empty subject keys.** Every camera key has the `subjects` field, but 45 keys have an empty list: scenery shots,
   transition keys, or intervals where no actor stays inside the safe area for the full key duration. Naming a
  subject there would produce false errors; the report lists this instead of forcing bad data.
- **F6 needed small engine/data fixes.** Authoring required resolving top-level points in the compiler, the safe-area
  margin in the solver, hollow hut walls and a back-half city keep-out box (full boxes made interiors and Agni look
  permanently blocked), and attachment resolution outside an actor's visibility window. These are in the F6 commit.
- **S38 uses full framing, not close.** Agni's flame hair extends above the measured body crown; close/medium solvers
  cropped the head. The authoring fixture uses full for both Agni keys; the review sheet shows the result.
- **S33 follows the pigeon.** The pigeon is an effect id, not an actor; the compiled camera key has an empty `subjects`
  list so the frames validator has an actor to check, while `move: "follow"` still tracks the moving pigeon.
- **F6 full-all QA.** The eight-shot fixture omits the other 31 shots, so retained shots stretch across gaps and the
  full QA reports pops. This does not affect compile/validate/frames/render acceptance; the review sheet is the
  intended visual artifact.

## Problems and open questions

- The 42 warnings are genuine framing issues in the hand-tuned fixture (eye line outside 30-50 %). The prompt says not
  to fix the picture in this phase; they are listed for Phase 2D/3 review.
- The empty-subject keys are the main place where the fixture cannot satisfy both "name a subject on every key" and
  "0 errors". A future pass could split long keys or add explicit scenery subjects.
- The final run's improvement (853.8 → 619.4 s) includes machine-load variance; the stage profile itself is unchanged
  at median 1 ms / max 24 ms. The storyboard is 61.7 % smaller, which removes parse/memory overhead.
- Keep-out volumes are coarse. Hollow huts and the reduced city box are approximations; the next phase should derive
  wall volumes from geometry rather than hand boxes.

## Please look at

- `docs/reports/phase-2c-shots.jpg` — eight-shot compiled vs original review sheet.
- `fixtures/adi-parva-authoring/board.json` — the semantic re-expression (0 raw escapes).
- `fixtures/adi-parva-authoring/storyboard.json` — deterministic compiler output.
- `fixtures/adi-parva/storyboard.json` — compacted fixture with `subjects`.
- `work/adi/qa/frames.json` — 639 in-frame checks and the 42 warnings.
- `work/adi-final/final.mp4` — final-quality acceptance film (619.4 s run).
- `cli/src/solver.js`, `cli/src/frames.js`, `cli/src/authoring.js` — solver, validator and compiler.
