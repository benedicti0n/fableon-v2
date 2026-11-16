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

Filled in by the Phase 1 acceptance run (39 shots, 3639 frames, preview 540x960):

- preview render: _pending_ s/frame, _pending_ min total with 2 workers
- final render: measured above; not run end-to-end (time)
- `fableon all --quality preview --workers 2`: _pending_
