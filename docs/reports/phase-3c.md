# Phase 3C report

## Summary

The pipeline now directs a story: `cast → voice → shotplan → board → animatic`. The cast sheet is measured-clean,
the shot plan is approved, the board is compiled with one honest `needsHuman` shot, and the 100.5 s animatic is QA
PASS and user-approved. The full Adi film still renders identically (golden max 0.107); the authoring board remains
0 errors / 0 warnings and S27 opens on the arena pole.

The main limitation is recorded below: the board writer uses a deterministic base built from the approved shot plan
plus measured staging variants, not the model staging patch described in F4. The model schemas/defaults are in place,
but the patch path was not wired before the animatic checkpoint.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `73a89e5` | `docs: phase 3C prompt` | Saved the phase instructions. |
| F1 | `c20a63d` | `fix(solver): screen-space over, grounded wides, validated cast sheet` | Screen over rule, grounded feet, S27 pole, measured cast sheet, per-character blockers. |
| F2 | `1b98f4e` | `fix(cast): Yama indigo, face-contrast warning` | WCAG face-contrast warning, indigo trait, indigo Yama, note-preserving cast rerun. |
| F3 | `60ca004` | `feat(director): shot plan stage` | Shotplan schema, craft file, skeleton/keys calls, checks, notes command, checkpoint. |
| F4 | `6af9561` | `feat(director): board writer with measured repair` | Per-shot slim schema, board stage, compile/measured variants, review/needsHuman, `fableon board`. |
| F5 | `e0c4086` | `feat(director): animatic stage` | Preview segments, voice-only mux, planned-cut QA, PASS/FAIL. |
| F6 | `12907c0` | `feat(fixture): direct Savitri` | Cast/shotplan/board/storyboard/frames/review/QA plus review images. |
| F7 | this commit | `docs: guide, pipeline and phase 3C report` | Guide, craft, pipeline, roadmap, report. |

## Acceptance checks

### 1. `npm test`

```text
$ npm test
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS authoring  24/24 checks
PASS framing solver  18/18 checks
PASS measured frames  11/11 checks
PASS cast design  11/11 checks
PASS shot plan checks  14/14 checks
PASS board writer  5/5 checks
PASS pipeline offline  32/32 checks
PASS golden frames  39 shot midpoints, max 0.107 <= 1
all checks passed
```

The new tests cover screen over (compiles and measured), grounded `footV` (0.74–0.82), face-contrast warning and
indigo trait, shot-plan anchors/coverage/timing/catalog/landmark/jump-cut/light/look.who/stand-ins, per-shot schema
size (7.5 KB), and a mock measured repair loop with fail→pass, escalation and needsHuman cases.

### 2. Authoring board and cast sheet

```text
$ npx fableon frames --project fixtures/adi-parva-authoring
frames: 24 keys, 0 error(s), 0 warning(s)
$ npx fableon validate --deep --project fixtures/adi-parva-authoring
validate --deep: in-frame 125 checks, 0 error(s), 0 warning(s)
```

S27 key 0 is `wide`, `side:"front"`, `angle:"high"` with `with:["arena.pole"]`; the pole covers **2,670 px** and is **76.6 %** visible. The cast sheet validates its own board with measured frames; the group and solo variants are selected
only when every character passes visibility, cut and per-character blocker checks. The final group/solo sheet is
`fixtures/savitri-hi/cast/cast-sheet.jpg`.

Full Adi film reference distribution after F1:

```text
frames: 83 keys, 0 error(s), 258 warning(s)
floating subjects: 7
L1 63 %, S4 63 %, S12 65 %, L16 63 %, S22 39 %, S23 20 %, S32 64 %
```

These are warnings on the untouched v1 film; pixels are unchanged.

### 3. Savitri direction and approval

- **Cast:** Yama skin `#3a3f9e`, indigo hue, contrast **2.38:1** against black ink (warning threshold 2.2), red
  attire/crown kept. The user approved the indigo sheet (`83a6a00c`).
- **Shot plan:** `fixtures/savitri-hi/shotplan.json` — **29 shots**, average **3.46 s**, 0 deterministic findings.
  Every line is covered in order; palace/hermitage/village/deer open with landmark wides; the boon conversation is
  medium/close. The user approved the plan (`5d201e3e`).
- **Board:** `fixtures/savitri-hi/board.json` — 29 shots; `board.review.json` records S23/S29/S30/S32 repaired in
  5/12/4/5 rounds; **S20 is `needsHuman`** (canopy fills 33 % in front of Yama, Savitri face 6.0 %). The user watched
  the animatic and approved it despite that recorded finding.
- **Animatic:** `fixtures/savitri-hi/animatic-qa.md` — **PASS**; 540×960, 3014 frames, **100.467 s**, voice only;
  black [], unplanned white [], frozen spans [], unexplained pops []. The user approved the animatic
  (`8ba5e86a`). `animatic.mp4` stays in `work/` (31 MB, not committed).

### 4. Commit order

```text
73a89e5 docs: phase 3C prompt
c20a63d fix(solver): screen-space over, grounded wides, validated cast sheet
1b98f4e fix(cast): Yama indigo, face-contrast warning
60ca004 feat(director): shot plan stage
6af9561 feat(director): board writer with measured repair
e0c4086 feat(director): animatic stage
12907c0 feat(fixture): direct Savitri
this commit docs: guide, pipeline and phase 3C report
```

## Cost and cache

Model calls from `work/savitri-hi/logs/calls.jsonl` after `73a89e5`:

| stage | calls | cached | prompt tokens | completion | cache hit | cache miss | cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| cast | 22 | 15 | 28,997 | 3,346 | 16,896 | 12,101 | $0.00775 |
| shotplan | 19 | 6 | 248,570 | 68,096 | 162,304 | 86,266 | $0.39067 |
| board | 0 | — | — | — | — | — | $0 |
| animatic | 0 | — | — | — | — | — | $0 |
| **total** | **41** | **21** | **277,567** | **71,442** | **179,200** | **98,367** | **$0.39842** |

The shotplan total includes failed skeleton/keys drafts and repairs. The final cast state records $0.0018; the
shotplan's final cached regeneration records 0 new calls. No voice call was made in 3C.

## Board rounds, escalations and needsHuman

| shot | rounds | result |
|---|---:|---|
| S23 | 5 | edge/head cut fixed |
| S29 | 12 | edge/head cut fixed |
| S30 | 4 | edge/head cut fixed |
| S32 | 5 | edge/head cut fixed |
| S20 | 1 | **needsHuman**: `blocker world:deer.forest canopy` 33 %, `face too small savitri` 6.0 % |

No board-model escalation occurred because the board stage did not call the model (see deviations). The board loop's
mock test does cover escalation and needsHuman. The shotplan model repairs fixed an invalid pose (`release` → catalog
`present`), short/long shot lengths (merge/hold), and jump-cut keys (30° turn); these are recorded in the plan.

## Measurements

- macOS 26.5.2, Apple M1 CPU/GPU, WebGL `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`.
- Animatic preview 540×960: 3,014 frames, 100.467 s; first full render 82.8 s, later QA/remux ~48–51 s.
- Board measured pass: 29 shots, 45 s including measured variants; shotplan model 46 s wall.
- Disk: `fixtures/savitri-hi` 5.3 MB; `docs/reports/phase-3c` 6.9 MB (29 split images + 3.6 MB sheet);
  `work/savitri-hi/animatic.mp4` 31 MB (not committed).

## Deviations from the prompt

1. **The board writer is deterministic base + measured variants, not a model staging patch.** The slim schema,
   `models.board`/`boardEscalate`, examples and guide are in place, but the model call is not wired. The approved
   animatic came from the deterministic path; S20 is honestly marked needsHuman rather than claimed clean.
2. **No persistent browser session for the board repair loop.** The full board and one-shot variant checks use the
   existing `checkFramesMeasured`, which launches Chromium per call. The prompt asked for one engine session.
3. **Animatic rendering** uses the existing segment workers and concatenates/remuxes with voice only; it does not run
   the music/SFX mix (out of scope).
4. **S20** remains a recorded needsHuman finding; the user approved the animatic with it.
5. **Shot-plan lengths** required deterministic normalization (short-shot merge, 6–8 s hold, pose aliases, jump-cut
   side turns) because the model's raw plan had a few out-of-band shots. The final plan passes every check.
6. **Entrance floor** remains 3 % (the 3B calibration), not 4 %; the guide documents why.

## Problems and open questions

- Wire the board model patch (or accept the deterministic board writer) so F4's "model writes the board shot object"
  is true, then rerun S20 with a per-shot note and re-render the animatic.
- The cast-sheet group is a wide lineup; the solo stills are medium. A tighter group/neutral mark would read better
  without changing the measured-clean contract.
- The full film has 7 floating-subject warnings under the new grounded rule; they are warnings on the untouched v1
  film, not a regression.
- The animatic loudness is −17.8 LUFS because it is voice-only; the final mix target is still −14.5 LUFS.
- The Savitri fixture uses a game-style forest clearing for the afterlife scenes because only the 8 Adi Parva set kits
  exist; new set kits remain a later phase.

## Please look at

- `fixtures/savitri-hi/animatic-qa.md` — PASS; `work/savitri-hi/animatic.mp4` — the approved cut.
- `fixtures/savitri-hi/shotplan.md` and `board.review.json` — the 29-shot plan and S20 needsHuman.
- `fixtures/savitri-hi/cast/cast-sheet.jpg` — indigo Yama.
- `docs/reports/phase-3c/sheet.jpg` and the 29 split JPGs — the directed board.
- `docs/DIRECTOR_GUIDE.md` (7.9 KB) and `prompts/director-craft.md` (2.2 KB).
