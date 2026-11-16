# Phase 2B report

## Summary

Every one of the 39 Adi Parva shots is now described by `fixtures/adi-parva/storyboard.json`; the hand-written
`engine/src/story.ts`, the compiled-in `words.json` and the legacy hybrid are deleted. Six shots that failed at the
crossfade boundaries (L23, L24, L27, L28, L29, L34) were fixed with the temporary `fableon diff` tool, including the
architect-approved D3 wheel exemption. QA now reads 214 planned events exported from the storyboard instead of a
fixture pop allowlist, and both acceptance runs (preview and final) pass with 0 unexplained pops. The old parity test
is replaced by a 39-frame golden regression (max MAD 0.101), and `npm test` is green.

## Commits

| # | Hash | Message | What / why (one line) |
|---|---|---|---|
| 0 | `e9b225f` | `docs: phase 2B prompt` | Saved the phase instructions before coding. |
| F1 | `0b265a7` | `feat(schema): contract upgrades from the 2A review` | Catalog status/defaults, shot-relative anchors, typed Ganesha params. |
| F2 | `9e958f9` | `feat(storyboard): motion building blocks` | Path, ballistic, moving targets, screen offsets, animated numbers + math tests. |
| F3 | `3286657` | `feat(fixture): port the hermitage shots` | Opening hook, L1, L3 and L36. |
| F4 | `f065331` | `feat(fixture): port the river, flowers, crane and short montage shots` | Boat, petals, crane, vows and Kunti. |
| F5 | `ef270b5` | `feat(fixture): port the deer and the gods` | Deer/sage swap, arrow, emblems, babies. |
| F6 | `7c9433f` | `feat(fixture): port the jars, the crowd and the tree` | Jars, 101 kids, crowd generator, falling kids and mangos. |
| F7 | `7a50674` | `feat(fixture): port the river poisoning, the snake kingdom and the lacquer house` | L22-L25 data; interpreter/schema blocks for F7-F9 banked here (entangled). |
| F8 | `1ccc656` | `feat(fixture): port the contest` | L26-L28 data; L28 stays legacy pending the structural diff. |
| F9 | `b073ebf` | `feat(fixture): port the homecoming, the city and the fire god` | L29-L32, L34, L35 data; the six D1 shots stay legacy. |
| G4 | `650892e` | `test(tools): fableon diff — a structural + pixel diff for one frame` | Temporary migration tool: legacy vs storyboard state/pixels/report. |
| G5 | `0fa4b32` | `fix(storyboard): crossfade evaluation` | D2, L23/L24 cast and halos, L27 star offset, L28 sparkle, L34 halo/dust. |
| G6 | `862543d` | `fix(storyboard): the remaining shots` | L27/L28/L29 fixture state; wheel/D3 code was entangled in G5. |
| F10 | `06453d4` | `feat(qa): planned events from the storyboard` | 214 planned events; fixture pop allowlist deleted. |
| F11 | `c24a267` | `refactor(engine): delete the legacy path` | Golden frames, story.ts/words.json removed, schema/runtime/CLI legacy gate removed. |
| F12 | `e2b9ffa` | `test: full-film acceptance on the storyboard-only engine` | Fresh preview and final runs both QA PASS; benchmarked. |
| F13 | this commit | `docs(report): phase 2B report` | This report. |

## Acceptance checks

### 1. Parity before F11 (all 39 shots, D3 exempted)

`npm test` at F10/G6, full-resolution 540x960 grayscale, limit 0.5; the six D1 shots have rows only after G5/G6:

```text
PASS storyboard parity: 335 frames, max MAD 0.329 (limit 0.5)
  S29          12  0.000  (D3 wheel exemption)
  S30           6  0.000  (D3 wheel exemption)
  3 frame(s) exempt: legacy wheel freeze depends on render order (architect-approved, Phase 2B)
```

| # | shot | F9 (frames / max MAD) | final parity (frames / max MAD) |
|---|---|---|---|
| 1 | S1 | 8 / 0.000 | 8 / 0.000 |
| 2 | L1 | 12 / 0.000 | 12 / 0.000 |
| 3 | L2 | 8 / 0.000 | 8 / 0.000 |
| 4 | S4 | 10 / 0.315 | 10 / 0.315 |
| 5 | S5 | 8 / 0.020 | 8 / 0.020 |
| 6 | L5 | 4 / 0.000 | 4 / 0.000 |
| 7 | L6 | 8 / 0.000 | 8 / 0.000 |
| 8 | L7 | 8 / 0.000 | 8 / 0.000 |
| 9 | L8 | 7 / 0.000 | 7 / 0.000 |
| 10 | S10 | 5 / 0.000 | 5 / 0.000 |
| 11 | L10 | 8 / 0.000 | 8 / 0.000 |
| 12 | S12 | 6 / 0.000 | 6 / 0.000 |
| 13 | L12 | 8 / 0.000 | 8 / 0.000 |
| 14 | S14 | 12 / 0.000 | 12 / 0.000 |
| 15 | L14 | 10 / 0.000 | 10 / 0.000 |
| 16 | S16 | 12 / 0.000 | 12 / 0.000 |
| 17 | L16 | 7 / 0.000 | 7 / 0.000 |
| 18 | S18 | 11 / 0.000 | 11 / 0.000 |
| 19 | S19 | 10 / 0.002 | 10 / 0.002 |
| 20 | S20 | 6 / 0.000 | 6 / 0.000 |
| 21 | S21 | 8 / 0.000 | 8 / 0.000 |
| 22 | S22 | 13 / 0.259 | 13 / 0.259 |
| 23 | S23 | 10 / 0.000 | 10 / 0.247 |
| 24 | S24 (L23) | legacy | 12 / 0.000 |
| 25 | S25 (L24) | legacy | 6 / 0.000 |
| 26 | S26 | 12 / 0.003 | 12 / 0.003 |
| 27 | S27 | 8 / 0.006 | 8 / 0.006 |
| 28 | S28 (L27) | legacy | 7 / 0.000 |
| 29 | S29 (L28) | legacy | 12 / 0.000 (D3 exempt range) |
| 30 | S30 (L29) | legacy | 6 / 0.000 (D3 exempt range) |
| 31 | S31 | 8 / 0.000 | 8 / 0.000 |
| 32 | S32 | 8 / 0.000 | 8 / 0.000 |
| 33 | S33 | 10 / 0.006 | 10 / 0.006 |
| 34 | S34 | 4 / 0.000 | 4 / 0.000 |
| 35 | S35 | 4 / 0.000 | 4 / 0.000 |
| 36 | S36 | 6 / 0.000 | 6 / 0.000 |
| 37 | S37 (L34) | legacy | 10 / 0.329 |
| 38 | S38 | 10 / 0.058 | 10 / 0.182 |
| 39 | S39 | 13 / 0.000 | 13 / 0.000 |

**PASS.** The six rows marked `legacy` are the architect's D1 shots; their final max is within 0.5 after G5/G6.

### 2. `npm test` after F11 (golden frames replace parity)

```text
PASS typecheck
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
PASS validator (5/5)
PASS shot starts: 39 resolved
PASS shot starts  39 anchors resolve to the old frames
PASS motion math (9/9)
PASS golden frames  39 shot midpoints, max 0.101 <= 1
all checks passed
```

Golden table (storyboard render at 270x480, JPEG 92, MAD limit 1.0):

| shot | frame | MAD | shot | frame | MAD | shot | frame | MAD |
|---|---:|---:|---|---:|---:|---|---:|---:|
| 01 | 44 | 0.000 | 14 | 1278 | 0.000 | 27 | 2592 | 0.000 |
| 02 | 146 | 0.000 | 15 | 1386 | 0.000 | 28 | 2704 | 0.000 |
| 03 | 249 | 0.000 | 16 | 1491 | 0.000 | 29 | 2766 | 0.000 |
| 04 | 357 | 0.000 | 17 | 1570 | 0.000 | 30 | 2829 | 0.000 |
| 05 | 465 | 0.002 | 18 | 1659 | 0.000 | 31 | 2889 | 0.000 |
| 06 | 540 | 0.000 | 19 | 1780 | 0.000 | 32 | 2958 | 0.000 |
| 07 | 620 | 0.000 | 20 | 1876 | 0.000 | 33 | 3051 | 0.006 |
| 08 | 723 | 0.000 | 21 | 1947 | 0.000 | 34 | 3114 | 0.000 |
| 09 | 799 | 0.000 | 22 | 2029 | 0.101 | 35 | 3135 | 0.000 |
| 10 | 876 | 0.000 | 23 | 2130 | 0.000 | 36 | 3191 | 0.000 |
| 11 | 979 | 0.000 | 24 | 2239 | 0.000 | 37 | 3288 | 0.000 |
| 12 | 1066 | 0.000 | 25 | 2346 | 0.000 | 38 | 3409 | 0.000 |
| 13 | 1162 | 0.000 | 26 | 2453 | 0.000 | 39 | 3559 | 0.000 |

### 3. Storyboard-only engine

```text
$ npx fableon validate --project fixtures/adi-parva
validate: OK (39 shots, 71 cast ids) — …/fixtures/adi-parva/storyboard.json

$ grep -rn "from ['\"].*story['\"]" engine/src engine/scripts
story.ts not imported

$ grep -c '"legacy"' fixtures/adi-parva/storyboard.json schema/storyboard.schema.json
0
0
```

A project without `storyboard.json` now fails clearly instead of falling back to a compiled timeline:

```text
$ node engine/scripts/render.cjs stills --out work/noproj/f_ --frames 60 --size 270x480 --msaa 0
Error: engine build error: project has no storyboard.json (run: fableon init <name> --from fixtures/adi-parva)
```

### 4. Full-film acceptance (fresh `fableon init`, no allowlist)

Preview:

```text
$ npx fableon all --project work/adi --quality preview --workers 2
SPECS 540x960 30/1 fps, 3639 frames, 121.300 s; audio: aac 48000 Hz 2ch
LOUDNESS I:         -14.5 LUFS | LRA:         1.6 LU | Peak:       -1.3 dBFS
SILENCES none
FRAMES 3639; black []; unplanned white []; frozen spans >=12f []
planned events ignored (±1 frame): 214 frames from events.json
pops reported by QA: 141, 165, 250, 395, 486, 717, 876, 1247, 1249, 1277, 1323, 1470, 1701, 1754, 1893, 2027, 2129, 2152, 2227, 2265, 2373, 2424, 2458, 2603, 2640, 2703, 2715, 2780, 2825, 2954, 3307, 3379, 3453, 3559, 3607
unexplained pops: none
Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
real 148.26
```

Final:

```text
$ npx fableon all --project work/adi-final --quality final --workers 2
SPECS 1440x2560 30/1 fps, 3639 frames, 121.300 s; audio: aac 48000 Hz 2ch
LOUDNESS I:         -14.5 LUFS | LRA:         1.6 LU | Peak:       -1.3 dBFS
SILENCES none
FRAMES 3639; black []; unplanned white []; frozen spans >=12f []
planned events ignored (±1 frame): 214 frames from events.json
pops reported by QA: 141, 165, 250, 395, 486, 717, 876, 1247, 1249, 1277, 1323, 1470, 1701, 1754, 1893, 2027, 2129, 2152, 2227, 2265, 2373, 2424, 2458, 2603, 2640, 2703, 2715, 2780, 2825, 2954, 3307, 3379, 3453, 3559, 3607
unexplained pops: none
Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
real 853.84
```

Both runs report exactly the same QA spike list; every spike is within ±1 of a planned event. **PASS.**

## Root causes and fixes for the six shots

The phase's L numbers are narration-line anchors; the equivalent storyboard shot ids are shown for reference.

| shot | storyboard id / frames | Root cause found with `fableon diff` | Fix |
|---|---|---|---|
| L23 | S24, 2181-2298 | End of the naga shot is the crossfade into L24: the incoming lacquer walk-in was drawn with `priestBro0..4` specs, while the legacy shot uses the ordinary adult cast. Pre-D2 logic also skipped incoming content before the shot start. | D2: evaluate every drawn layer; L24 walk-in uses `adult0..4`. |
| L24 | S25, 2298-2395 | Same walk-in cast mismatch; the two lamp halos were anchored at the cut, so they popped in only at the shot start instead of glowing through the incoming crossfade (`offset 0` vs legacy `-10`). | `adult0..4`; halos `{ shot: true, offset: -10 }`. |
| L27 | S28, 2673-2735 | Stars at the flat king's head used the camera's full right vector including its y component (`fx[1].y: legacy 2.4 vs storyboard 2.382`), and the star phase ran from `at` while drawing starts at `from` two frames earlier. | Horizontal right `(x, 0, z)`; phase `(f - at)` with draw window starting at `from`. |
| L28 | S29, 2735-2798 | Bowstring sparkle is a fixed glow from `at` to `until`: the interpreter popped it, emitted it before `at` on the incoming crossfade (`fx.length` and `fx[1].ch` diffs), and drew a `cut` card instead of `glow`. The wheel also kept the previous frame's angle. | `static: true`, `card: "glow"`, `f < at` gate; deterministic wheel stop. |
| L29 | S30, 2798-2861 | Incoming crossfade includes the frozen wheel; legacy froze to whatever the previous rendered frame left (`dyn.wheel: 0`) while the storyboard computed the stop angle (`204.16`) at 2797-2799. | D3 deterministic stop at `stop/30 * spin`; approved exemption for the frozen/crossfade range. |
| L34 | S37, 3237-3340 | The next shot's fire halo was emitted before its `at` anchor (diff showed an extra halo in the incoming layer), and all six city dust puffs started on the same frame and advanced in frame counts, while legacy staggers them in seconds (`fx[8..12]` size/position diffs). | Halo `f < at` gate; dust duration in seconds plus per-instance `delay`; all six anchored at `city`. |

Supporting report excerpts (from the G5/G6 runs; `fableon diff` was removed in F11):

```text
frame 2703: states[0].fx[1].y: legacy=2.4 storyboard=2.382147571961429
frame 2735: states[0].fx.length: legacy=1 storyboard=2
frame 2762: states[0].fx[1].ch: legacy=256 storyboard=500
frame 2797: states[0].dyn.wheel: legacy=0 storyboard=204.16
frame 3339: states[0].fx[10].h: legacy=3.4305555555555594 storyboard=3.5
```

## D3 exemption

The legacy wheel keeps the rotation left by the previously rendered frame after `A(28,"mark")+2`; its output is
render-order dependent. The storyboard version freezes at the spin angle of the stop frame
`(stopFrame / 30) * spin`. The parity test exempted this exact set:

```text
2784, 2785, 2786, 2787, 2788, 2789, 2790, 2791, 2792, 2793, 2794,
2795, 2796, 2797, 2798, 2799, 2800, 2801, 2802, 2803
```

Reason string: `legacy wheel freeze depends on render order (architect-approved, Phase 2B)`.

Once L34 was fixed, the only sampled frames still over 0.5 were in the D3 range: 2797 (15.20), 2798 (12.71) and
2799 (10.31). All other sampled frames of S29 and S30 are at 0.000. `shot_29.jpg` and `shot_30.jpg` in the golden set were rendered
from storyboard mode for this reason; every other golden frame came from legacy mode.

## Measurements

- Machine: Apple M1 (8-core CPU / 8-core GPU, 8 GB), macOS 26.5 (Darwin 25.5.0), Node 25.9.0.
- WebGL: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` in both runs.
- Preview: 148.26 s total, 0.041 s/frame wall; 48 MB `final.mp4`, 316 MB project folder.
- Final: 853.84 s total, 0.235 s/frame wall; 175 MB `final.mp4`, 678 MB project folder.
- Golden test: 39 stills at 270x480, max MAD 0.101; reference stills max MAD 1.809.

## Building blocks (final list)

- **Anchors**: word / nth / offset, `shot`, `frame`, `end`, and the inclusive `offset:+1` replacement for strict `f > A()`.
- **Point**: absolute or place-relative, moving-target-relative (`{"at": id}`), plus screen-relative right/up/forward metres.
- **Path motion**: keyed points with linear/smooth/glide/step easing, optional walk phase and bob.
- **Ballistic motion**: gravity, optional floor, spin and start delay; effects and actors share it.
- **Moving target ids**: actors, effects and the boat can be followed by points and camera keys.
- **Animated numbers**: keyed values clamped outside their range (belly, pages, city growth).
- **Camera keys**: fixed, dolly (push/punch) and tilt, with cut or glide between keys.
- **Impact kicks**: frame-anchored camera shakes applied after the camera key.
- **DOF ramps**: `cInf` and focus changes anchored to words.
- **Actor appearance**: cast spec + seed, mirror, scale, yaw, pose/expr/prop, seated, talk cycle, appear pop and visibility windows.
- **Actor beats**: timed field overrides, with `jump` to mark intended QA discontinuities.
- **Specials**: ganesha, agni, deer, naga, baby, pot, flat, each with typed params.
- **Crowd generator**: deterministic hash variation, grid or explicit points, first-member override, pose/expr/scale.
- **Sparkle**: star card with count/offsets, pop stagger, twinkle, static mode and card kind.
- **Halo**: soft glow card with pop, colour, peak, visibility and card kind (soft/glow/fire).
- **Knot / heart / puff / stars / emblem**: small unlit cards with legacy timing.
- **Arrow**: from/to points or stuck card over an anchor window.
- **Splash / bubbles / burst / fire / smoke / dust**: impact and ambience cards, with per-instance hash variation.
- **Petals / mango / sweat / lump / pigeon**: remaining legacy effect cards, pigeon ballistic.
- **Pages set piece**: animated palm-leaf stack height.
- **Boat set piece**: path/ballistic motion, yaw and roll bob; followable.
- **Jars set piece**: grid, partial appearance, lid pops, kid rise with per-index overrides and cull distance.
- **Wheel set piece**: spin rate with deterministic anchor stop.
- **City set piece**: glide rise between anchors.
- **Laddu plate / nectar / big bow**: visibility, position/scale, disappearing pots, impact wobble.
- **Crossfade**: light-change blend that evaluates both shots on every drawn frame (D2).
- **Planned events export**: camera cuts plus intended jumps (appear/visibility/beats/big-bow snap) for QA.

## Storyboard size

`fixtures/adi-parva/storyboard.json`: **680,366 bytes (664 KiB), 31,136 lines**, 39 shots, 71 referenced cast ids.
`fixtures/adi-parva/golden/`: 39 JPEGs, 1.2 MB total.

## Awkward to express (input for Phase 2C)

- **Screen-right is not horizontal.** The camera's right vector has a y component; a screen offset must flatten it
  to `(x, 0, z)` or stars drift. The contract should say "right" is horizontal.
- **Two anchors per effect.** Stars phase from `A(word)` but appear from `K(word)` = `A-2`; sparkle/halo need an
  explicit `f >= at` gate. A single `visible`/`phase` pair would be clearer.
- **Static legacy cards.** The bowstring glow is not a pop; it needed `static` and `card: "glow"`. A `glow` effect
  kind would remove two flags.
- **Frame-vs-second units.** Dust used a 36-frame window and per-frame offsets; legacy uses seconds and staggered
  delays. Units are easy to mix; the schema should standardise on seconds for time and frames only for anchors.
- **Render-order dependence.** The wheel freeze cannot be expressed as a pure function; D3 needed an approved
  exemption. Any future stateful legacy behaviour needs an explicit deterministic rule before porting.
- **Halo visibility during crossfade.** `at` and `visible.from/to` interact; a halo must appear exactly when legacy
  starts drawing it, not at the cut.
- **Fixture-specific attachment points.** The flat king's stars and Arjuna's bowstring sparkle are hand-tuned screen
  offsets. Phase 2C needs semantic attachments ("head", "bowstring") rather than numbers.
- **Implied cast roles.** The lacquer walk-in uses `adult0..4`, not `priestBro0..4`; the storyboard has no notion of
  "ordinary adult" yet. A role alias would avoid hard-coded cast ids.
- **Manual jump marking.** `jump: true` is still written by hand for special swaps; the exporter infers appear,
  visibility, beats and big-bow snaps. Automatic diffing of adjacent frames would remove the manual step.
- **Structural diff noise.** `fableon diff` had to ignore texture-pool cache keys and compare floats with 1e-6;
  structural state is not purely visual state. A future semantic diff should compare resolved stage state only.
- **Hand-tuned volume.** 664 KiB / 31k lines for 121 s is mostly explicit numbers; Phase 2C's semantic cameras and
  framing solver are the intended compression.

## Problems and open questions

- The final run is 853.8 s versus 626.8 s in Phase 2A. All 39 shots now run through the storyboard interpreter and the
  machine was shared with other work; output and QA are unchanged. No action taken.
- `fableon diff` and its `DEBUG_STATE`/`state` hooks were removed in F11 because their legacy half no longer exists.
  If the architect wants a permanent structural diff, it should be a storyboard-vs-storyboard tool.
- The D3 exemption list lived in the temporary parity test; after F11 the parity test itself is deleted, so the
  exemption is now documented here and in the phase decision record only. The golden test has no exemption.

## Please look at

- `fixtures/adi-parva/storyboard.json` — the only timeline for the film.
- `fixtures/adi-parva/golden/` — 39 regression frames (`shot_29.jpg`/`shot_30.jpg` are storyboard-sourced per D3).
- `work/adi/final.mp4` (preview) and `work/adi-final/final.mp4` (final).
- `work/adi/qa/summary.md` and `work/adi-final/qa/summary.md` — full QA tables and contact sheets.
- `engine/src/storyboard/build.ts` — interpreter, including the D2 crossfade and D3 wheel rules.
- `tests/golden.mjs` / `tests/compare_golden.py` — new regression gate.
