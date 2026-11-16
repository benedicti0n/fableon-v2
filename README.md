# Fableon

Local, stage-wise generator for vertical cartoon story shorts: flat 2D character cards lit inside a 3D three.js toon
world (ink outlines, lens blur, colour grade), synthesized narration (Kokoro), an original synthesized score and sound
effects. Every stage (brief → research → script → voice → storyboard → animatic → look & sound → render → QA/export)
produces an editable artifact and can use a different AI model.

**Status: seed (Phase 0).** The renderer, cast, sets, voice, audio and QA code come from a working prototype that made
one finished 121 s film (the Adi Parva short, kept as the regression fixture). See `docs/ARCHITECTURE.md` and
`docs/ROADMAP.md`. Coding agents: read `AGENTS.md` first.

## Requirements
- Node 20+, Python 3.12, ffmpeg on PATH.
- Chromium for Playwright: `cd engine && npx playwright install chromium`.
- Python packages: `pip install -r requirements.txt` (see the comments there for the spaCy model).
- First voice run downloads the Kokoro model from Hugging Face.

## Python environment
Use Python 3.12 in a project-local venv (uv or venv):
```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```
On Windows use `.venv\Scripts\python.exe -m pip install -r requirements.txt`. The `fableon` CLI finds Python via
`FABLEON_PYTHON` if set, else `.venv/bin/python` (`.venv\Scripts\python.exe` on Windows), else `python3`/`python`.

## Quick check (seed)
```bash
npm install && npm run typecheck && npm run build
node engine/scripts/render.cjs stills ../work/test/f_ 640 540 960 0     # compare with fixtures/adi-parva/reference-stills/frame_640.jpg
```
On a machine without a usable GPU set `RENDER_GL=swiftshader`.

## Licences
Files derived from the `cartoon-3d-short` skill templates are MIT (`LICENSES/cartoon-3d-short-MIT.txt`).
