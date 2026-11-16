# Phase 1 — Foundation: workspace, local GPU rendering, `fableon` CLI, regression tests

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` and `docs/LESSONS.md` first. Follow every rule in AGENTS.md:
one feature = one commit (Conventional Commits), checks green before every commit, no visual changes, small diffs.

## Goal
Make the seed reproducible on this machine with one CLI: from a clean clone, rebuild the Adi Parva fixture film end to
end (render → audio → assemble → QA) at preview quality, prove nothing changed visually, and measure render speed with
the local GPU. **No new product features yet** (no storyboard, no AI calls, no server, no UI).

## Important facts about the seed
- The engine's timeline is compiled in: `engine/src/story.ts` imports `engine/src/words.json` (the fixture's word
  timings). Until Phase 2 the renderer can only draw the Adi Parva film. The CLI must check that a project's
  `words.json` is identical to `engine/src/words.json` and otherwise stop with a clear message ("custom projects arrive
  in Phase 2").
- `engine/scripts/render.cjs` modes: `stills`, `video`, `segments`, `list`, `qa`, `cuts`. Its positional arguments are
  awkward (e.g. `segments x <jobs.json> x <w> <h> <ms>` where `x` are placeholders). It reads `CHROME_PATH` and
  `RENDER_GL` (`gpu` default, `swiftshader` for CPU-only machines).
- Audio and voice scripts read `PROJECT_DIR` (inputs: `voice.wav`, `words.json`, `shots.json`; outputs into
  `PROJECT_DIR/audio/`). `voice/make_voice.py` also reads `SCRIPT.md` and `pronunciations.json`.
- `fixtures/adi-parva/reference-stills/frame_N.jpg` are frames 60, 640, 1065, 1880, 2230, 2480, 2850, 3430, 3600 of the
  finished film, scaled to 540x960. They were rendered with SwiftShader (CPU); a GPU may differ by a few levels.

## Features (one commit each, in this order)

### F1 `chore(repo): npm workspace and tooling`
- Root `package.json` with npm workspaces `["engine", "cli"]` and scripts `typecheck`, `build`, `test` that delegate.
- Keep `requirements.txt`; add `pillow` (needed by the QA and test scripts). Document creating the Python 3.12 env at
  `.venv/` (uv or venv). The CLI finds Python via `FABLEON_PYTHON`, else `.venv/bin/python` (`.venv\Scripts\python.exe`
  on Windows), else `python3`/`python`.
- Must work on macOS, Linux and Windows (native PowerShell). No bash required at runtime.

### F2 `refactor(engine): named flags for render.cjs`
- Replace positional arguments with named flags, e.g.
  `render.cjs stills --out <prefix> --frames 60,640 --size 540x960 --msaa 0`,
  `render.cjs segments --jobs <file>`, `render.cjs list --out <shots.json>`, `render.cjs qa --out <qa_meta.json>`,
  `render.cjs cuts --out <cuts.json>`, `render.cjs video --out <mp4> --from 0 --to 90 --size …`.
- Same behaviour and output as before. Port `engine/scripts/build.sh` and `engine/scripts/assemble.sh` to Node
  (`build.mjs`, `assemble.mjs`) so nothing needs bash. Keep `engine/tools/jobs.py` logic but port it to JS inside the CLI
  in F5 (then delete the Python copy in that commit).

### F3 `feat(engine): report the WebGL backend and pick fast GPU flags`
- In `engine/src/main.ts` expose `window.GLINFO` = the unmasked renderer string (`WEBGL_debug_renderer_info`). Not a
  visual change.
- `render.cjs` prints it after `ready`, and warns if `RENDER_GL=gpu` still yields SwiftShader / llvmpipe / "Basic Render".
- On THIS machine, try launch flag sets (e.g. default; `--enable-gpu`; `--use-angle=gl`; macOS `--use-angle=metal`;
  Windows `--use-angle=d3d11`; Playwright's `channel: 'chromium'` new headless vs the headless shell) and time 5 stills at
  1440x2560. Make the fastest working set the default for this OS (selectable with `RENDER_GL`). Record all timings in
  `docs/BENCHMARKS.md`.

### F4 `feat(cli): fableon CLI skeleton and doctor`
- New workspace package `cli/` (plain Node ESM, `commander` allowed), binary `fableon` (also runnable as `npx fableon`).
- `fableon doctor`: Node ≥ 20, Python 3.12 found + imports `kokoro numpy scipy soundfile PIL`, ffmpeg + ffprobe on PATH,
  Playwright Chromium launches and its WebGL renderer string, engine `dist/` built, free disk space. Each check prints
  OK/FAIL with a one-line fix.

### F5 `feat(cli): project workspace and pipeline commands`
- `fableon init <name> --from fixtures/adi-parva` → copies the fixture inputs into `work/<name>/` (`work/` is gitignored).
- Every command takes `--project work/<name>`; all outputs stay inside the project:
  `stills/`, `render/seg_XX.mp4`, `audio/`, `qa/`, `final.mp4`.
- Commands:
  - `fableon voice [--speed 1.35] [--voice am_michael]` → runs `voice/make_voice.py` (optional for the fixture).
  - `fableon shots` → writes `shots.json`, `qa_meta.json`, `cuts.json` via render.cjs `list` / `qa` / `cuts`.
  - `fableon stills --frames 60,640 [--quality preview|final]`.
  - `fableon render [--quality preview|final] [--workers N]` → splits shots into N balanced job lists (port of `jobs.py`),
    runs N segment workers in parallel, shows frames done / total and ETA, is **resumable** (existing clips are skipped,
    partial clips are `*.part.mp4` and get removed on restart), and keeps going if the CLI is interrupted only if started
    with `--detach`.
  - `fableon audio` → `audio/mix.py` with `PROJECT_DIR`.
  - `fableon assemble` → concat + mux into `final.mp4`.
  - `fableon qa` → `tools/qa/short_qa.py` into `qa/`, then subtract the planned camera cuts (`cuts.json`, ±1 frame) from the
    reported pops and write `qa/summary.md` (specs, loudness, black/white/frozen, unexplained pops).
  - `fableon all [--quality …] [--workers N]` → shots → render → audio → assemble → qa.
- Quality presets: `preview` = 540x960, `final` = 1440x2560 (both MSAA 0 + SMAA as today).

### F6 `test: regression tests for stills and audio`
- `npm test` (root) runs: engine typecheck; a stills test that renders the 9 reference frames at 540x960 into a temp
  dir and compares each with its reference (grayscale, resized to 135x240, mean absolute difference ≤ 6.0 on 0-255);
  an audio test that runs the mix in a temp project and asserts duration 121.30 ± 0.05 s and integrated loudness
  −14.5 ± 0.5 LUFS (use `audio/dsp.py` `integrated`).
- If the GPU output differs from the SwiftShader references by more than the threshold but looks identical, report the
  numbers and attach both images; do not raise the threshold.

### F7 `docs: setup, CLI usage and benchmarks`
- README quickstart for this OS (and notes for the other two), the CLI reference, troubleshooting from `docs/LESSONS.md`
  (Kokoro / spaCy / Hugging Face), `docs/BENCHMARKS.md` filled in. Update the "Running" section of AGENTS.md.

### F8 `docs(report): phase 1 report`
- `docs/reports/phase-1.md` following `docs/REPORT_TEMPLATE.md`.

## Acceptance (paste the evidence in the report)
1. Clean clone → `npm install`, Python env + `pip install -r requirements.txt`, `npx playwright install chromium` →
   `fableon doctor` all OK.
2. `npm test` passes; list the 9 still differences.
3. `fableon init adi --from fixtures/adi-parva` then `fableon all --project work/adi --quality preview --workers 2`
   produces `work/adi/final.mp4`: 540x960, 30 fps, 3639 frames, 121.3 s, AAC audio; `qa/summary.md` shows no black, white
   or frozen frames and at most the 3 known intended pops (1249, 2152, 2715).
4. `docs/BENCHMARKS.md`: GPU renderer string, s/frame at preview and final size, total time of step 3.
5. `git log --oneline` shows the 8 commits above, in order.

## Out of scope (do NOT do in this phase)
Storyboard schema, catalog, framing solver, any AI/LLM calls, server, frontend, new characters/sets, any change to
what the renderer draws.
