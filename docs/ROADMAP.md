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

## Phase 4 — Backend API
Node server: projects, artifacts, stages, jobs (REST + WebSocket progress), file serving for audio/video/stills.

## Phase 5 — Frontend: stages 1-6
Brief, research, script editor (per-line regenerate, fact flags), voice (player, word timeline, pronunciation editor), storyboard shot timeline editor, animatic player.

## Phase 6 — Frontend: stages 7-9 + autopilot
Look & sound controls, render queue with per-shot re-render, QA report + export, presets and autopilot with checkpoints, model settings with cost estimates.

## Phase 7 — Packaging and catalog growth
One-command start, desktop wrapper option, more sets/characters/actions, catalog authoring guide.
