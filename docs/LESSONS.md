# Lessons from the prototype (read before touching the engine, voice or audio)

## Rendering
- Remotion + software WebGL cost ~3 s/frame of overhead on a CPU-only machine (plus ~30 s/frame for the original
  template scene). Driving the same three.js code from a plain page (`window.renderFrame(f)` → JPEG → ffmpeg) removed
  that overhead. On a machine with a GPU, measure before assuming anything.
- On CPU (SwiftShader) at 1440x2560: MSAA 4 alone cost ~3 s/frame, so the final uses MSAA 0 + an SMAA pass (the ink
  pass anti-aliases its own lines); lens blur taps were cut 64/32/16 → 40/16/12; anisotropic filtering did not matter.
  Result ~3.3 s/frame single process, ~2.9 s/frame effective with 2 workers.
- `gl.finish()` does not block in this setup; use a 1-pixel `readPixels` to time GPU work.
- Render per shot (`render.cjs segments`): a fix re-renders only the affected shots; clips are concatenated with
  `ffmpeg -f concat -c copy` and muxed with `-map 0:v:0 -map 1:a:0`.
- Long renders must survive the controlling process: run workers detached (`setsid nohup …`), skip clips that exist,
  write to `*.part.mp4` and rename on completion.

## Look / staging
- Template fx drawings have their own canvas sizes (fxSplash 800x800, fxPuff 300x300, fxStars 420x220, fxBurst 500x500):
  a smaller canvas clips them to nothing. Animated fx need the time step in their pool key.
- Golden backlight (sun az ~6°) turns huts and canopies into violet/navy silhouettes; side light (az ~105-115°) keeps the
  warm/violet split with lit faces. Night: cool moon key on the world + warm tint on the cards + desaturated world.
- Fire/glow cards need `fog: false` or night fog swallows them. Hide flame bases behind geometry (roof ledges, canopies).
- Anything computed from the world (e.g. treetop positions) must be read lazily: story modules load before the world is built.
- Most review findings were framing: characters out of frame, a pillar behind a face, random props in front of the lens,
  eyes too low in a vertical frame (aim the look point ~0.3 m below the eyes for a medium shot). This is why Phase 2
  adds an automatic framing solver and an in-frame validator.
- Ganesha (by tradition): broken tusk on HIS right, writes with his right hand, trunk turned to his left. The prototype
  draws him mirrored on purpose (`mirror: true`). Onion domes read as Mughal; use shikhara towers / pavilion roofs.

## Voice (Kokoro)
- Needs Python 3.12 (numpy 1.26.4) and scipy 1.14.1 (newer scipy requires numpy ≥ 2).
- Model download from Hugging Face: allow huggingface.co and its CDN hosts; `HF_HUB_DISABLE_XET=1` avoids the Xet protocol.
- misaki needs spaCy `en_core_web_sm`; its default download host is GitHub. Use the HF mirror `spacy/en_core_web_sm` and
  rename the wheel with its version (`en_core_web_sm-3.7.1-py3-none-any.whl`) before installing.
- Unknown names come out wrong: every proper noun goes into `pronunciations.json` (misaki US phoneme alphabet).
- Kokoro speed is not linear (same text: 1.3 → 130 s, 1.35 → 113 s, 1.4 → 109 s). Pick the closest take, then
  `ffmpeg atempo` (pitch-preserving) to the exact target length and scale `words.json` by the same factor.

## Audio
- Music bed: normalise AFTER ducking (bed ~9 LU under the voice). Master: −14 LUFS integrated, look-ahead limiter to
  −1.3 dBTP (measured on 4x oversampled peaks). Mix length must equal the video length exactly.

## QA
- `short_qa.py` flags every planned in-shot camera cut as a "pop"; export the camera cut frames (`render.cjs cuts`)
  and subtract them before reading the list.
