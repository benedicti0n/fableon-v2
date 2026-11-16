# Phase 2E report

## Summary

The validator now measures the picture instead of estimating it. `fableon frames` renders an object-ID coverage pass
at 180×320, measures visibility, head/body size, blockers, context items, eye lines and talkers, writes `frames.json`
with fix hints, and uses the same settle/mid/end sampling as the review sheets. The 12-shot director board was rebuilt
with the new grammar and reaches **24 keys, 0 errors, 0 warnings, 0 raw escapes**, with a byte-identical recompile and
per-shot review images. The full hand-written fixture is still **0 errors**; its 130 findings are warnings, and its
pixels are unchanged (golden max 0.107). Coverage timing is recorded: 18–23 ms for a warm single frame, 62.4 ms with
six solo subjects (~4 % over the 60 ms target).

## Commits

| # | Hash | Message | What / why (one line) |
|---|---|---|---|
| 0 | `6d9f4a2` | `docs: phase 2E prompt` | Saved the phase instructions before coding. |
| F1 | `9bf63cb` | `fix(schema): close the last open objects` | Typed `do`/actor params per special, catalog enums, strict-walk test. |
| F2 | `6c98da7` | `feat(engine): coverage pass (object-ID render)` | `coverageFrame`, IDs, head/eye boxes, solo fractions, timing. |
| F4 | `0998975` | `feat(solver): size bands, context, mark views, two-plane over, ride` | Screen targets, `with`, derived views, over, ride (committed before F3; see deviations). |
| F3 | `7b1c8ea` | `feat(validator): measured composition checks` | Measured validator, settle sampling, bands, blockers, context, `frames.json`. |
| F5 | `6afb718` | `feat(review): per-key, settled review sheets` | Per-key settle/end-2 rows, coverage column, `review.json`, `--split`. |
| F6 | `cef3fcd` | `fix(fixture): director board passes the measured checks` | 12-shot board, calibrated bands, mark/context fixes, review images. |
| F7 | this commit | `docs(report): phase 2E report` | Director guide and this report. |

## Acceptance checks

### 1. `npm test`

```text
$ npm test
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS catalog metadata  8 sets, 46 marks, 610 volumes, 32 measures
PASS authoring  16/16 checks
PASS framing solver  15/15 checks
PASS frames validator  6/6 checks
PASS visibility solver  4/4 checks
PASS strict schema  5/5 checks
PASS partial boards  3/3 checks
PASS measured frames  4/4 checks
PASS validator (5/5)
PASS validator  5/5 cases
PASS shot starts: 39 resolved
PASS shot starts  39 anchors resolve to the old frames
PASS motion math (9/9)
PASS motion math  9/9 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

New coverage/schema/solver/validator tests: strict walk (no open objects outside cast/points/groups), wide-band target,
`with` context, group-too-wide hint, two-plane `over`, `ride`, measured S27 blocker/size warnings, and the settled
review path.

### 2. Coverage timing and unchanged renders

`docs/BENCHMARKS.md`:

| workload | per frame |
|---|---:|
| one frame, no solo subjects (warm) | 18–23 ms (first frame 84 ms incl. shader compile) |
| one frame, six solo subjects | 62.4 ms |
| director board, measured run | 13.9–14.2 ms/frame over 121 checked frames |
| full fixture, measured run | 13.4–13.5 ms/frame over 313 checked frames |

The 6-subject case is ~4 % over the 60 ms target; the cost is the six extra solo scene renders, not the ID readback.
Normal renders are unchanged: `PASS stills max 1.809`, `PASS golden frames 39 shot midpoints, max 0.107 <= 1`.

### 3. Director board

```text
$ npx fableon compile --project fixtures/adi-parva-authoring
validate: OK (12 shots, 71 cast ids)
compile: … (12 shots, 0 raw escape(s))

$ sha256sum fixtures/adi-parva-authoring/storyboard.json   # twice
35cb53a0a37619373d0dbc8cf8bc011fb50ca5e0bdae1ed2f4ed77600fb0d270  fixtures/adi-parva-authoring/storyboard.json
35cb53a0a37619373d0dbc8cf8bc011fb50ca5e0bdae1ed2f4ed77600fb0d270  fixtures/adi-parva-authoring/storyboard.json

$ npx fableon frames --project fixtures/adi-parva-authoring
frames: 24 keys, 0 error(s), 0 warning(s), 14.2 ms/frame coverage

$ npx fableon validate --deep --project fixtures/adi-parva-authoring
validate --deep: in-frame 121 checks, 0 error(s), 0 warning(s)
```

Review images: `docs/reports/phase-2e/sheet.jpg` (1620×12280) and one `--split` image per shot
(`S1,S5,L5,L12,S14,L16,S20,S22,S26,S27,S33,S38.jpg`, each ≤1600 px tall), plus `review.json`. Rows are camera keys,
sampled at the settle frame and key end-2; a key that starts with a light-change crossfade adds half the crossfade to
its settle, so no row is a crossfade frame.

### 4. Strict per-project schema and catalog card

```text
$ npx fableon schema --project fixtures/adi-parva-authoring --out work/auth-schema.json
schema: …/auth-schema.json (113,804 bytes, 12 shots)

# tests/schema.mjs walks every object schema
PASS strict schema  5/5 checks   (no open object schemas; detail empty)

$ npx fableon catalog-card --out work/catalog-card.txt
catalog-card: … (8,091 bytes < 12 KB)
```

### 5. Commit order

```text
2e0d890 fix(fixture): director board passes the measured checks
6afb718 feat(review): per-key, settled review sheets
7b1c8ea feat(validator): measured composition checks
0998975 feat(solver): size bands, context, mark views, two-plane over, ride
6c98da7 feat(engine): coverage pass (object-ID render)
9bf63cb fix(schema): close the last open objects
6d9f4a2 docs: phase 2E prompt
```

PASS, with one documented exception: F4 was committed before F3 because F3 consumes F4's `with`/size/context fields.

## Measurements

macOS 26.5.2 (25F84), Apple M1, WebGL renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`. Preview render size 540×960 for review stills,
270×480 in the sheet; coverage 180×320 (solo 72×128). The full measured run covers 83 keys / 313 frames; the director
run 24 keys / 121 frames. `docs/reports/phase-2e/` is 5.6 MB on disk (2.9 MB sheet + 12 split images).

## Calibrated size bands

Measured on the settle frame of every keyed, acted shot of `fixtures/adi-parva` (38 keys with a primary person/effect).
Head is head-box height / frame; body is top of head to feet / frame.

| size | metric | starting band | calibrated band | fixture keys | rejected by the starting band |
|---|---|---:|---:|---:|---:|
| close | head | 40–60 % | **25–60 %** | 6 (26–29 %, one 3.5 % outlier) | 6/6 |
| medium | head | 26–42 % | **12–42 %** | 9 (12–29 %) | 8/9 |
| full | body | 50–85 % | **30–85 %** | 3 (30.0, 33.8, 37.5 %) | 3/3 |
| wide | body, primary | 15–50 % | 15–50 % | 11 (10–39 %) | 1/11 (9 %) |
| establishing | body, listed | ≥5 % | ≥5 % | 2 (9.1, 12.2 %) | 0/2 |
| insert | target box | 30–85 % | 30–85 % | 0 authored | — |

Best-fit distribution of the 38 acted keys: **wide 14, medium 7, establishing 4, insert 4, full 3, close 0,
unmeasurable/absent primary 6**. The fixture's close-labelled v1 keys measure 26–29 % head, not 40–60; its medium keys
measure 12–29 % head; its full keys measure 30–37.5 % body. The calibrated floors keep more than 90 % of comparable
keys. The one close failure is a 3.5 % head on S5 key 1 (a wide v1 shot whose fov infers close), not a comparable
close-up. The solver now centres close at 42.5 % head, medium at 27 %, full at 57.5 %; the director board still passes
0/0 and S14's sage close is 42.1 % with the whole head inside.

## Mark views

Derived as the median camera heading of fixture keys whose look point is within 4 m of the mark, then corrected where
the derived median put the camera behind the burning set. The table below is the committed catalog (`view` degrees,
0 = +z). The pre-correction medians were `lac.house` -2 and `city.agni` 0; they became 180 and 172.

| set | mark | view° | | set | mark | view° |
|---|---|---:|---|---|---|---:|
| palace | courtyard | 177 | | hermitage | mat | 138 |
| palace | cy | 177 | | hermitage | desk | -148 |
| palace | ghat | 172 | | hermitage | hut | 154 |
| palace | jars | 29 | | hermitage | banyan | 180 |
| palace | mango | 178 | | hermitage | clearing | 180 |
| palace | tree | 178 | | deer | clearing | 175 |
| palace | plate | 5 | | deer | pandu | 173 |
| palace | boat | 180 | | deer | deer | -9 |
| village | front | -4 | | deer | kunti | 160 |
| village | hut | 2 | | deer | sage | -9 |
| village | hutDoor | 2 | | lac | door | 180 |
| village | door | 80 | | lac | hall | 172 |
| village | boats | 180 | | lac | tunnel | -174 |
| village | palms | 180 | | lac | stage | -2 |
| arena | dais | 170 | | lac | house | 180 |
| arena | bow | 166 | | city | clearing | 176 |
| arena | bowstand | 166 | | city | agni | 172 |
| arena | pole | 166 | | city | stumps | 177 |
| arena | target | 172 | | city | forest | 180 |
| arena | seats | 180 | | city | palace | 9 |
| arena | kingsLeft | 180 | | naga | floor | 176 |
| arena | kingsRight | 180 | | naga | court | 176 |
| arena | floor | 180 | | naga | throne | 180 |

## Full-fixture measured findings

`npx fableon frames --project fixtures/adi-parva` → **83 keys, 0 errors, 130 warnings, 13.4 ms/frame**. These are
warnings because the v1 keys are hand-written, not semantic board keys; no pixels changed.

| code | count |
|---|---:|
| `subject hidden` | 47 |
| `eye line` | 24 |
| `speaker off-screen` | 23 |
| `subject too small` | 15 |
| `blocker` | 12 |
| `head cut` | 8 |
| `subject too large` | 1 |

Ten worst (first checked frame per case):

| shot | key | frame | code | id | measured |
|---|---:|---:|---|---|---|
| S5 | 0 | 427 | `subject hidden` | shantanu | 0 % visible |
| S5 | 0 | 484 | `blocker` | boat | 16 % in front of shantanu |
| S5 | 1 | 492 | `subject too small` | shantanu | 3 % vs close floor 25 % |
| S14 | 0 | 1220 | `subject too small` | deer | 3 % vs medium floor 12 % |
| S14 | 0 | 1220 | `blocker` | world:deer.forest canopy | 32 % in front of deer |
| L5 | 0 | 508 | `subject hidden` | satyavati | 0 % visible (the speaker cutaway) |
| S16 | 1 | 1545 | `subject too large` | kunti | 50 % over wide ceiling 50 % |
| S23 | 2 | 2177 | `subject too small` | kidDuryodhana103 | 10 % vs wide floor 15 % |
| S25 | 0 | 2303 | `subject hidden` | kunti | 0 % visible |
| S26 | 0 | 2395 | `subject too small` | adult1 | 11 % vs medium floor 12 % |

The S5 and S14 entries are exactly the cases the director board repairs: S5 is now medium ghat + boat follow, S14 is a
two-plane deer shot with a readable 17.2 % deer, and S27 is a wide Draupadi on the dais with no column blocker (30.6 % body).

## Director-board per-key results

| shot | key | size | primary | height % | visible | eye line % | verdict |
|---|---:|---|---|---:|---:|---:|---|
| S1 | 0 | full | ganesha | 56.6 | 99 % | 40.6 | OK |
| S5 | 0 | medium | shantanu | 26.8 | 100 % | 40.2 | OK |
| S5 | 1 | medium | satyavati | 26.5 | 100 % | 42.0 | OK |
| L5 | 0 | medium | fisher | 26.5 | 100 % | 40.3 | OK |
| L5 | 1 | medium | fisher | 26.9 | 100 % | 40.1 | OK |
| L12 | 0 | medium | dhritarashtra | 26.8 | 100 % | 40.2 | OK |
| L12 | 1 | medium | pandu | 26.4 | 100 % | 40.3 | OK |
| S14 | 0 | wide | deer | 17.2 | 96 % | 42.4 | OK |
| S14 | 1 | close | sage | 42.1 | 100 % | 40.2 | OK |
| S14 | 2 | medium | kunti | 26.8 | 100 % | 40.1 | OK |
| L16 | 0 | wide | bro0 | 21.6 | 100 % | 43.5 | OK |
| S20 | 0 | wide | scenery (jars) | — | — | — | OK |
| S22 | 0 | wide | kidBhima | 33.8 | 99 % | 39.9 | OK |
| S22 | 1 | wide | kidBhima | 34.1 | 100 % | 64.3 | OK (wide; eye line is not checked) |
| S26 | 0 | medium | priest | 26.7 | 100 % | 40.2 | OK |
| S26 | 1 | establishing | scenery (house) | — | — | — | OK |
| S27 | 0 | wide | draupadi | 30.6 | 100 % | 38.7 | OK |
| S27 | 1 | medium | draupadi | 26.8 | 100 % | 40.1 | OK |
| S27 | 2 | wide | scenery (bow) | — | — | — | OK |
| S27 | 3 | wide | scenery (tilt) | — | — | — | OK |
| S33 | 0 | medium | kunti | 26.7 | 100 % | 40.2 | OK |
| S33 | 1 | wide | pigeon | 22.5 | 100 % | — | OK |
| S38 | 0 | wide | agni | 25.6 | 100 % | 44.7 | OK |
| S38 | 1 | wide | agni | 25.9 | 100 % | 44.7 | OK |

## Deviations from the prompt

1. **F4 before F3.** The measured validator consumes the `with`/size/context fields and the `ride`/over solver work,
   so F4 was committed first (`0998975`), then F3 (`7b1c8ea`). Everything else is in the requested order.
2. **Calibrated bands after the first director pass.** The starting bands rejected the reference film's own close and
   medium keys (6/6 and 8/9). The bands were widened in F6 after measuring the 38 acted fixture keys; F6 was amended
   with the calibrated constants, the recompiled board and the regenerated review images.
3. **Tiny-fx blocker guard.** The spec's overlap branch flagged a 0 %-area arrow crossing the deer as a blocker. A
   blocker now needs at least 1 % frame area for the 25 % overlap branch (`BLOCKER_MIN_AREA`); the >12 % area branch is
   unchanged. This is recorded in `cli/src/composition.js`.
4. **`palace.tree` context alias.** The tree mark sits at the trunk base inside the trunk volume, so its mark proxy is
   never visible. The catalog mark carries `context: "world:palace.mango canopy"`; the validator measures the canopy
   while the solver frames the mark. The canopy appears at the top of S22's frame.
5. **S38 fire is explicit spots.** The derived `city.agni` view and the north `cityTreetops` source put the rising-city
   keepout between the camera and Agni, so a semantic camera could not see the fire. S38 moves Agni to `city.forest`,
   uses a wide/fov 60 camera and explicit fire spots around the forest mark. This preserves night + burning forest but
   is a board-level approximation of the fixture's raw camera.
6. **S14's over actor moved closer.** Pandu is nudged to 4.2 m from the deer so the two-plane solver can keep both at
   their bands with a normal lens; the arrow's `fromPoint` follows his bow.
7. **S27's bow insert.** The giant bow is 5.2 m wide; an `insert` (or `wide` at its 32.5 % target) can only show a 2.9 m
   horizontal span. It is a `wide` + `fov:75` tight insert; the bow arc and stand are visible, but touch the edges.

## Problems and open questions

- **Coverage target.** Six solo subjects cost 62.4 ms, about 4 % over the 60 ms target. Caching solo silhouettes or
  reading back a smaller ID target could close it; no visual or correctness shortcut was taken.
- **Mark context needs world volumes.** `palace.tree` needed a hand-written canopy alias. A general mark→world-volume
  mapping (and a per-mark context box) would let `with` frame the actual set object, not just a point proxy.
- **Wide prop inserts.** Size bands are body/head targets; a 5.2 m bow cannot fit at a 2.9 m horizontal span. A
  per-mark `measure` or explicit `frame` box is the clean fix.
- **S38 fire source.** The explicit spots look deliberate but do not reuse the fixture's treetop fire distribution; a
  semantic camera that can ignore/avoid the rising-city keepout would let the original source work.
- **S22 canopy.** The canopy is measured at the top edge of the frame; the trunk and Bhima are clear, but the tree is
  not fully composed. This is the same mark-context limitation.
- **Full fixture warnings.** 130 warnings remain (47 hidden, 24 eye line, 23 speaker, 15 size, 12 blocker, 8 head cut,
  1 too large). They are the v1 hand-written keys, not semantic boards; changing them would change pixels.
- **Review cost.** `review` runs the measured check once for verdicts, then renders the keys; a future version can
  reuse the coverage jobs from the same pass.

## Please look at

- `docs/reports/phase-2e/sheet.jpg` and `docs/reports/phase-2e/{S5,S14,L5,S22,S27,S38}.jpg` — the new per-key,
  settled rows with coverage IDs.
- `fixtures/adi-parva-authoring/board.json` — 12 shots, 0 raw escapes, the working grammar.
- `fixtures/adi-parva-authoring/storyboard.json` — compiled, byte-identical.
- `docs/DIRECTOR_GUIDE.md` — 7.9 KB model-facing guide with the calibrated bands and measured error table.
- `cli/src/frames.js`, `cli/src/solver.js`, `cli/src/composition.js` — measured checks, context projection, bands.
- `engine/src/main.ts` — `coverageFrame` and the solo passes.
