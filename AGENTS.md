# AGENTS.md — rules for coding agents working in this repo

## What this project is
Fableon: a local, stage-wise generator for ~1-2 minute vertical cartoon story videos (flat 2D character
cards lit inside a 3D three.js toon world, ink outlines, lens blur, colour grade, synthesized narration, score and
sound effects). The current code is a working prototype that rendered one finished film (the Adi Parva short,
kept as the regression fixture in `fixtures/adi-parva/`). We are turning it into a product, phase by phase.
Read `docs/ARCHITECTURE.md` (target design), `docs/ROADMAP.md` (phases) and `docs/LESSONS.md` (hard-won gotchas)
before you change anything.

## Golden rules
1. **One feature = one commit.** Use Conventional Commits: `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`,
   `test(scope): …`, `docs(scope): …`, `chore(scope): …`. The phase prompt lists the features; commit each separately,
   in order. Never squash several features into one commit.
2. **Never commit a broken state.** Before every commit run the checks the phase prompt lists (at least
   `npm run typecheck` and `npm run build` in `engine/`, plus the tests that exist). If a check fails, fix it first.
3. **Do not change what the renderer draws unless the phase asks for it.** The regression stills in
   `fixtures/adi-parva/reference-stills/` must keep matching. If your change moves pixels, stop and report.
4. **Small, focused diffs.** Do not reformat, rename or "clean up" code outside the feature you are building.
   Keep the existing code style (TypeScript strict, 2-space indent; Python 3.12, 4-space indent).
5. **No new dependencies without a reason** written in the commit body and in the phase report.
6. **Never commit**: `node_modules/`, `dist/`, `work/`, rendered videos/frames, model weights, `.env`, files over 10 MB.
7. **Secrets** (API keys) only through environment variables / `.env` (gitignored). Never hard-code them.
8. **Licensing**: files derived from the `cartoon-3d-short` skill templates are MIT (see `LICENSES/`). Never add the
   skill's `references/` material (frames, contact sheets, reports of another channel) to this repo.
9. **When stuck** after two honest attempts, stop, write down what you tried and what failed, and put it in the report.
   Do not invent results, do not loosen a test threshold silently, do not delete a failing test.
10. **End every phase with the report** in the format of `docs/REPORT_TEMPLATE.md`, saved as `docs/reports/phase-N.md`
    and committed as the last commit of the phase (`docs(report): phase N report`).

## Layout (seed)
- `engine/` — TypeScript renderer (three.js + postprocessing, no React). `src/main.ts` is the page entry that exposes
  `window.renderFrame(f)` and `window.GLINFO`; `src/story.ts` is (for now) the hand-written Adi Parva timeline;
  `scripts/render.cjs` drives headless Chromium via Playwright and pipes JPEG frames into ffmpeg; `scripts/build.mjs`
  bundles with esbuild; `scripts/assemble.mjs` concatenates clips and muxes the mix.
- `cli/` — the `fableon` CLI (plain Node ESM): `doctor`, project workspace and the fixture pipeline.
- `tests/` — regression suite for the reference stills and the audio metrics.
- `audio/` — Python sound: `score.py` (original synthesized score), `sfx.py` (effects + ambience), `mix.py` (final mix),
  `timeline.py` (word anchors), `dsp.py` + `instruments.py` (synthesis toolkit). All read `PROJECT_DIR`.
- `voice/make_voice.py` — Kokoro TTS narration + word timings (reads `PROJECT_DIR/SCRIPT.md` + `pronunciations.json`).
- `tools/qa/short_qa.py` — frame-by-frame QA (black/white/frozen/pop frames, loudness, contact sheets).
- `fixtures/adi-parva/` — the regression project (script, voice, word timings, shot list, reference stills). Read-only.

## Running (seed)
```bash
npm install && npm run build
npx fableon doctor
npx fableon init adi --from fixtures/adi-parva
npx fableon all --project work/adi --quality preview --workers 2
npm test
```
`work/` is gitignored. `RENDER_GL=swiftshader` only on machines without a usable GPU (the default picks the fastest
working set per OS; see `docs/BENCHMARKS.md`).
