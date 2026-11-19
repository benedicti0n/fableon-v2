# Measured look check

- video: `final.mp4`
- targets: {"golden-glow": {"split": 0.35, "glow": [0.0, 0.06], "mean": [0.32, 0.55], "std": [0.14, 0.3], "p2": [0.05, 0.25], "p98": [0.75, 1.0]}, "warm-side": {"split": 0.05, "glow": [0.0, 0.06], "mean": [0.3, 0.65], "std": [0.12, 0.3], "p2": [0.05, 0.35], "p98": [0.7, 1.0]}, "dusk": {"split": 0.35, "glow": [0.0, 0.06], "mean": [0.25, 0.52], "std": [0.12, 0.3], "p2": [0.03, 0.2], "p98": [0.7, 1.0]}, "night-moon": {"split": 0.03, "glow": [0.0, 0.02], "mean": [0.12, 0.4], "std": [0.07, 0.22], "p2": [0.02, 0.15], "p98": [0.25, 0.8]}, "noon": {"split": 0.05, "glow": [0.0, 0.04], "mean": [0.35, 0.65], "std": [0.12, 0.3], "p2": [0.04, 0.3], "p98": [0.75, 1.0]}}
- glow: share of luma > 0.9 outside the character mask

| scene | mood | split | glow | mean | std | p2 | p98 | face | issues |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| palace-day | warm-side | 0.26 | 0.0% | 0.55 | 0.14 | 0.19 | 0.80 | 0.44 | ok |
| hermitage-day | warm-side | 0.68 | 0.0% | 0.34 | 0.22 | 0.09 | 0.80 | 0.40 | ok |
| village-day | warm-side | 0.41 | 3.3% | 0.48 | 0.17 | 0.15 | 0.94 | 0.39 | ok |
| deer-golden | dusk | 0.64 | 0.0% | 0.26 | 0.18 | 0.07 | 0.67 | 0.17 | p98 0.67 outside 0.70-1.00 |
| village-golden | dusk | 0.55 | 0.6% | 0.40 | 0.18 | 0.18 | 0.84 | 0.17 | face 0.17 vs frame 0.40 |
| deer-night | night-moon | 0.05 | 0.0% | 0.28 | 0.09 | 0.11 | 0.45 | 0.44 | ok |

## Warnings

- flat light deer-golden: p98 0.67 outside 0.70-1.00
- flat light village-golden: face 0.17 vs frame 0.40
