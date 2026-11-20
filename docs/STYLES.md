# Style packs

A style pack is Fableon's port of one Claude skill's look into code. Fableon never runs a
Claude skill per film; the skill is read once, by an agent, and its rules become a pack.

The shared pipeline is identical for every pack: brief, research, script (unless the pack
overrides the craft formula), fact-check, voice, sound-mix, segment cache, assembly, publish,
export, queue, presets and costs. A pack owns only what makes the picture look and move.

## Contract

`style.json` is validated by `schema/style.schema.json`. The required fields are:

| field | meaning |
|---|---|
| `id`, `name`, `description`, `version` | identity |
| `status` | `ready`, `porting` or `not-ready`; only `ready` packs appear in the dropdown |
| `source` | skill name, URL and licence; required even for first-party packs |
| `formats` | `short-vertical` today |
| `sampleFrames` | local images shown in the style dropdown |
| `adapter` | module (relative to the pack) that implements the hooks below |
| `catalog` | the pack's catalog JSON, used by the census, matcher and validator |
| `boardSchema` | JSON Schema for the pack's storyboard; may be the shared schema |
| `prompts.director`, `prompts.craft` | prompt cards; director <= 8 KB, craft <= 3 KB |
| `qa` | frozen-frame limit and pop rule for this style |
| `cache` | namespace for engine build ids and segment caches |

Optional fields: `lookControls` (the Finish controls the style supports), `craftFormula`,
`sound` (SFX kinds and instruments), `testOnly`.

The adapter may export any of these hooks. Missing hooks fall back to the shared engine.

```js
// styles/<id>/adapter.mjs
export async function renderPreview({ projectDir, qualityName, workers }) {}      // render/seg_XX.mp4
export async function renderShotSegments({ projectDir, jobsFile, size, crf }) {}  // [{id,from,to,file}]
export async function renderSegments({ projectDir, jobsFile, size }) {}           // [[from,to,file]]
export async function renderStills({ projectDir, frames, out, size }) {}          // stills/
export async function renderLookdev({ projectDir, out }) {}
export async function compileBoard({ projectDir }) {}                             // optional board compiler
export async function validateBoard({ projectDir }) {}                            // optional validator
```

Style-specific stages (`cast`, `shotplan`, `board`) may be replaced by a `stages` export:
`{ cast: './stages/cast.mjs', shotplan: './stages/shotplan.mjs' }`. A pack that only changes
the renderer leaves them out.

## Adding a pack from a skill

1. Settings -> Styles -> **Add from a skill folder**, or `fableon style import --from <dir> --id <id>`.
   A git URL is cloned into `styles/_incoming/<name>/` first.
2. The import copies the skill's text into `styles/_incoming/<name>/`, skips any media marked
   `private` or `study-only`, and records the licence. It never copies reference frames of
   another channel into the repo.
3. Import writes `styles/<id>/PORTING.md`: what the skill does at each stage, what maps to the
   contract, what is missing, and the porting tasks. The pack starts as `not-ready`.
4. Port the skill by hand into `styles/<id>/adapter.mjs` and its stage modules. No shared file
   changes.
5. Run `fableon style check <id>`. It validates the contract, the catalog, the prompt sizes, the
   QA profile and renders a test board at preview and final quality. Only then does the pack
   appear as ready in the dropdown.

A style can be changed freely until the cast stage is approved. After that the app asks for
confirmation, shows an estimate, and reruns from cast; the previous outputs stay in
`.fableon/history/`.

## Caches and QA

The engine build id includes the pack id and the adapter source, and every final segment hash
includes the pack id, so changing a pack never reuses another pack's pixels. Preview segments
are deleted at the start of every animatic (they are not a cache). QA reads the pack's profile:
a limited-animation pack may legitimately hold frames, so its `frozenFrames` limit is larger;
pop detection still uses the same rule unless the pack overrides `popFactor`/`popOffset`.

## Today's packs

- `toon3d` — the first pack: flat 2D cartoon cards in a painted 3D toon world, ink outlines,
  lens blur, colour grade. It is an adapter over the existing engine; no engine file moved.
- `flat-card` — test-only. Solid colour cards and a drifting block prove that a second pack can
  run brief -> final through the shared pipeline. It is hidden from the product dropdown.
