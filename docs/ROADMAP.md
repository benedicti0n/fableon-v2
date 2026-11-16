# Roadmap

Each phase is implemented by the coding agent from a phase prompt (`docs/prompts/phase-N.md`), one commit per feature,
and ends with a report (`docs/reports/phase-N.md`). The architect reviews the report and writes the next prompt, so
later phases are only outlined here and may change.

## Phase 1 — Foundation (no visual changes)
Repo/workspace tooling, GPU rendering on the local machine (with a software fallback), a `studio` CLI that runs the
whole fixture pipeline (voice → shots → render → audio → assemble → QA), preview/final quality presets, regression tests
against the reference stills and the audio metrics, setup docs. Exit: a clean clone can rebuild the Adi Parva film.

## Phase 2 — Storyboard engine (the core)
2A: storyboard JSON schema (zod) + catalog registry (sets, characters/outfits, poses, expressions, actions, fx, sfx,
music moods, each with a one-line description for the model) + a generic interpreter that replaces `story.ts`.
2B: framing solver + in-frame validator; port the Adi Parva timeline to `storyboard.json` and prove parity on the
reference stills; per-shot preview stills.

## Phase 3 — Pipeline core (CLI first)
Project folder format + stage dependency graph with input hashing and invalidation; job runner; model router
(OpenAI-compatible providers, per-stage settings, fallbacks); prompts + JSON schemas for research, script, fact-check and
storyboard with validator-feedback retries; `studio run --to <stage>`; cost/time estimates.

## Phase 4 — Backend API
Node server: projects, artifacts, stages, jobs (REST + WebSocket progress), file serving for audio/video/stills.

## Phase 5 — Frontend: stages 1-6
Brief, research, script editor (per-line regenerate, fact flags), voice (player, word timeline, pronunciation editor),
storyboard shot timeline editor (per-shot regenerate, validator errors inline), animatic player with shot jump.

## Phase 6 — Frontend: stages 7-9 + autopilot
Look & sound controls, render queue with per-shot re-render, QA report + export, presets and autopilot with checkpoints,
model settings screen with cost estimates.

## Phase 7 — Packaging and catalog growth
One-command start (docker compose and/or desktop wrapper), more sets/characters/actions, catalog authoring guide.
