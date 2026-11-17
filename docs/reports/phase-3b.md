# Phase 3B report

## Summary

Phase 3B turns the prototype into a director-facing pipeline: the Hindi script is text-safe, the fact-check is
incremental with advisory craft, the voice keeps a natural pace, composition rules v3 catch the 2F carry-over cases,
the authoring board is back to 0 errors / 0 warnings, and a new `cast` stage designs, validates and renders an
approvable cast sheet. The full Adi film still renders identically (golden max 0.107). The user chose the natural
100.8 s voice fit and approved the cast sheet without notes.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `f412aac` | `docs: phase 3B prompt` | Saved the phase instructions before coding. |
| F1 | `0a9a307` | `fix(script): text integrity, quotes, names, pause-aware budget and fit` | Normaliser punctuation/gloss safety, 25-char unique quote rule, mentions, pause-aware budget, natural/exact fit. |
| F1 | `1e763f9` | `fix(script): keep punctuated Hindi lines separate` | Prevented the normaliser from re-gluing already punctuated lines. |
| F1 | `4b7217b` | `fix(script): Hindi hook and pause tolerance` | Hindi hook length and pause tolerance. |
| F2 | `60e74fe` | `fix(factcheck): incremental facts gate, advisory craft` | Per-line hashes, confirmation pass, craft advisory, `approve --override`, mock tests. |
| F2 | `3d8252a` | `fix(fixture): refresh savitri-hi through the pipeline` | F2 script edits, forest looks, Narada mention, F9 research edit, fact-check, 90 s fit. |
| F2 | `715b433` | `fix(voice): natural fit stops at tolerance; delivered rate` | Natural fit stops at ±12 % (100.8 s), cached-only refit, delivered rate, comparison files. |
| F3 | `5728d4e` | `fix(validator): composition rules v3` | Cut/over/tangent/face/entrance/edge-intruder rules, over compile error, redesigned authoring board, review images. |
| F4 | `af23c77` | `docs(guide): sizes and composition rules v3` | Size table by what is visible, v3 findings/fixes, under 8 KB. |
| F5 | `a966561` | `feat(director): cast stage and cast sheet` | Cast stage, schemas, traits/distinctness checks, asset gaps, cast sheet, `fableon cast --notes`. |
| F6 | this commit | `docs(report): phase 3b report` | This report. |

## Acceptance checks

### 1. `npm test` (green, golden <= 1.0)

```text
$ npm test
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS catalog metadata  8 sets, 46 marks, 610 volumes, 32 measures
PASS authoring  23/23 checks
PASS framing solver  17/17 checks
PASS frames validator  6/6 checks
PASS visibility solver  4/4 checks
PASS strict schema  5/5 checks
PASS partial boards  3/3 checks
PASS measured frames  10/10 checks
PASS measurement fixes  4/4 checks
PASS editing rules  3/3 checks
PASS director fixture match  49/49 checks
PASS pipeline offline  32/32 checks
PASS pipeline core  11/11 checks
PASS unicode words + anchors  13/13 checks
PASS voice providers  28/28 checks
PASS hindi script craft  17/17 checks
PASS cast design  7/7 checks
PASS validator  5/5 cases
PASS shot starts  39 anchors resolve to the old frames
PASS motion math  9/9 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

### 2. `fixtures/savitri-hi`

The final fixture has 21 lines, **234 words**, all deterministic script checks passing. The five glued prompt cases
(lines 7, 8, 10, 15, 17) are gone; the F2 hand edit put the sentence punctuation in the source and the normaliser
made **0 interventions** on the final script. The tests cover a merge (with `। `), a split with two glosses, and the
no-duplicate-gloss case.

The quote rule passes the 25-character line without the 30-character minimum:

```text
quoteVerified('Twice I shall not select.', 'He said, Twice I shall not select. Then he left.') === true
quoteVerified('Twice I shall', 'Twice I shall, twice I shall not.') === false
```

Incremental fact-check:

```text
factcheck reviewed 7 line(s); factual flags 0; craft weak 5
model deepseek-v4-pro, temperature 0, thinking enabled, reasoningEffort high
overrides 0; lines 21; weak [1, 3, 6, 19, 20]; flags []
```

The earlier craft notes on lines 1, 3, 6, 19 and 20 remain advisory. The F9 research claim/quote was corrected to
include the source’s “hundred sons” quote as a user-style edit; lines 15–17 that cite it are fact-check clean.
Research was not re-run, so “Twice I shall not select.” was not added to the facts; the quote rule test covers it.

Voice: the cached base take was **104.41 s**; local pauses × **0.60** (102.71 s); **atempo 1.0189** → **100.800 s**.
No provider-speed step and **no new ElevenLabs call** (cached-only refit). `words.json` has **234 words**, monotonic,
last word `गया` at 99.858–100.800 s.

```text
work/savitri-hi/voice/fit-compare/current-90s.wav  90.005333 s
work/savitri-hi/voice/fit-compare/natural.wav     100.800000 s
voice.rate.delivered: 2.321 words/s, 11.121 chars/s
base natural take:     2.241 words/s (234 / 104.41 s)
```

The user chose **natural 100.8 s** and rejected the old 90 s fit. The fixture keeps natural.

### 3. Director board under v3

```text
$ npx fableon compile --project fixtures/adi-parva-authoring
validate: OK (12 shots, 71 cast ids)
compile: … (12 shots, 0 raw escape(s))
sha256(storyboard.json) = 140d8e406ff9bb874daeb775d5a1315ec2dd1232b7a418f542e4cc90a528c669
sha256(storyboard.json) = 140d8e406ff9bb874daeb775d5a1315ec2dd1232b7a418f542e4cc90a528c669

$ npx fableon frames --project fixtures/adi-parva-authoring
frames: 24 keys, 0 error(s), 0 warning(s), 16.1 ms/frame coverage

$ npx fableon validate --deep --project fixtures/adi-parva-authoring
validate --deep: in-frame 125 checks, 0 error(s), 0 warning(s)
```

The L16 brothers have the staggered pop-in restored (`appear` at `16.Five`, staggers 0, 0.08, 0.16, 0.24, 0.32 s)
and a curved, narrower row. S14 uses the Pandu+deer two-shot with `with:deer`, a closer deer key, the sage close and
the Kunti/Pandu shock two-shot; S27 uses left/high keys and a tighter priest row; S38 cuts to a medium Agni and keeps
the fire in the first key. Review images are in `docs/reports/phase-3b/` (`sheet.jpg` 810×12280 plus 12 per-shot JPGs).

The full film is untouched and still passes the golden check; its measured warning table is warnings-only:

| fixture | keys | errors | warnings |
|---|---:|---:|---:|
| `fixtures/adi-parva` | 83 | 0 | 251 |
| `fixtures/adi-parva-authoring` | 24 | 0 | 0 |

The 251 full-film warnings are dominated by the new v3 checks (`cut subject` 65, `entrance off-screen` 39, `edge`
16, `blocker` 15, `subject too small` 14, `head cut` 10, `face too small` 9, `action off-screen` 9, `flat wide` 7,
`edge intruder` 7, `subject hidden` 5, `tangent` 3, plus eye-line/speaker/jump-cut/size warnings). They are
warnings for the v1 film; no pixels changed. The seven new edge-intruder warnings are S10 devavrata/satyavati,
S25 kunti, S27 priestBro0/1 and S30 priestBro1.

### 4. Cast sheet and approval

`fixtures/savitri-hi/cast.json` (4 characters) and `fixtures/savitri-hi/assets.todo.json`; sheet
`fixtures/savitri-hi/cast/cast-sheet.jpg` (810×1056, 104 KB, under 1600 px tall).

| character | spec | mustHave mapping |
|---|---|---|
| Savitri | skin `#e7b07e`, slim, teal sari `#2f8a8a`, head long, flower | woman→sari, sari→sari, long-hair→head, young→build |
| Satyavan | skin `#7f4b2e`, adult, brown lower `#6b4a2e`, bare top | forest-clothes→lower/top/drape, young-man→build |
| Yama | skin `#2b1a1a`, big, red top/lower/drape `#c62828`, crownSmall, gold crown | dark-skin→skin, red-attire→garment, crown/god→head |
| Narada | skin `#c98c5c`, elder, gold lower, bun, grey beard (long) | sage→build, beard→beard/beardLong |

Main-character ΔE checks: Savitri/Satyavan skin 21.2, garment 48.5; Savitri/Yama skin 53.8, garment 96.0;
Satyavan/Yama skin 70.5, garment 51.0. Builds {slim, adult, big} and heads {long, hair, crown} are not all the same.
Narada’s sheet uses a bun rather than a topknot; the user approved the sheet as rendered.

Asset gap: **Yama’s noose**, lines **8 and 19**, priority high, suggested stand-in **`net`**. No catalog item was
invented.

The user reviewed `fixtures/savitri-hi/cast/cast-sheet.jpg`, approved it without notes, and `fableon approve
--project work/savitri-hi --stage cast` recorded hash `ee7d7d05aa02`.

### 5. Commit order

```text
f412aac docs: phase 3B prompt
0a9a307 fix(script): text integrity, quotes, names, pause-aware budget and fit
1e763f9 fix(script): keep punctuated Hindi lines separate
4b7217b fix(script): Hindi hook and pause tolerance
60e74fe fix(factcheck): incremental facts gate, advisory craft
3d8252a fix(fixture): refresh savitri-hi through the pipeline
715b433 fix(voice): natural fit stops at tolerance; delivered rate
5728d4e fix(validator): composition rules v3
af23c77 docs(guide): sizes and composition rules v3
a966561 feat(director): cast stage and cast sheet
this commit  docs(report): phase 3b report
```

## F3 rules and regression cases

The authoring board is semantic, so its findings are errors; hand-written v1 film keys get warnings. The prompt’s
“WARNING” cases are therefore warnings on the full film and errors only when a semantic board repeats them.

| finding | severity | 2F case | regression test | result |
|---|---|---|---|---|
| `cut subject` | ERROR | S14 opening deer cut by the side | `tests/measured.mjs`: S14 deer key without `third` | fires |
| `over not foreground` | ERROR | S14 opening Pandu head 11 %, ratio 0.76 | `tests/authoring.mjs`: S14/over compile | fires with `over cannot be foreground: pandu is 4.7 m from camera vs 6.1 m for deer` |
| `edge intruder` | WARNING | L5 Satyavati sliver | `tests/measured.mjs`: L5 old nudge | fires (31 % visible) |
| `tangent` | WARNING | S27 pole on draupadi/priestBro2 | `tests/measured.mjs`: S27 front/eye | fires |
| `face too small` | WARNING | S38 Agni 5.2 % head | `tests/measured.mjs`: S38 wide key | fires |
| `entrance off-screen` | WARNING | S14 Kunti entrance | `tests/measured.mjs`: S14 Kunti off-screen | fires |

The edge-intruder fix measures the visible width against the actor’s projected full width; the old renderer
visibility fraction was 1 for a card clipped by the frame edge, so the L5 sliver never warned. `with` now resolves an
actor id before a same-named mark, and actor-level `offscreen:true` suppresses the entrance/action checks.

## F4 size table (by what is visible)

`head` is head-box height / frame; `body` is head-to-feet / frame.

| size | what you see | band / target | reference |
|---|---|---|---|
| close | head and shoulders/chest | head 25–60 %, target 26 % | S14 sage f1302 |
| medium | waist up | head 12–42 %, target 16 % | S38 Agni f3468 |
| full | whole figure, feet in frame | body 30–85 %, target 34 % | S14 Kunti/Pandu f1349 |
| wide | whole figures plus surroundings | body 15–50 %, others ≥10 % | L16 f1591 |
| establishing | the set, figures small | subjects ≥5 % | S27 arena f2516 |
| insert | a prop or mark fills the frame | fill 55–90 %, target 72.5 % | S27 bow f2638 |

`docs/DIRECTOR_GUIDE.md` is **7982 bytes**.

## Measurements

- Host: macOS 26.5.2, Apple M1 CPU/GPU, WebGL `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`.
- Authoring measured coverage: 24 keys, **16.1 ms/frame** at 180×320; cast-sheet stills 5 frames at 270×480
  (0.2 s first frame, then 0.0 s each after warm-up).
- Full Adi film: 39 golden midpoints max mean abs diff **0.107**; stills max 1.809 (limit 6); audio 121.300 s,
  −14.52 LUFS.
- Disk: `fixtures/savitri-hi` 4.9 MB (voice 4.6 MB, cast sheet 104 KB), `fixtures/adi-parva-authoring` 5.8 MB,
  `docs/reports/phase-3b` 3.3 MB.

## Cost

Phase 3B model spend from `logs/calls.jsonl` after `f412aac`:

| stage | calls | cost |
|---|---:|---:|
| script (F2 drafts/repairs) | 21 | $0.15566 |
| factcheck (F2 incremental/final) | 18 | $0.64173 |
| voice (base take + old 90 s provider-speed take) | 2 | $0.21008 |
| cast (3 calls: draft + 2 repairs) | 3 | $0.00284 |
| **total logged** | | **$1.0103** |

The final committed artifacts’ direct spend is **$0.1290** (factcheck $0.02106, voice base take $0.10504, cast
$0.00284); the other $0.10504 is the discarded old 90 s fit, and the rest is discarded F2 draft/repair work. The
natural refit itself cost **$0.00** (cached base take). The cast
state records 11,292 prompt / 1,425 completion tokens and $0.00284.

## Deviations from the prompt

1. **Entrance floor 3 %, not 4 %.** A five-person wide group at the calibrated wide target projects 3.9 % per
   brother, so a 4 % floor falsely called a valid group off-screen. The guide documents the calibration and the
   regression tests cover the rule. All other v3 thresholds are as prompt.
2. **`over` is now unusable with the current solver.** The compile check requires the over actor at ≤0.60 of the
   subject distance; the solver’s best over composition is about 0.66, so a semantic over key is rejected. The
   authoring S14 uses `with:deer` as directed. A solver fix or a threshold decision belongs to a later phase.
3. **Narada uses a bun, not a topknot.** The model’s mustHave is sage+beard; the user approved the rendered sheet.
4. **Cast stage placement.** It sits after factcheck in the linear stage list although it only depends on script, so
   `fableon cast --only` and the normal `--to voice` path both work without changing the existing factcheck test
   path.
5. **Research F9** was corrected as a user-style edit; research was not re-run just to add “Twice I shall not select.”

## Problems and open questions

- The `over` solver/check conflict above is the main open question: relax the distance ratio to 0.70, or improve the
  solver’s two-plane geometry.
- The full film now has 251 warnings under v3 (0 errors). The largest new groups are `cut subject` (65) and
  `entrance off-screen` (39); these are warnings on the v1 film and do not move pixels. Re-authoring the film to v3
  is out of scope.
- `fixtures/savitri-hi` still reports pronunciation TODOs (सावित्री, सत्यवान, यम, नारद); pronunciation work was outside
  F2.
- The cast sheet group row is a wide lineup; the solo stills are the close reference. A future cast sheet can add a
  tighter two-row group without changing the stage contract.

## Please look at

- `fixtures/savitri-hi/cast/cast-sheet.jpg` — approved cast sheet (Savitri, Satyavan, Yama, Narada).
- `fixtures/savitri-hi/cast.json` and `assets.todo.json` — cast specs, mustHave traits and the noose gap.
- `docs/reports/phase-3b/sheet.jpg` and `docs/reports/phase-3b/{S14,L16,S27,S38}.jpg` — redesigned authoring shots.
- `docs/DIRECTOR_GUIDE.md` — size table and v3 rules.
- `work/savitri-hi/voice/fit-compare/current-90s.wav` vs `natural.wav` — the comparison the user chose from.
