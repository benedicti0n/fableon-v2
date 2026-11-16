# Benchmarks

Machine: Apple M1 (8-core CPU / 8-core GPU, 8 GB), macOS 26.5 (Darwin 25.5.0), Node 25.9.0.
Chromium: Playwright 1.56.1, Chromium 141.0.7390.37 (build 1194) + its headless shell.

WebGL renderer strings reported by `window.GLINFO`:

| `RENDER_GL` | Renderer |
|---|---|
| `gpu` (default) | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` |
| `default` | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) …), SwiftShader driver)` |
| `swiftshader` | same SwiftShader string as above |

## Launch flags at 1440x2560 (final size), MSAA 0

Five stills (frames 60, 640, 1065, 1880, 2230), one browser launch per run, wall time includes shader
warm-up and JPEG encode. Runs repeated twice where the set was competitive.

| Launch set | `RENDER_GL` | Wall, 5 stills | s/still |
|---|---|---:|---:|
| Playwright headless shell, no GPU flags | `default` | 12.16 s / 12.28 s | 2.43 / 2.46 |
| Headless shell + `--enable-gpu` (ANGLE Metal) | `shell` | 2.77 s | 0.55 |
| New headless Chromium + `--enable-gpu` (ANGLE Metal) | `chromium` | 1.89 s / 1.79 s | 0.38 / 0.36 |
| New headless Chromium + `--use-angle=metal` | `chromium-metal`, `gpu` | 1.82 s / 1.85 s | 0.36 / 0.37 |
| New headless Chromium + `--use-angle=gl` (OpenGL 4.1) | `chromium-gl` | 3.54 s | 0.71 |
| Headless shell + forced SwiftShader | `swiftshader` | 19.50 s | 3.90 |

Per-frame steady state (after warm-up) at 1440x2560 is 0.04–0.11 s of GPU work plus ~0.03 s JPEG encode.

**Default chosen for macOS:** `gpu` = new headless Chromium (`channel: 'chromium'`) + `--ignore-gpu-blocklist
--enable-gpu --use-angle=metal`. It is the fastest set that consistently reports the Metal renderer. Plain
`--enable-gpu` is within noise; the explicit Metal flag makes the backend deterministic. The Playwright headless
shell also reaches Metal but pays ~0.55 s/still; with no flags at all Chromium silently falls back to SwiftShader
(~7x slower), which is why `render.cjs` warns when that happens.

Other platforms: `gpu` uses `--use-angle=d3d11` on Windows and no extra ANGLE flag on Linux (untested here);
`RENDER_GL=swiftshader` remains the software fallback everywhere.

## Full pipeline

Phase 1 acceptance run on the machine above: `fableon all --project work/adi --quality preview --workers 2`
(39 shots, 3639 frames, 121.3 s of film).

| Stage | Time | Notes |
|---|---:|---|
| shots (list + qa + cuts) | 1.2 s | three browser launches |
| preview render | 55 s | 2 workers, 0.03 s/frame wall (~0.06 s/frame/worker); 106 MB of clips |
| audio mix | 20 s | score + sfx + limiter, −14.5 LUFS, −1.3 dBTP |
| assemble | 5 s | concat + AAC mux, 48 MB `final.mp4` |
| QA (3639 frames) | 41 s | report + 61 contact sheets, 21 MB |
| **`fableon all` total** | **129 s** | warm run; 152 s on the first (cold shader cache) run; `work/adi` is 316 MB |

Steady-state stills at 540x960 are ~0.03–0.05 s/frame per worker with the Metal path.

## Phase 2A — storyboard mode and final quality

The storyboard interpreter adds a validation pass and, for the 10 ported shots, the same camera/actor/effect calls as
story.ts (parity: 80 frames, max MAD 0.000). Timings on the same M1, 2 workers:

| Run | Wall | Render stage | Notes |
|---|---:|---:|---|
| preview 540x960, `work/adi` | 186.5 s | 55 s | storyboard mode; QA PASS, identical summary to Phase 1; 50 MB `final.mp4` |
| **final 1440x2560, `work/adi-final`** | **626.8 s** | **520 s** | 3639 frames at 0.143 s/frame wall (~0.286 s/frame/worker); peak summed RSS ~1.1 GB (sampled); QA PASS |

Final outputs: 1440x2560, 30 fps, 3639 frames, 121.300 s, AAC 48 kHz; `final.mp4` 183 MB; project folder 685 MB
(render clips 349 MB, audio 133 MB, QA sheets 21 MB). The full final render completed with 2 workers on the 8 GB
machine; memory did not force a fallback to `--workers 1`.
