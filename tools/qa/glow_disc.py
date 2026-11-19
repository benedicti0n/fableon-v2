#!/usr/bin/env python3
"""White disc on a dark sky: post-glow centroid offset, monotonic radial falloff, no ring."""
import json
import sys

import numpy as np
from PIL import Image

glow, noglow = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(glow).convert("RGB"), dtype=np.float32) / 255.0
b = np.asarray(Image.open(noglow).convert("RGB"), dtype=np.float32) / 255.0
la = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
lb = 0.2126 * b[..., 0] + 0.7152 * b[..., 1] + 0.0722 * b[..., 2]
d = np.maximum(0.0, la - lb)
ys, xs = np.where(la > 0.98)
if not len(xs):
    print(json.dumps({"ok": False, "error": "no bright disc"})); sys.exit(0)
cx, cy = float(xs.mean()), float(ys.mean())
yy, xx = np.indices(d.shape)
r = np.hypot(xx - cx, yy - cy)
region = r < 200
w = d * region
gx = float((w * xx).sum() / max(1e-6, w.sum()))
gy = float((w * yy).sum() / max(1e-6, w.sum()))
offset = float(np.hypot(gx - cx, gy - cy))
prof = [float(d[(r >= R) & (r < R + 20)].mean()) for R in range(0, 220, 20)]
# The disc itself saturates: start at the halo maximum, then require monotonic falloff with no ring.
peak = int(np.argmax(prof))
mono = all(prof[i + 1] <= prof[i] + 0.001 for i in range(peak, len(prof) - 1))
ring = any(prof[i] > prof[i - 1] + 0.002 for i in range(peak + 1, len(prof)))
print(json.dumps({"ok": True, "disc_pixels": int(len(xs)), "offset": round(offset, 3), "profile": [round(v, 4) for v in prof], "peak": peak, "monotonic": bool(mono), "ring": bool(ring)}))
