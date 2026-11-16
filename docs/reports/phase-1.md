# Phase 1 report

## Summary

The seed is now reproducible on this machine with one CLI. `fableon doctor` checks the whole toolchain; `fableon init`
+ `fableon all` rebuild the Adi Parva fixture film (3639 frames, 121.3 s) at preview quality in 129 s with two workers,
including audio, assembly and frame QA. The renderer now uses the M1 GPU through new-headless Chromium + ANGLE Metal
(0.36 s/still at 1440x2560 instead of 2.4 s on the default SwiftShader fallback). The frame driver takes named flags,
build/assemble are Node scripts, and `npm test` guards the 9 reference stills and the mix metrics.

## Commits

| # | Hash | Message | What / why (one line) |
|---|---|---|---|
| F1 | `cab5e17` | `chore(repo): npm workspace and tooling` | Root workspace (`engine`, `cli`), root scripts, single lockfile, Python 3.12 venv docs, pillow. |
| F2 | `3c3b87c` | `refactor(engine): named flags for render.cjs` | Named flags for stills/video/segments/list/qa/cuts; `build.mjs` + `assemble.mjs` replace bash. |
| F3 | `c7e307a` | `feat(engine): report the WebGL backend and pick fast GPU flags` | `window.GLINFO`, GL print/warn, Metal launch set measured and made the default; BENCHMARKS. |
| F4 | `4e350eb` | `feat(cli): fableon CLI skeleton and doctor` | `cli/` package, `fableon` binary, 8 environment checks with fixes. |
| F5 | `8c097fe` | `feat(cli): project workspace and pipeline commands` | init/voice/shots/stills/render/audio/assemble/qa/all, balanced workers, resume, detach. |
| F6 | `d80ad0d` | `test: regression tests for stills and audio` | `npm test`: typecheck + 9 stills (MAD ≤ 6.0) + mix duration/loudness. |
| F7 | `e6201a7` | `docs: setup, CLI usage and benchmarks` | README install/quickstart/CLI/troubleshooting, AGENTS Running section, measured benchmarks. |
| F8 | this commit | `docs(report): phase 1 report` | This report. |

## Acceptance checks

### 1. Clean clone → install → doctor

The clone was made from the committed tree; Playwright and the Python packages are cached machine-wide, so the clone
reused the existing `.venv` through `FABLEON_PYTHON` instead of downloading ~2 GB of wheels again.

```text
$ git clone . $T/fableon && cd $T/fableon
$ npm install
$ npm run build
$ (cd engine && npx playwright install chromium)
$ FABLEON_PYTHON=<repo>/.venv/bin/python npx fableon doctor
fableon doctor

  OK   Node 25.9.0
  OK   Python 3.12.16  —  /Users/benediction/Downloads/Web Dev projects/fableon-v2/.venv/bin/python
  OK   Python packages  —  kokoro, numpy 1.26.4, scipy 1.14.1, soundfile, pillow 13.0.0
  OK   ffmpeg  —  ffmpeg version 8.1.1 …
  OK   ffprobe  —  ffprobe version 8.1.1 …
  OK   Playwright Chromium + WebGL  —  ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)
  OK   Engine dist  —  built and fresh
  OK   Free disk space  —  10.6 GB free

8/8 checks OK
```

**PASS.**

### 2. `npm test`

```text
$ npm test
PASS typecheck
  frame 60:   mean abs diff 1.000 (limit 6)
  frame 640:  mean abs diff 1.809 (limit 6)
  frame 1065: mean abs diff 1.281 (limit 6)
  frame 1880: mean abs diff 1.308 (limit 6)
  frame 2230: mean abs diff 0.738 (limit 6)
  frame 2480: mean abs diff 0.802 (limit 6)
  frame 2850: mean abs diff 0.597 (limit 6)
  frame 3430: mean abs diff 0.761 (limit 6)
  frame 3600: mean abs diff 0.819 (limit 6)
PASS stills  max 1.809 <= 6 on 0-255 grayscale
PASS audio duration  121.300 s (want 121.30 ± 0.05)
PASS audio loudness  -14.52 LUFS (want -14.5 ± 0.5)
all checks passed
```

**PASS** (24.5 s). The GPU stills differ from the SwiftShader references by 0.6–1.8 levels; visually identical.

### 3. `fableon init adi` → `fableon all`

```text
$ npx fableon init adi --from fixtures/adi-parva
init: …/work/adi (6 files from adi-parva)
  SCRIPT.md pronunciations.json qa_meta.json shots.json voice.wav words.json

$ npx fableon all --project work/adi --quality preview --workers 2
… render: 39 clips, 3639 frames, 2 worker(s) [1820 + 1819 frames]
… mix -14.5 LUFS, TP -1.30 dBTP, music -33.1, voice -24.1, len 121.300s
… stream|codec_name=h264|width=540|height=960|r_frame_rate=30/1|nb_frames=3639|
… stream|codec_name=aac|r_frame_rate=0/0|nb_frames=5687
… format|duration=121.300000
… SPECS 540x960 30/1 fps, 3639 frames, 121.300 s; audio: aac 48000 Hz 2ch
… LOUDNESS I: -14.5 LUFS | LRA: 1.6 LU | Peak: -1.3 dBFS
… FRAMES 3639; black []; unplanned white []; frozen spans >=12f []
… known intended pops (fixture): 1249, 2152, 2715
… unexplained pops: none
… Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
… all: done — …/work/adi/final.mp4
real 128.88
```

**PASS.** `qa/summary.md` has no black/white/frozen frames and only the three known intended pops. A second render
was also tested for resume + `--detach`: one deleted clip was rendered by a detached process after the CLI exited in
0.32 s, and the other 38 clips were skipped.

### 4. Benchmarks

`docs/BENCHMARKS.md` records the machine, the renderer string and every launch set. Key numbers:

- Default no-flag Chromium: SwiftShader, 2.4 s/still at 1440x2560.
- Default `gpu` = new-headless Chromium + `--use-angle=metal`: 0.36–0.37 s/still over 5 final-size stills
  (1.8–1.9 s total), steady GPU work 0.04–0.11 s + ~0.03 s JPEG encode.
- Preview render: 3639 frames in ~55 s with 2 workers = **0.03 s/frame wall** (~0.06 s/frame/worker).
- Full `fableon all`: **129 s** warm (152 s on the first cold run); outputs 316 MB.

**PASS.**

### 5. Commit order

```text
e6201a7 docs: setup, CLI usage and benchmarks
d80ad0d test: regression tests for stills and audio
8c097fe feat(cli): project workspace and pipeline commands
4e350eb feat(cli): fableon CLI skeleton and doctor
c7e307a feat(engine): report the WebGL backend and pick fast GPU flags
3c3b87c refactor(engine): named flags for render.cjs
cab5e17 chore(repo): npm workspace and tooling
```

(The F8 commit is this report.) **PASS.**

## Measurements

- OS: macOS 26.5 (Darwin 25.5.0), Apple M1 (8-core CPU / 8-core GPU), 8 GB RAM, 11 GB free at the start.
- WebGL: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` via Chromium 141.0.7390.37,
  new-headless (`channel: 'chromium'`).
- Stills 1440x2560: 0.36–0.37 s (5 stills, including shader warm-up and JPEG encode).
- Stills/preview 540x960: ~0.03–0.05 s/frame per worker.
- Full preview render: 3639 frames in ~55 s (2 workers); whole pipeline 129 s; QA scan 41 s.
- Disk: `work/adi` 316 MB (render 106 MB, audio 133 MB, QA contact sheets 21 MB); `final.mp4` 48 MB.
- Audio: −14.5 LUFS integrated, −1.3 dBTP, 121.300 s, AAC 48 kHz stereo.

## Deviations from the prompt

1. **Three known QA pops are allowlisted in `qa`.** The prompt says to subtract planned camera cuts; the acceptance
   criteria allow the three intended pops 1249, 2152, 2715. They are not camera cuts, so `qa/summary.md` reports them
   as "known intended pops (fixture)" and fails on any other pop. This is explicit in `cli/src/pipeline.js` and must
   be removed when custom projects arrive.
2. **Single root lockfile.** `engine/package-lock.json` was deleted when the npm workspace was introduced; the root
   `package-lock.json` is authoritative.
3. **Doctor also checks that `engine/dist/` is newer than `engine/src/`** (not only that it exists), because a stale
   bundle silently renders old code.
4. **Stills comparison resizes both images** to 135x240 (prompt wording could be read as resizing only one); the
   threshold is unchanged at ≤ 6.0.
5. **Clean-clone acceptance reused the existing `.venv`** via `FABLEON_PYTHON` rather than re-downloading the Python
   stack (same 3.12 interpreter, packages verified by doctor).
6. **The Windows/Linux GPU flag sets were not measured here.** `gpu` uses `--use-angle=d3d11` on Windows and the
   Chromium default on Linux; only the macOS Metal path is benchmarked.

## Problems and open questions

- Chromium logs `GL_INVALID_OPERATION: glDrawArrays: Feedback loop formed between Framebuffer and active Texture` once
  per shot. It is pre-existing prototype behaviour, does not change pixels, and is noisy in render logs; worth fixing
  when the post chain is next touched.
- `fableon voice` is implemented but was not exercised end-to-end: the fixture already ships narration, and running it
  would rewrite `words.json` and trip the Phase 1 timeline gate. Doctor proves the Kokoro imports; the next real voice
  test belongs to Phase 2/3 when custom scripts are allowed.
- The known-pop allowlist is fixture-specific (see deviation 1); it should disappear with the Phase 2 storyboard.
- The final-quality (1440x2560) pipeline was benchmarked with stills but not rendered end-to-end; only preview was
  required for acceptance.
- 8 GB RAM is enough with 2 workers, but 4 workers would need more memory (two Chromium instances were already
  ~1.5 GB peak).

## Please look at

- `work/adi/final.mp4` — the rebuilt film (gitignored), and `work/adi/qa/summary.md` + `work/adi/qa/sheet_*.jpg`.
- `docs/BENCHMARKS.md` — launch-set table; confirm the Metal default is what you want to ship.
- `cli/src/pipeline.js` — QA interpretation and render/progress/detach logic.
- `tests/run.mjs` + `tests/compare_stills.py` — regression thresholds.
