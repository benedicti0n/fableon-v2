# Phase 2A report

## Summary

The engine now loads a project's `words.json` and `storyboard.json` at runtime and builds the same `ShotDef[]` that
`story.ts` used to hard-code. Ten fixture shots (L1, L2, L5, L6, L7, L8, L10, L12, L14, L16) are fully described in
JSON and proven pixel-identical to the hand-written timeline; the other 29 stay on the legacy path. A new
`fableon validate` checks schema, catalog, word anchors and time order, the CLI validates before rendering, and
`npm test` now includes an 80-frame per-shot parity table (max MAD **0.000**) plus four validator cases. The full
fixture also rendered at final quality: 1440x2560, 3639 frames, 121.3 s, QA PASS.

## Commits

| # | Hash | Message | What / why (one line) |
|---|---|---|---|
| 0 | `eefdf91` | `docs: storyboard v1 contract, phase 2A prompt, roadmap update` | Saved the contract, phase prompt and roadmap before coding. |
| F1 | `bacda42` | `refactor(engine): runtime catalog lists` | POSES/PROPS/SPECIALS/EXPRS/LIGHTS_NAMES/PLACES exported; types derived from arrays. |
| F2 | `a9fae4c` | `feat(schema): storyboard JSON Schema v1 and catalog export` | 2020-12 schema + `export-catalog.mjs` → `schema/catalog.json`. |
| F3 | `4b47e3a` | `feat(cli): fableon validate` | Ajv 2020-12 + catalog/word-anchor/order checks with JSON paths. |
| F4 | `c89b2d8` | `feat(engine): load the project at runtime` | `render.cjs --project` serves `/project/`; page fetches words/storyboard before building. |
| F5 | `d9c0f86` | `refactor(engine): shared timing, camera and Ganesha helpers` | Moved math/anchors/kicks/special/shot wrapper into `engine/src/core/`. |
| F6 | `bb908cc` | `feat(engine): storyboard interpreter with legacy hybrid` | Builds cameras, DOF, kicks, actors, effects, set pieces; legacy shots reuse story.ts. |
| F7 | `64d8936` | `feat(fixture): Adi Parva storyboard, 10 shots ported` | 39 shots, starts/lights/sets/sun, all 21 kicks, 28 cast ids, 10 non-legacy. |
| F8 | `fbc9b3a` | `test: storyboard parity and validator tests` | Parity 80 frames ≤0.5 full-res; 3 broken copies fail as expected; wired into `npm test`. |
| F9 | `11d42d9` | `feat(cli): storyboard-aware pipeline and final-quality run` | Validate before shots/stills/render/all; legacy-words gate; final run + benchmarks. |
| F10 | this commit | `docs(report): phase 2a report` | This report. |

## Acceptance checks

### 1. `npm test`

```text
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS validator (4/4)
  PASS fixture passes
  PASS unknown pose — /shots/1/actors/0/pose: unknown pose "banana"
  PASS word not in line — /shots/0/start: no word 0:zzzz in words.json
  PASS decreasing shot starts — /shots/2/start: shot start 0 is not after the previous start 88
PASS storyboard parity: 80 frames, max MAD 0.000 (limit 0.5)

  shot    frames  max MAD
  L1          12  0.000
  L2           8  0.000
  L5           4  0.000
  L6           8  0.000
  L7           8  0.000
  L8           7  0.000
  L10          8  0.000
  L12          8  0.000
  L14         10  0.000
  L16          7  0.000
```

Full-resolution 540x960 grayscale comparison; each shot includes start, start+1, middle, end-1, every camera-key /
beat / effect anchor (plus the next frame), capped at 12. **PASS.** (L5's camera-key/beat/DOF anchors all coincide with
its start, so the four required base frames are the complete set.)

### 2. `fableon validate` and preview rebuild

```text
$ npx fableon validate --project work/adi
validate: OK (39 shots, 28 cast ids) — …/work/adi/storyboard.json

$ npx fableon all --project work/adi --quality preview --workers 2
… SPECS 540x960 30/1 fps, 3639 frames, 121.300 s; audio: aac 48000 Hz 2ch
… LOUDNESS I: -14.5 LUFS | LRA: 1.6 LU | Peak: -1.3 dBFS
… FRAMES 3639; black []; unplanned white []; frozen spans >=12f []
… known intended pops (fixture): 1249, 2152, 2715
… unexplained pops: none
… Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
real 186.52
```

The preview QA summary is identical to Phase 1. **PASS.**

### 3. Final-quality film

```text
$ ffprobe -v error -show_entries stream=width,height,nb_frames,r_frame_rate:format=duration,size …/work/adi-final/final.mp4
stream|width=1440|height=2560|r_frame_rate=30/1|nb_frames=3639|
stream|r_frame_rate=0/0|nb_frames=5686
format|duration=121.299674|size=183027540

QA: SPECS 1440x2560 30/1 fps, 3639 frames, 121.300 s; aac 48000 Hz 2ch
    black []; unplanned white []; frozen spans >=12f []
    known intended pops (fixture): 1249, 2152, 2715; unexplained pops: none
    Verdict: PASS
```

**PASS.**

### 4. Commit order

`git log --oneline` (newest first): `11d42d9`, `fbc9b3a`, `64d8936`, `bb908cc`, `d9c0f86`, `c89b2d8`, `4b47e3a`,
`a9fae4c`, `bacda42`, `eefdf91` — the Step 0 docs commit followed by F1–F10 in order. **PASS.**

## Measurements

- Machine: Apple M1 8-core / 8 GB, macOS 26.5. WebGL `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified
  Version)`.
- Preview storyboard rebuild: 186.5 s wall (render stage 55 s), 50 MB `final.mp4`, QA PASS.
- Final-quality rebuild: **626.8 s** wall with 2 workers (render stage 520 s = 0.143 s/frame wall, ~0.286 s/frame/
  worker), peak summed RSS ~1.1 GB sampled, `final.mp4` 183 MB, project folder 685 MB (clips 349 MB, audio 133 MB,
  QA 21 MB). 1440x2560, 3639 frames, 121.300 s.
- Parity: 80 frames, 10 shots, maximum full-resolution grayscale MAD **0.000** (limit 0.5).
- Validator: fixture pass + three expected failures.

## Deviations from the prompt

1. **The hook shot (frame 0) stays legacy.** The prompt's "L1 (dictation + condition)" is the shot that starts at
   `K(1, "Vyasa")` (frame 88); the prototype's opening hook is a separate first shot. The 10 named shots are the ones
   ported, so shot 1 remains `"legacy": true`.
2. **Shot starts use `{"frame": …}` instead of word anchors.** This guarantees exact equality with story.ts's sorted
   starts during migration. All in-shot events (camera keys, beats, effects, kicks, flash) are word-anchored.
3. **Added `engine/src/core/shotlist.ts`** (not in the prompt's "e.g." list) so the per-shot dynamic-piece wrapper,
   crossfade rule, layer lookup and DOF ramp are shared with story.ts rather than duplicated.
4. **`path` is not in the 2A schema** although `docs/STORYBOARD_SCHEMA.md` describes it: paths/walks are a 2B feature
   and the interpreter would silently mis-render them. The schema currently implements only what 2A executes.
5. **Maps and special params are the only open objects.** Fixed objects use `additionalProperties: false`; `points`,
   `cast` and the special `params` bag necessarily use additionalProperties schemas/open objects.
6. **The preview acceptance run took 186.5 s**, not the Phase 1 129 s; the render stage is still ~55 s. The extra time
   is storyboard validation plus a less warm machine/cache in this run; the pixels and QA summary are unchanged.
7. **The parity test caps at 12 frames per shot as specified**, so some later anchors in a dense shot are not rendered;
   the included table lists the exact frame count used per shot.
8. **`fableon init` needed no code change** for storyboard copying: it already copies all fixture inputs except derived
   folders, so `storyboard.json` came along automatically.

## Problems and open questions

- **Schema lists specials the interpreter does not implement yet** (`agni`, `deer`, `naga`, `baby`, `pot`, `flat`).
  `fableon validate` accepts them (they are catalog names) but rendering throws “not implemented in Phase 2A”. Should
  the 2A validator reject them until 2B, or is a runtime error acceptable?
- **Time-based behaviour has no first-class representation.** L1's growing palm-leaf stack is expressed as linear
  absolute-frame keys; re-voicing would not shift that ramp. L2's `writeT(t)` uses an untyped `params.writeRate`
  convention. A `time`-based animated number or a typed Ganesha action would remove both hacks.
- **Strict `>` boundaries need an offset hack.** Story code uses `f > A(...)`; anchors are inclusive, so the L1
  expression beat is written as offset +1.
- **Ganesha params are unvalidated:** `write`, `writeRate`, `look`, `down`, `puzzled`, `ear`, `pen` are an open bag
  the schema cannot describe. A typed `special: "ganesha"` params schema is needed for model use.
- **Camera/light defaults live in code:** the hermitage `sun` 115/18 rule and the `pages` 0.3 default are interpreter
  rules, not schema-visible defaults.
- **The legacy hybrid needs the compiled timeline.** Enforced by the CLI gate; a storyboard with legacy shots and
  different `words.json` stops with a clear error. The 29 legacy descriptors duplicate starts/lights/sets.
- **The final-quality QA still uses the Phase 1 three-pop allowlist** (1249, 2152, 2715); 2B's planned-event export
  should remove it.
- **`buildStoryboard` imports story.ts for the legacy lookup**, so a fully ported custom storyboard still carries the
  prototype timeline in the bundle until 2B deletes the path.
- **Peak memory is a sampled sum of RSS**, not exact accounting; the two 2K Chromium workers peaked around 1.1 GB by
  this measure and completed on the 8 GB machine.
- Chromium still logs the pre-existing `GL_INVALID_OPERATION: glDrawArrays` feedback warning; pixels are unaffected
  and the parity test proves it.

## Please look at

- `work/adi-final/final.mp4` — the 1440x2560 film; `work/adi/final.mp4` is the preview rebuild (both gitignored).
- `work/adi-final/qa/summary.md`, `work/adi-final/qa/sheet_*.jpg` and the preview equivalents.
- `fixtures/adi-parva/storyboard.json` — the 10 ported shots and 29 legacy stubs.
- `schema/storyboard.schema.json` + `schema/catalog.json` — the v1 contract; check whether the missing `path` is
  acceptable for 2A.
- `tests/parity.mjs` + `tests/validator.mjs` — parity frame selection and expected validator messages.
