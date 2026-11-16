# Fableon

Local, stage-wise generator for vertical cartoon story shorts: flat 2D character cards lit inside a 3D three.js toon
world (ink outlines, lens blur, colour grade), synthesized narration (Kokoro), an original synthesized score and sound
effects. Every stage (brief → research → script → voice → storyboard → animatic → look & sound → render → QA/export)
produces an editable artifact and can use a different AI model.

**Status: Phase 1 (foundation).** One `fableon` CLI rebuilds the Adi Parva fixture film end to end (shots → render →
audio → assemble → QA) on this machine, with regression tests against the prototype's reference stills and audio
metrics. The renderer still has the fixture timeline compiled in; storyboards and custom projects arrive in Phase 2.
See `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` and `docs/BENCHMARKS.md`. Coding agents: read `AGENTS.md` first.

## Requirements
- Node 20+ (`.nvmrc` says 20), npm.
- Python 3.12 (Kokoro pins numpy 1.26.4, which has no 3.13 wheels).
- ffmpeg and ffprobe on PATH.
- Chromium for Playwright (installed below), and a working GPU for the fast path.

## Install

macOS (verified on an M1, macOS 26.5):
```bash
brew install node python@3.12 ffmpeg
npm install
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
(cd engine && npx playwright install chromium)
npx fableon doctor
```

Linux: install Node 20+, Python 3.12 and ffmpeg with the distro package manager, then the same `npm install`,
`python3.12 -m venv .venv`, pip and Playwright steps.

Windows (PowerShell):
```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
cd engine; npx playwright install chromium
npx fableon doctor
```

The CLI finds Python via `FABLEON_PYTHON` if set, else `.venv/bin/python` (`.venv\Scripts\python.exe` on Windows),
else `python3`/`python`.

## Quickstart: rebuild the fixture film

```bash
npx fableon init adi --from fixtures/adi-parva
npx fableon all --project work/adi --quality preview --workers 2
```

That writes `work/adi/final.mp4` (540x960, 30 fps, 3639 frames, 121.3 s, AAC) plus `work/adi/qa/summary.md`. The
`all` command runs the same stages as the individual commands below: shots → render → audio → assemble → QA.

## CLI reference

| Command | What it does |
|---|---|
| `fableon doctor` | Node, Python 3.12 + packages, ffmpeg/ffprobe, Playwright Chromium + WebGL renderer, engine `dist/`, free disk. Each failure prints a one-line fix. |
| `fableon init <name> [--from fixtures/adi-parva]` | Copy a fixture project's inputs into `work/<name>/` (never overwrites a non-empty folder). |
| `fableon voice --project <dir> [--speed 1.35] [--voice am_michael]` | Regenerate narration + word timings with Kokoro (optional for the fixture; rewrites `voice.wav` and `words.json`). |
| `fableon shots --project <dir>` | Write `shots.json`, `qa_meta.json`, `cuts.json` from the engine. |
| `fableon stills --project <dir> --frames 60,640 [--quality preview\|final]` | Render selected frames into `stills/`. |
| `fableon render --project <dir> [--quality …] [--workers N] [--detach]` | Render every shot to `render/seg_XX.mp4`. Resumable: finished clips are skipped, `*.part.mp4` are discarded. `--detach` keeps rendering after the CLI exits (log: `render/render.log`). |
| `fableon audio --project <dir>` | Run `audio/mix.py`: score, effects, ducking, limiter, `audio/mix.wav` + stems. |
| `fableon assemble --project <dir>` | Concatenate the clips and mux the mix into `final.mp4`. |
| `fableon qa --project <dir>` | Frame QA into `qa/report.md` + contact sheets; subtracts planned camera cuts (±1 frame) and writes `qa/summary.md`. |
| `fableon all --project <dir> [--quality …] [--workers N]` | All of the above in order. |

Quality presets: `preview` = 540x960, `final` = 1440x2560 (both MSAA 0 + SMAA, the prototype's final path).
Every command accepts `--project`; render defaults to 2 workers (use 1–2 on an 8 GB machine).

Phase 1 only draws the fixture timeline: commands that render check that the project's `words.json` is identical to
`engine/src/words.json` and stop with a clear message otherwise (custom projects arrive in Phase 2).

## A project folder

```
work/<name>/
  SCRIPT.md pronunciations.json voice.wav words.json  inputs
  shots.json qa_meta.json cuts.json                   engine metadata
  stills/f_<frame>.jpg                                selected stills
  render/seg_XX.mp4 render/jobs_N.json                per-shot clips (resumable)
  audio/mix.wav audio/stem_*.wav                      score, sfx, mix
  final.mp4                                           assembled film
  qa/report.md qa/summary.md qa/sheet_*.jpg           QA report + contact sheets
```

`work/` is gitignored; fixtures stay untouched.

## Tests

```bash
npm test
```

Runs the engine typecheck, renders the 9 reference frames at 540x960 and compares them to
`fixtures/adi-parva/reference-stills/` (grayscale, 135x240, mean absolute difference ≤ 6.0), then mixes the audio in a
temp project and checks 121.30 ± 0.05 s and −14.5 ± 0.5 LUFS integrated. On this M1 the 9 stills differ by 0.6–1.8 on
the 0–255 scale (GPU vs the SwiftShader references: visually identical).

## Rendering backend

`fableon doctor` prints the WebGL renderer string. On macOS the default is new-headless Chromium with ANGLE Metal
(`RENDER_GL=gpu`); `render.cjs` warns if a GPU request silently falls back to SwiftShader. `RENDER_GL=swiftshader`
forces the software path for CPU-only machines/CI; other sets (`chromium`, `chromium-metal`, `chromium-gl`, `shell`,
`default`) are documented in `docs/BENCHMARKS.md`. A full preview render of the fixture takes about a minute with 2
workers on the M1; details and per-frame numbers are in `docs/BENCHMARKS.md`.

## Troubleshooting

- **`fableon doctor` cannot find Python 3.12** — install it (macOS: `brew install python@3.12`), create `.venv` as
  above, or point `FABLEON_PYTHON` at a 3.12 interpreter.
- **`GL ... SwiftShader` / slow rendering** — the GPU was not used. Do not set `RENDER_GL` (the default picks the fast
  set), check `fableon doctor`, and see `docs/BENCHMARKS.md`. Use `RENDER_GL=swiftshader` only when there is no GPU.
- **Kokoro download fails** — allow `huggingface.co` and its CDN hosts; set `HF_HUB_DISABLE_XET=1` if the Xet protocol
  stalls. The first voice run downloads the model.
- **spaCy model for misaki** — download `en_core_web_sm` from the Hugging Face mirror `spacy/en_core_web_sm`; its
  default host is GitHub. See `requirements.txt` and `docs/LESSONS.md`.
- **Kokoro speed is not linear** — pick the closest take, then `ffmpeg atempo` and scale `words.json` (see
  `docs/LESSONS.md`).
- **Custom names are mispronounced** — add them to the project's `pronunciations.json` (misaki US phoneme alphabet).
- **Out of memory / fans** — 8 GB machines: `--workers 1` or `2`; close other browser windows.

## Licences

Files derived from the `cartoon-3d-short` skill templates are MIT (`LICENSES/cartoon-3d-short-MIT.txt`).
