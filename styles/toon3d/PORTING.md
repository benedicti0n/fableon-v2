# Porting the cartoon-3d-short skill to `toon3d`

## What the skill does
The Claude skill describes a flat 2D character card drawn in a three.js toon world: ink
outlines, painted sets, lens blur, a warm/cool grade, deadpan Hindi narration, and a hard
rule that characters are flat-lit and never glowed.

## What maps to the contract
- `cast`, `shotplan` and `board`: the existing `cli/src/stages/*` and `engine/src/authoring`
  code, unchanged. The pack's `boardSchema` is the shared `schema/storyboard.schema.json`.
- `render`, `stills`, `lookdev`: the existing `engine/scripts/render.cjs` and
  `cli/src/lookdev.js`. This adapter exports no render hook, which means "use the shared
  engine", and the engine build id includes `toon3d`.
- `catalog`: `schema/catalog.json`.
- `prompts`: `docs/DIRECTOR_GUIDE.md` (<= 8 KB) and `styles/toon3d/craft.md` (<= 3 KB).
- `qa`: the shared short-QA profile, frozen limit 12 frames, pop factor 3.

## What is missing
Nothing for the current eight sets and the Adi Parva fixtures. New sets and kit come from
Phase 7 F4 onward and are added to the shared catalog, not to the adapter.

## Porting tasks
- None. This pack is the reference adapter; `fableon style check toon3d` proves it.
