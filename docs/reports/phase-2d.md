# Phase 2D report

## Summary

Phase 2D makes the authoring layer director-safe. Camera keys now reject invisible subjects, frame moving subjects by
their whole active range, support over-the-shoulder, targeted tilt/pan/reveal, vertical thirds and prop inserts. The
validator catches invisible subjects, empty keys, too-close subjects and foreground blockers; the full fixture resolves
all 45 previously empty keys as explicit `scenery` and ends at **0 errors / 42 warnings**. The authoring schema is
closed and can be specialised per project; the 12-shot director fixture compiles with **0 raw escapes**, passes
`validate --deep` and `frames` with 0 errors, and has a committed review sheet. A 4.7 KB director guide is included.

## Commits

| # | Hash | Message | What / why (one line) |
|---|---|---|---|
| 0 | `93d6dcc` | `docs: phase 2D prompt` | Saved the phase instructions before coding. |
| F1 | `23c0dc7` | `fix(solver): visibility-aware subjects` | Visibility windows, `later`, moving union sampling, effect measures. |
| F2 | `4385982` | `feat(solver): composition grammar` | `over`, `to`, tilt/pan/reveal, thirds, insert marks. |
| F3 | `d4732a7` | `feat(validator): blockers, invisible subjects, explicit scenery` | Scenery semantics, invisible/too-close/blocker checks; fixture data-only resolution. |
| F4 | `23bc148` | `feat(schema): strict authoring schema + per-project schema` | Closed schema, `fableon schema`, `fableon catalog-card`. |
| F5 | `4763b97` | `feat(compiler): partial boards and shot previews` | Explicit ends, `--shots` ranges, `fableon review`. |
| F6 | `2439571` | `feat(fixture): director-quality authoring example` | 12-shot partial board, marks, over/tilt/insert, review sheet. |
| F7 | this commit | `docs(report): phase 2D report` | Director guide and this report. |

## Acceptance checks

### 1. `npm test`

```text
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS catalog metadata  8 sets, 46 marks, 610 volumes, 32 measures
PASS authoring  15/15 checks
PASS framing solver  11/11 checks
PASS frames validator  6/6 checks
PASS visibility solver  4/4 checks
PASS strict schema  5/5 checks
PASS partial boards  3/3 checks
PASS validator (5/5)
PASS shot starts: 39 resolved
PASS motion math (9/9)
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

The new tests cover invisible/`later` subjects and moving unions, over/third/pan, unmarked empty keys, foreground
blockers, too-close subjects, strict-schema/board validation, catalog-card size and partial-board ends.

### 2. Full fixture in-frame check

```text
$ npx fableon frames --project fixtures/adi-parva
frames: 637 checks, 0 error(s), 42 warning(s)

$ npx fableon validate --deep --project fixtures/adi-parva
validate: OK (39 shots, 71 cast ids)
validate --deep: in-frame 637 checks, 0 error(s), 42 warning(s)
```

Warnings are true eye-line findings, not errors:

| shot | checks | frames | subject | eye line |
|---|---:|---|---|---|
| S5 | 4 | 486-504 | shantanu | 28.8 % (just above the 30 % band) |
| L10 | 9 | 932-980 | shantanu | 51.9 % |
| L12 | 14 | 1105-1183 | dhritarashtra | 59.1 % |
| S14 | 1 | 1247 | deer | 61.3 % |
| L14 | 9 | 1337-1385 | kunti | 54.7 % |
| S19 | 5 | 1725-1749 | vyasa | 51.8 % |

No camera key has an empty, unmarked subject list: 38 keys name subjects, the 45 formerly empty keys are
`"scenery": true`.

### 3. Director-quality fixture

```text
$ npx fableon compile --project fixtures/adi-parva-authoring
validate: OK (12 shots, 71 cast ids)
compile: … (12 shots, 0 raw escape(s))

$ npx fableon validate --deep --project fixtures/adi-parva-authoring
validate --deep: in-frame 322 checks, 0 error(s), 0 warning(s)

$ sha256sum storyboard.json; npx fableon compile …; sha256sum -c
… OK (byte-identical)
```

The 12 shots are S1 (opening Ganesha hook), S5 (Satyavati's boat, follow camera), L5, L12, S14, L16, S20, S22
(Bhima/mango tree), S26 (lacquer fire), S27, S33 (pigeon follow) and S38 (Agni). The board uses set marks everywhere,
groups for the brothers/priests/kings, `over` on S14's opening deer shot, a close-up on the sage, and S27's tilt from
the arena floor to the target plus an insert on the bow stand.

Review sheet: `docs/reports/phase-2d-shots.jpg` — 12 rows, start/mid/end pairs, compiled left of each pair and the
original fixture right, 1620x6108, 1.95 MB.

### 4. Strict schemas and catalog card

```text
$ npx fableon schema --project fixtures/adi-parva-authoring --out work/auth-schema.json
schema: …/auth-schema.json (100,985 bytes, 12 shots)
# no "additionalProperties": true remains; raw is closed for this board

$ npx fableon catalog-card --out work/catalog-card.txt
catalog-card: work/catalog-card.txt (8,091 bytes)
```

The per-project schema fixes cast ids, groups, poses, expressions, props, specials, sets, lights, marks, effects and
the project's word-line pattern. The catalog card carries sets/marks, poses, expressions, props, specials with params,
effects with key params, set pieces and measured sizes.

### 5. Commit order

`git log --oneline` shows `93d6dcc docs: phase 2D prompt` followed by F1-F7 in order.

## Full-fixture empty-key resolution

All 45 empty keys were resolved as explicit scenery (data-only change):
`S1 1, L1 1, L2 1, S4 1, L5 1, L6 1, L7 1, L8 1, S10 2, L10 1, S12 1, L12 1, S14 2, L14 1, S16 1, S18 1, S19 2,
S20 2, S21 2, S23 1, S24 3, S25 1, S26 2, S27 1, S28 1, S29 1, S30 1, S31 1, S32 1, S33 2, S34 1, S35 1, S38 3, S39 1.`

Two data-only corrections were needed to keep the full fixture at 0 errors: `S16` babyM0 uses `later`
(it appears inside the key), and `S22` no longer lists `kaurava1` after it exits. No pixels changed.

## What still needed workarounds

- The authoring fixture is a **partial** board. Its shot ranges are explicit; review stills at a cut use the exact
  start frame, so the first pair can show a legitimate crossfade ghost. The `fableon review` tool does not hide it.
- S1 opens with a full Ganesha framing rather than a very tight close; the Ganesha head/crown measure makes a close-up
  less reliable. A director would use `medium` or `full` here.
- S27's insert mark is the prop band around the bow stand; it is an approximate semantic anchor, not a per-vertex
  attachment.
- S5's follow camera tracks Satyavati through an explicit actor path; the boat set piece has the same path. A future
  moving-target resolver should let a camera follow the boat directly.
- The full fixture's 42 warnings remain (eye lines); Phase 2D intentionally does not change the picture.
- Foreground blocker checks allow lower-corner over-shoulder foreground and exempt ambient effect cards
  (`halo`, `fire`, `smoke`, `burst`, `splash`, `petals`, `puff`, `stars`) from the >30 % rule; this is the practical
  interpretation needed for the hand-tuned film.
- `fableon schema` writes `schema.json` beside the board unless `--out` is given; that generated file is gitignored.

## Please look at

- `docs/DIRECTOR_GUIDE.md` — 4,708 bytes, the model-facing guide.
- `docs/reports/phase-2d-shots.jpg` — the 12-shot review sheet.
- `fixtures/adi-parva-authoring/board.json` — 12 shots, 0 raw escapes.
- `fixtures/adi-parva/storyboard.json` — subjects/scenery data-only resolution.
- `cli/src/solver.js`, `cli/src/frames.js`, `cli/src/authoring.js`, `cli/src/schema.js` — solver/validator/compiler.
- `work/auth-schema.json` and `work/catalog-card.txt` — specialised schema and prompt card.
