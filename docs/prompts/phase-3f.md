# Phase 3F — Light and glow; pipeline fixes; final renders

## Why (user, after the Bakasura 9/10 animatic: "all ok, lighting still flat, bring glowness")
Architect measurement on three Bakasura animatic frames vs the Adi film and the reference style:
- Overall contrast is fine (luma std 0.19–0.24), so "flat" is not low contrast. It is missing light direction and colour separation.
- Warm/cool split, (R−B of the brightest 15 % of non-ink pixels) − (R−B of the darkest 15 %): Bakasura 0.12–0.21; Adi golden/night frames 0.5–0.9; reference: warm key light with blue/purple shadows.
- Glowing highlights (luma > 0.9): Bakasura 0.1–4 %; Adi up to 5.5 %.
- Mean luma: day frames 0.57–0.59 (bright, flat noon); the Bhima close-up 0.29 (dark). Reference 0.43–0.54.
- Every Bakasura scene is lit as front-lit noon with grey-green shadows; Bhima's black-ink features on very dark skin are hard to read.
Pipeline issues from the Phase 3E report and fixture: autopilot revised the user-APPROVED Bakasura script; the script word budget used wps 3.71 (English default) for Nachiket Hindi (~2.7 w/s delivered), so Bakasura ran 66 s instead of 48–50 s; the cast stage turned the place mention "ekachakra" into a character; free disk is 4.4 GB; group shots can pile subjects on top of each other (Bakasura overlapping the brahmin).

## Ground rules
- The full Adi film renders identically (golden <= 1.0) and its audio is unchanged: every new look feature is opt-in per shot, defaults unchanged.
- Authoring board 0/0.
- Character skin colours are never lightened to fix readability; fix it with light and feature ink.
- Keys never printed; budgets as in 3E; no new ElevenLabs calls.

## Features (one commit e F1  feat(engine): glow and light rig (opt-in)
Per-shot `look` block in the storyboard/board schema, compiled from the scene's mood (F2):
- key light: direction RELATIVE TO THE CAMERA (azRel, el), colour, intensity; sun stays frozen per shot (continuous scenes = per scene);
- fill/shadow tint (violet-blue for golden/dusk, cool blue at night);
- character rim light: warm, inner rim only, on the key-facing side of head and torso (never an offset outer copy; the skill's gotcha);
- glow: a halation post pass (threshold ~0.75 luma, blur scaled with output height, screen-blended, tinted) with per-mood intensity, in addition to the existing HDR bloom;
- sun disc + bloom when the sun is in frame; haze / atmospheric perspective (fog colour = horizon colour, the skill's values);
- a `shafts` effect (light shafts / god rays card, fog-free, soft) for forests, temples and doorways;
- grade presets per mood (lift shadows toward violet, warm highlights, subtle vignette).
- Dark-skin feature readability: when a character's skin-vs-ink contrast is < 2.2 (the 3C warning), draw a thin light rim (or eye whites) around eyes and mouth so expressions read; skin colour unchanged. No Adi character is below 2.2, so the golden test is unaffected; prove it.
- Tests: Adi golden unchanged; each look feature renders and is measurable; dark-skin rim appears only below the threshold.

### F2  feat(director): mood-based lighting design + look-dev sheet
- The shot planner chooses a mood per scene from the story (time of day + emotion); the model chooses, code builds the rig. Moods (deterministic rigs, calibrated values documented):
  golden-glow (backlit/three-quarter-back key, el 7–12, warm key, violet shadows, rim on, glow high, haze);
  warm-side (side key azRel 100–120 — LESSONS: keeps lit faces with a warm/violet split, rim medium, glow medium);
  dusk (very low sun, deep orange key, purple sky, glow high);
  night-moon (cool moon key, warm card tint, practicals glow, haze);
  noon (only when the story needs harsh midday; still with a warm/cool split).
- Look-dev sheet: for every scene of a project, render its key frame in 3 candidate moods (the planner's pick + 2 alternatives) → docs/reports/phase-3f/lookdev-<project>.jpg (labelled, <= 1600 px tall per page).
- USER CHECKPOINT: STOP and ask the user to choose a mood per scene (or "all golden-glow" etc.). Record the choice in shotplan.json.

### F3  feat(qa): measured look check
- `fableon frames` / `fableon qa` measure per scene: warm/cool split, glowing-highlight share (luma > 0.9), mean, std, p2, p98, and the face brightness of the primary subject.
- Targets per mood, calibrated on the Adi film's golden/night frames and the STYLE_BIBLE (mean 0.43–0.54, std 0.21–0.29, p2 0.03–0.11, p98 0.90–1.0): e.g. warm/cool split >= 0.35 for golden-glow/dusk, >= 0.25 warm-side, glow share 1–6 % for golden-glow. Publish the calibration table.
- WARNING `flat light <scene>` when a scene misses its mood's targets; WARNING `dark face <id>` when the primary subject's face is much darker than the frame mean.
- WARNING `crowded <a>/<b>` when two subjects' silhouettes overlap more than 30 % of the smaller one (unless a beat marks them as touching on purpose).

### F4  fix(pipeline): approved lock, voice-aware budget, cast places, disk cleanup
- Approved artifacts are read-only: autopilot and revise loops never modify an approved script (or any approved stage output). Factcheck flags on an approved script stop the run and ask the user. Test.
- Script budget uses the selected voice's measured delivered rate (voice.rate.delivered for that provider + voice + model + pace), never the English default. Record the rate the script used in script.json. Test with Nachiket ~2.7 w/s.
- The cast stage never casts places: `mentions` with a place role (village, town, forest, river…) are excluded; only people/beings are cast. Re-run Bakasura's cast data without "ekachakra" (no visual change to the approved characters).
- `fableon clean [--project P] [--dry-run]`: list and remove regenerable files (old render segments, superseded voice takes and auditions not referenced by project.json, preview stills, stale caches), never fixtures, approved outputs, final.mp4 or the current animatic. Show the space it frees. Run it (dry run first, then real) before F5 and report free disk before/after.

### F5  feat(fixture): re-light Savitri and Bakasura; final renders
- For both projects: look-dev sheet (F2 checkpoint) → re-render the animatics with the chosen moods → measured look check passes (or warnings explained) → USER CHECKPOINT: the user rates each animatic and gives lighting notes; apply notes per scene until approved.
- Then final renders at 1440×2560 for BOTH films with the full mix → short_qa PASS → work/<project>/final.mp4 (not committed). Check free disk >= 5 GB before each final render.
- Commit the updated fixtures (shotplan.json/.md with moods, board.json, storyboard.json, frames.json, board.review.json, animatic-qa.md, final-qa.md) and review images in docs/reports/phase-3f/ (look-dev sheets and before/after frames for each scene).

### F6  docs: guide, roadmap, report
- docs/DIRECTOR_GUIDE.md (<= 8 KB) and prompts/director-craft.md (<= 3 KB): moods, when to use each, rim, glow, shafts, the look check.
- docs/ROADMAP.md: next is Phase 4 (backend API for the pipeline library: projects, stages, approvals, jobs, progress events, artifacts) and Phases 5–6 (the browser interface with stage-by-stage control and per-stage model/voice selection); keep context-aware SFX libraries, per-stage bake-offs for the other stages, whip pans and new set kits as later items.
- docs/reports/phase-3f.md per the template: the calibration table; before/after look numbers per scene for both films; the user's mood choices, ratings and notes; dark-skin readability before/after (Bhima close-up); the pipeline fixes with their tests; disk before/after cleanup; final render times and QA; cost per provider.

## Acceptance (paste the evidence in the report)
1. npm test green (golden <= 1.0, Adi audio unchanged, authoring 0/0) with the new tests (look rig, glow, rim, dark-skin feature rim, look check, crowded, approved lock, voice-aware budget, cast places, clean).
2. Both films: moods chosen by the user per scene; measured look targets met (or explained); animatics approved with ratings; final 1440×2560 renders QA PASS.
3. Free disk >= 5 GB after cleanup.
4. `git log --oneline` shows the Step 0 docs commit followed by F1–F6 in order.

## Out of scope
New sound sources, new set kits, server, frontend.
