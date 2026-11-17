# Roadmap

Each phase is implemented by the coding agent from a phase prompt (docs/prompts/phase-N.md), one commit per feature, and ends with a report (docs/reports/phase-N.md). The architect reviews the report and writes the next prompt, so later phases are only outlined here and may change.

## Phase 1 — Foundation (done)
Workspace, GPU rendering (ANGLE Metal on macOS), `fableon` CLI (doctor, init, voice, shots, stills, render, audio, assemble, qa, all), regression tests, setup docs and benchmarks.

## Phase 2 — Storyboard engine (the core), in three steps
- 2A — Storyboard v1 JSON Schema + catalog export + `fableon validate`; runtime project loading; interpreter that builds the same ShotDef[] as story.ts, with a legacy hybrid; 10 Adi Parva shots ported and proven by a per-shot pixel parity test; one final-quality run.
- 2B — Port the remaining 29 shots: turn their custom choreography into reusable catalog actions/effects/set pieces (paths and walks, falls, pop-from-container, crowds/grids, arrows, emblems, fire spots and treetops, splash, bubbles, pigeon, jars, wheel, city rise, boat, nectar ...); planned "intended jump" events exported for QA (removes the fixture pop allowlist); delete the legacy story.ts path.
- 2C — Semantic layer for models: named marks per set, semantic camera keys ("medium on X", "two-shot", "wide", angles, moves) compiled by a framing solver into v1 numbers; in-frame validator (project every subject into the camera); re-express several fixture shots semantically and check every subject stays in frame.

## Phase 3 — Pipeline core (CLI first)
Project folder format + stage dependency graph with input hashing and invalidation; job runner; model router (OpenAI-compatible providers, per-stage settings, fallbacks); prompts + JSON schemas for research, script, fact-check and storyboard with validator-feedback retries; `fableon run --to <stage>`; cost/time estimates.

### Phase 3B carry-over (from 2F)
1. A subject's body leaving the side of the frame, and the `over` actor's size band, are unchecked (S14 opening: small Pandu under a big deer cut at the left edge).
2. The edge-intruder warning missed Satyavati's sliver at the right edge in L5.
3. Tangents: a pole/pillar/trunk landing on a head (S27 opening, middle priest).
4. Expression/talk beats need a readable face (S38 Agni at ~22 % body: pained → relief and burp unreadable).
5. Kunti's entrance in S14 happens off-screen unflagged; the L16 pop-in was removed instead of using the 0.5 s rule.
6. The director guide must describe each size by what it shows in this house style (close ≈ head to knees, medium ≈ whole figure), not by film-school names.
7. Feature ink adapts to dark skin tones (light rim on eyes/mouth) so every skin tone keeps readable expressions.

Also: the renderer only has the 8 Adi Parva set kits; new set kits are a later phase, so new topics must be stageable in those sets for now. Phase 3A's script catalog card enforces that.

### Phase 3C carry-over (from the AI director)
- Semantic fx placement: put fire on a mark's box top (the S38 flames float above the trees), smoke from a set piece, and reveal effects from a landmark, instead of hand-picked world offsets.
- UI for the shot plan, board review and animatic checkpoints (the CLI already exposes the artifacts and approvals).

## Voice providers (from Phase 3A-2)
- Add a local forced aligner for providers that return audio without word timings.
- Add voice/provider/model selection, audition playback and per-tone delivery controls to the UI.

## Phase 3D — Reference direction, pace and sound (done)
Scenes and per-boundary transitions (crossfade/flash/cut), burst easing, punch/impact/drama/reveal/foreground marks, walking and follow paths, low full/wide heights, DOF per size, a cue-driven original score + SFX mix, the 1.20 Savitri pace, the reference script formula and the first complete 1440×2560 AI-made film. The board/animatic checkpoints are in `docs/reports/phase-3d.md`.

## Phase 3E — Model bake-off and voice depth
- Per-stage model bake-off across OpenRouter models and direct providers (DeepSeek, others), with the flash defaults kept as the baseline and every fallback measured.
- Sarvam Bulbul + a local forced aligner; draft/final voice and a credit meter. The user's Sarvam Nachiket request from the Savitri v2 review is the first target.
- Keep the deterministic board writer; use `models.board` / `models.boardEscalate` only in the bake-off.
- Later: whip pans with motion blur, new set kits, semantic fx placement, UI for the shot plan/board/animatic checkpoints.

## Phase 4 — Backend API
Node server: projects, artifacts, stages, jobs (REST + WebSocket progress), file serving for audio/video/stills.

## Phase 5 — Frontend: stages 1-6
Brief, research, script editor (per-line regenerate, fact flags), voice (player, word timeline, pronunciation editor), storyboard shot timeline editor, animatic player.

## Phase 6 — Frontend: stages 7-9 + autopilot
Look & sound controls, render queue with per-shot re-render, QA report + export, presets and autopilot with checkpoints, model settings with cost estimates.

## Phase 7 — Packaging and catalog growth
One-command start, desktop wrapper option, more sets/characters/actions, catalog authoring guide.
