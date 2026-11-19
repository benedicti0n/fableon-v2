# Measured look check

- video: `final.mp4`
- targets: {"golden-glow": {"split": 0.35, "glow": [0.0, 0.06], "mean": [0.32, 0.55], "std": [0.14, 0.3], "p2": [0.05, 0.25], "p98": [0.75, 1.0]}, "warm-side": {"split": 0.05, "glow": [0.0, 0.06], "mean": [0.3, 0.65], "std": [0.12, 0.3], "p2": [0.05, 0.35], "p98": [0.7, 1.0]}, "dusk": {"split": 0.35, "glow": [0.0, 0.06], "mean": [0.25, 0.52], "std": [0.12, 0.3], "p2": [0.03, 0.2], "p98": [0.7, 1.0]}, "night-moon": {"split": 0.03, "glow": [0.0, 0.02], "mean": [0.12, 0.4], "std": [0.07, 0.22], "p2": [0.02, 0.15], "p98": [0.25, 0.8]}, "noon": {"split": 0.05, "glow": [0.0, 0.04], "mean": [0.35, 0.65], "std": [0.12, 0.3], "p2": [0.04, 0.3], "p98": [0.75, 1.0]}}
- glow: share of luma > 0.9 outside the character mask

| scene | mood | split | glow | mean | std | p2 | p98 | face | issues |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| village-day | golden-glow | 0.64 | 0.0% | 0.42 | 0.13 | 0.16 | 0.76 | 0.45 | std 0.13 outside 0.14-0.30 |
| hermitage-day | golden-glow | 0.74 | 0.3% | 0.40 | 0.20 | 0.14 | 0.82 | 0.10 | face 0.10 vs frame 0.40 |
| village-day | dusk | 0.53 | 0.2% | 0.34 | 0.15 | 0.10 | 0.74 | 0.47 | ok |

## Warnings

- flat light village-day: std 0.13 outside 0.14-0.30
- flat light hermitage-day: face 0.10 vs frame 0.40
