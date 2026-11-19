#!/usr/bin/env python3
"""No-fringe check: 1-3 px outside the character coverage must match the world-only render.

Usage: fringe_check.py <look.png> <hidden.png> <mask.png> <x0> <x1> <y0> <y1>
The mask is the soft coverage of the character. The hidden render removes that actor. On pixels outside the coverage
(alpha 0) but within 3 px of it, the look frame must equal the hidden frame: no dilated ring, no card fringe.
"""
import json
import sys

import numpy as np
from PIL import Image

look, hidden, mask = sys.argv[1], sys.argv[2], sys.argv[3]
x0, x1, y0, y1 = (int(v) for v in sys.argv[4:8])
a = np.asarray(Image.open(look).convert("RGB"), dtype=np.int16)[y0:y1, x0:x1]
b = np.asarray(Image.open(hidden).convert("RGB"), dtype=np.int16)[y0:y1, x0:x1]
m = np.asarray(Image.open(mask).convert("L"))[y0:y1, x0:x1]
solid = m > 0
near = solid.copy()
for _ in range(3):
    p = np.pad(near, 1, mode="constant", constant_values=False)
    near = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
ring = near & ~solid
d = np.abs(a - b).max(2)[ring]
soft = (m > 0) & (m < 255)
out = {
    "ring_pixels": int(ring.sum()),
    "diff_max": int(d.max()) if d.size else 0,
    "diff_mean": round(float(d.mean()), 3) if d.size else 0.0,
    "diff_p99": int(np.percentile(d, 99)) if d.size else 0,
    "over3": int((d > 3).sum()) if d.size else 0,
    "over1": int((d > 1).sum()) if d.size else 0,
    "soft_pixels": int(soft.sum()),
}
out["ok"] = out["ring_pixels"] > 100 and out["diff_max"] <= 3 and out["over3"] == 0
print(json.dumps(out))
