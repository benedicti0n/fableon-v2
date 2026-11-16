# Architecture (target)

## Product
A local web app that turns a topic into a finished vertical cartoon short through **stages**. Each stage produces an
editable artifact, can use a different AI model, and can be approved, edited or re-run before the next stage.
An **autopilot** runs all stages from a saved preset and stops only at the checkpoints left on.

## Stages
| # | Stage | Output artifact | AI? |
|---|---|---|---|
| 1 | Brief | `brief.json` (topic, length, language, tone, audience, aspect, resolution, style preset) | no |
| 2 | Research | `facts.json` (facts with citations) | research model (+ optional web search / uploaded sources) |
| 3 | Script | `script.json` + `SCRIPT.md` (lines with beat tags; facts referenced per line) | writer model + fact-check model |
| 4 | Voice | `voice.wav`, `words.json` (word timings), `pronunciations.json` | TTS (Kokoro local by default) |
| 5 | Storyboard | `storyboard.json` (shots anchored to words; sets, light, camera, cast, actions, fx, sfx, music) | director model |
| 6 | Animatic | low-res full preview MP4 + per-shot stills; in-frame validation report | optional vision model review |
| 7 | Look & sound | `look.json` (grade, ink, DOF), `audio/` (score, sfx, mix) | no |
| 8 | Render | `render/seg_XX.mp4` per shot | no |
| 9 | QA & export | `qa/report.md`, `final.mp4` | optional vision model review |

## Key ideas
- **The model never writes renderer code.** It fills JSON that follows a schema (`docs/STORYBOARD_SCHEMA.md`) and may only
  use names from the **catalog** (sets, characters/outfits, poses, expressions, actions, fx, sfx, music moods). Code
  validates the JSON; errors go back to the model automatically (retry loop) before a human sees them.
- **Automatic framing.** The storyboard says "medium shot on X", "two-shot X+Y", "wide", "low angle", "push in"; a
  framing solver computes camera position/look/fov so every listed subject is inside the frame (with safe margins),
  and a validator projects every character card into the camera to prove it.
- **Everything is anchored to words** of the narration (`{line, word}`), never to absolute times, so re-voicing only
  shifts anchors.
- **Project = folder of versioned artifacts** (`work/<project>/`). Stages form a dependency graph; each stage stores a
  hash of its inputs; editing an upstream artifact invalidates only what depends on it (e.g. editing script line 12
  re-voices line 12, shifts its words, and marks only the shots anchored there for re-render).
- **Long work runs as jobs** (voice, animatic, render, audio) with progress events to the UI; rendering is per shot so
  fixes re-render only the shots that changed.
- **Model router**: per stage, provider + model + temperature + fallback, through an OpenAI-compatible API (DeepSeek,
  OpenRouter, local Ollama/vLLM, others), configured in the UI; keys from environment.

## Components
- `engine/` (TypeScript): the renderer page (three.js world, cast cards, post chain) + Playwright frame driver. Becomes a
  **storyboard interpreter** in Phase 2 (since Phase 2B every shot is storyboard-driven; the hand-written timeline is deleted).
- `audio/`, `voice/` (Python): narration, score, effects, mix. Driven by `words.json` + storyboard sound tags.
- `server/` (Node/TypeScript, Phase 4): project store, stage graph, job queue, model router, REST + WebSocket API.
- `web/` (React + Vite, Phase 5-6): stage screens, shot timeline editor, previews, render queue, QA, autopilot.
- `tools/qa/`: frame QA and contact sheets.

## Data flow
```
brief -> research(facts) -> script -> voice(words.json) -> storyboard -> animatic -> look&sound -> render -> qa/export
                                 \___________ words anchor everything downstream ___________/
```
