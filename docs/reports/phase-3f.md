# Phase 3F report

## Summary

Both films now carry a world-only mood rig: a directional key, sky/fill tint, sun disc and halo, shafts, clean
multi-scale halation, a mood grade, and a depth-aware soft character mask that keeps every one of those effects off the
flat-lit characters. The measured look check is calibrated on the Adi world pixels and runs per scene. The pipeline
fixes (approved lock, voice-aware budget, cast places, clean, foreground allocator) are in, both animatics and both
1440×2560 finals are PASS, and the final QA no longer reports planned board punches as pops.

## Commits

| # | Hash | Message | What / why |
|---|---|---|---|
| 0 | `39e55bc` | `docs: phase 3F prompt` | The phase brief. |
| F1 | `e29b86d` | `feat(engine): glow and light rig (opt-in)` | Per-shot `look` block, mood rigs, sun/haze/shafts, halation, grade. |
| F2 | `cfcb025` | `feat(director): mood-based lighting design + look-dev sheet` | Mood choice per scene and the look-dev pages. |
| F3 | `848e57a` | `feat(qa): measured look check` | World-only split/glow/luma/face metrics and the target table. |
| F4 | `53df79a` | `fix(pipeline): approved lock, voice-aware budget, cast places, disk cleanup` | Approved stages read-only, delivered-rate budget, places never cast, `fableon clean`. |
| F5 | `d609ca1` | `fix(look): characters stay flat-lit` | Removed rim/glow/grade from the cards; eye rings off. |
| F5 | `bfbc3c6` | `fix(look): depth-aware soft character mask, clean glow` | 2× soft alpha mask against world depth, source/output masking, clean multi-scale glow, foreground allocator. |
| F5 | `d97279f` | `fix(qa): subtract board punches and cuts from final QA` | Final `short_qa` now ignores planned punches/kicks/cuts. |
| F5 | `ca2aecd` | `test(qa): check the solid mask interior` | Excludes the 1 px soft/SMAA edge; 188k interior pixels show 0/255. |
| F2 | `0fef03e` | `feat(lookdev): paginate multi-scene sheets` | Look-dev pages at 3 scenes each, ≤1600 px tall. |
| F5 | `7d85d6e` | `feat(fixture): re-light Savitri and Bakasura, final QA` | Updated fixtures, look QA, animatic/final QA and review images. |
| F6 | `1b1fbef` | `docs(director): light and look guidance` | Mood table, flat-lit rule, look-check/foreground rules in the guide and craft prompt. |
| F6 | `37db457` | `docs(roadmap): phase 3F done, phase 4 next` | Backend API next; UI stages 5–6; SFX/bake-offs/whip pans later. |
| F6 | this commit | `docs(report): phase 3F report` | This report. |

## Acceptance checks

**1. npm test green, golden <= 1.0, Adi audio unchanged.**

```
PASS glow mask 5/5 checks
PASS glow disc 5/5 checks
PASS foreground allocator 3/3 checks
PASS depth mask 5/5 checks
PASS look rules 6/6 checks
PASS look QA 5/5 checks
PASS approved lock 5/5 checks
PASS clean 4/4 checks
PASS voice-aware budget 3/3 checks
PASS cast places 4/4 checks
PASS authoring 24/24 checks
PASS golden frames 39 shot midpoints, max 0.107 <= 1
all checks passed
```

Legacy frame 120 is bit-identical:

```
029b784d82c1b7b2183d8160ba9f22be7a57b1334188d4e2e3e0c235ddcbae21  head120_120.png
029b784d82c1b7b2183d8160ba9f22be7a57b1334188d4e2e3e0c235ddcbae21  final2_120.png
```

The Adi audio is untouched; no TTS calls were made in this phase.

**2. Moods and measured look targets.**

The user's choices: Savitri palace/hermitage/village **warm-side**, deer-golden/village-golden **dusk**, deer-night
**night-moon**; Bakasura opening/hermitage **golden-glow**, aftermath **dusk**. The final world-only table:

| film | scene | mood | split | glow | mean | std | p2 | p98 | face | issues |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Savitri | palace-day | warm-side | 0.26 | 0.0% | 0.55 | 0.14 | 0.19 | 0.80 | 0.44 | ok |
| Savitri | hermitage-day | warm-side | 0.68 | 0.0% | 0.34 | 0.22 | 0.09 | 0.80 | 0.40 | ok |
| Savitri | village-day | warm-side | 0.41 | 3.3% | 0.48 | 0.17 | 0.15 | 0.94 | 0.39 | ok |
| Savitri | deer-golden | dusk | 0.64 | 0.0% | 0.26 | 0.18 | 0.07 | 0.67 | 0.17 | p98 0.67 vs 0.70 |
| Savitri | village-golden | dusk | 0.55 | 0.6% | 0.40 | 0.18 | 0.18 | 0.84 | 0.17 | face 0.17 vs 0.40 |
| Savitri | deer-night | night-moon | 0.05 | 0.0% | 0.28 | 0.09 | 0.11 | 0.45 | 0.44 | ok |
| Bakasura | village-day | golden-glow | 0.64 | 0.0% | 0.42 | 0.13 | 0.16 | 0.76 | 0.45 | std 0.13 vs 0.14 |
| Bakasura | hermitage-day | golden-glow | 0.74 | 0.3% | 0.40 | 0.20 | 0.14 | 0.82 | 0.10 | face 0.10 vs 0.40 |
| Bakasura | village-day (aft) | dusk | 0.53 | 0.2% | 0.34 | 0.15 | 0.10 | 0.74 | 0.47 | ok |

Calibration (world pixels outside the char mask) lives in `cli/src/look.js` and `tools/qa/look_qa.py`; the Adi
measurements that set the floors are in the code comment (golden split 0.69/glow 0/mean 0.39/std 0.17/p2 0.17/p98 0.76;
day split −0.19/0.1%/0.54/0.14/0.27/0.87; night split −0.23/0/0.15/0.07/0.08/0.27). Targets:

| mood | split | glow | mean | std | p2 | p98 |
|---|---:|---:|---:|---:|---:|---:|
| warm-side | >=0.05 | 0–6% | 0.30–0.65 | 0.12–0.30 | 0.05–0.35 | 0.70–1.0 |
| golden-glow | >=0.35 | 0–6% | 0.32–0.55 | 0.14–0.30 | 0.05–0.25 | 0.75–1.0 |
| dusk | >=0.35 | 0–6% | 0.25–0.52 | 0.12–0.30 | 0.03–0.20 | 0.70–1.0 |
| night-moon | >=0.03 | 0–2% | 0.12–0.40 | 0.07–0.22 | 0.02–0.15 | 0.25–0.80 |
| noon | >=0.05 | 0–4% | 0.35–0.65 | 0.12–0.30 | 0.04–0.30 | 0.75–1.0 |

The four warnings are explained, not hidden: the Savitri deer-golden wide forest sits 0.03 under the dusk p98 floor
because the frame is mostly deep-blue canopy; the Savitri village-golden face is Yama's blue skin (0.17) against a dusk
frame; Bakasura's village-day std is 0.13 (0.01 under the floor) because the golden-glow shot is deliberately soft;
Bakasura's hermitage face is 0.10 because he is a dark-skinned demon and eye rings are off by user choice. Fixing the
faces by lightening skin is forbidden; the alternative is a stronger eye/mouth feature rim (`project.look.featureRim`).

Before/after this fix (previous look animatic vs final, same world-only metric):

| scene | previous | final |
|---|---|---|
| Savitri palace-day | 0.09 split / 0.6% glow / 0.62 mean / 0.41 face | 0.26 / 0.0% / 0.55 / 0.44 |
| Savitri hermitage-day | 0.68 / 1.3% / 0.38 / 0.36 | 0.68 / 0.0% / 0.34 / 0.40 |
| Bakasura village-day | 0.57 / 1.5% / 0.55 / 0.53 | 0.64 / 0.0% / 0.42 / 0.45 |
| Bakasura hermitage-day | 0.81 / 2.0% / 0.42 / 0.12 | 0.74 / 0.3% / 0.40 / 0.10 |

The previous-look rows are the old animatic's measured table; the cleanup removed the old halation's broad glow share
and brought the palace split up. The flat pre-look Bakasura baseline was split 0.12–0.21, glow 0.1–4%, mean 0.57–0.59
in daylight and 0.29 in the close-up; the final is split 0.50–0.74, mean 0.34–0.42. Savitri's flat baseline was the
phase 3D/3E noon/blue-water film; the final world table above is the measurable after.

**3. Animatics and finals.**

| film | animatic | QA | final | QA |
|---|---|---|---|---|
| Savitri | 540×960, 2696 f, 89.931 s | PASS, 0 black/white/frozen/pops | 1440×2560, 2663 f, 88.765 s, 122 MB | PASS, 0 black/white/frozen/unexplained pops, voice pass |
| Bakasura | 540×960, 1992 f, 66.400 s | PASS, 0 black/white/frozen/pops | 1440×2560, 1958 f, 65.267 s, 97 MB | PASS, 0 black/white/frozen/unexplained pops, voice pass |

Both look checks are on `final.mp4` (the tables above); the animatic tables are in `work/*/look-qa.md` and the fixtures.
User ratings carried from 3D/3E: Savitri 8/10, Bakasura 9/10; the Phase 3F look sheets were approved before the finals
(“its perfect, proceed”).

**4. Free disk.**

`fableon clean` dry run: 14.98 GB free. After the real clean: 15.10 GB (Savitri) / 15.21 GB (Bakasura). The two finals
and their segments used about 1.2 GB; **~13.9 GB free** now, well above the 5 GB floor. Project folders: Savitri 752 MB,
Bakasura 459 MB.

## Measurements

- macOS 26.5.2 (25F84), Apple M1, 8-core CPU / 7-core GPU, Metal 4; WebGL `ANGLE (Apple, ANGLE Metal Renderer: Apple
  M1, Unspecified Version)`.
- Preview animatic stage: Savitri **93.5 s**, Bakasura **81.2 s** (2 workers, 540×960, MSAA 0 + SMAA).
- Final render: Savitri 2663 frames, slowest shots **0.49 s/frame**, ~8 min wall; Bakasura 1958 frames, **0.53 s/frame**,
  ~7 min wall (2 workers, 1440×2560, MSAA 0 + SMAA). Fast shots are 0.17–0.21 s/frame.
- Finishing per film: audio mix/assemble/short_qa/lookcheck adds ~1–2 min. Output sizes: 122 MB / 97 MB.
- Phase 3F provider cost since 2026-11-18 (includes the `work/fgprobe` and `work/trunctest` fixtures): DeepSeek **129 live + 105 cached** calls, 1,790,263 prompt tokens
  (1,385,088 cache hits / 405,175 misses), 300,941 completion, 83,700 reasoning, **$0.9724 at peak / $0.4862 at the
  off-peak half-rate**. ElevenLabs **0 calls / 0 characters**; no new TTS calls. No other provider spend was logged.

## Deviations from the prompt

- The character mask is rendered at **2× supersampling** and downsampled, and the bloom/halation **source** uses an
  edge-smoothed coverage; the card's drawn edge stays on the legacy `alphaTest 0.5` + MSAA path. The first review had a
  hard-edge halo; the 2×/source-smoothing change removed it without adding a dilation ring.
- The Savitri board was re-run with the new foreground allocator after the look sheets were approved: the opening
  palace foreground and the village door/front marks were actor/building marks, so the allocator re-picked or dropped
  them (`village.hutDoor`, no palace foreground). The board review has 0 errors and the final share is 35.3%. The look
  sheet is therefore the **pre-re-pick** palace/village foreground framing; the final film uses the cleaner marks. The
  hermitage, deer and both Bakasura sheets are unchanged by this re-pick.
- Bakasura's first final QA flagged frame 36 as an unplanned pop because the final `short_qa` received only the
  storyboard planned events. `d97279f` adds board punches/kicks/cuts; the QA was regenerated without re-rendering the
  final and now PASSes.
- `final-qa.md` is a copy of the new `qa/summary.md` (voice/look lines included) rather than the older short summary.
- The look-dev pagination (`0fef03e`) was an uncommitted F2 improvement; it is included so the multi-scene pages are
  reproducible.

## Problems and open questions

- The four look warnings above are the only unresolved check output. They are explained, not hidden; if the user wants
  the two dark faces lifted, the options are `project.look.featureRim=true` (eye/mouth feature rim, skin unchanged) or
  a stronger scene key. The current user choice is eye rings off.
- The WebGL driver prints the pre-existing `Feedback loop formed between Framebuffer and active Texture` warning during
  video renders; it was present before this phase and does not appear in any QA metric. It was not introduced by the
  mask/glow split (the same warning exists in the older animatic logs).
- The finals and animatics are under `work/` and are intentionally not committed.
- The finals were rendered after the look sheets were approved; if the user wants a different foreground on the Savitri
  opening or a different mood on a scene, the board/animatic can be re-run per shot with `fableon board --shot`.

## Please look at

- `work/savitri-hi/final.mp4`, `work/bakasura-hi/final.mp4`
- `work/savitri-hi/animatic.mp4`, `work/bakasura-hi/animatic.mp4`
- `docs/reports/phase-3f/look-review-fixed.jpg`, `docs/reports/phase-3f/edges-after-fix.jpg`
- `work/savitri-hi/look-qa.md`, `work/bakasura-hi/look-qa.md`, `work/*/qa/summary.md`, `work/*/final-qa.md`
- `fixtures/savitri-hi/`, `fixtures/bakasura-hi/` (shotplans with moods, boards, frames, QA, look masks)
- `docs/DIRECTOR_GUIDE.md`, `prompts/director-craft.md`, `docs/ROADMAP.md`
