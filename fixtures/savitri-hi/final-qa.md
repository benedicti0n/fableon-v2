# QA summary

- SPECS 1440x2560 30/1 fps, 2558 frames, 85.259 s; audio: aac 48000 Hz 2ch
- LOUDNESS I:         -14.2 LUFS | LRA:         2.5 LU | Peak:       -1.3 dBFS
- FRAMES 2558; black []; unplanned white []; frozen spans >=12f []
- planned events ignored (±3 frames; concat/encode has a 2-frame start offset): 34 frames from events.json
- pops reported by QA: 89, 509, 512, 717, 1366, 1640, 2086
- unexplained pops: none

Verdict: PASS (black 0, unplanned white 0, frozen spans 0, unexplained pops 0)
