#!/usr/bin/env python3
"""Compare a look frame with glow on/off on the character mask; report the max diff and the world-ink floor."""
import json
import sys

import numpy as np
from PIL import Image

glow, noglow, mask_path = sys.argv[1], sys.argv[2], sys.argv[3]
a = np.asarray(Image.open(glow).convert("RGB"), dtype=np.int16)
b = np.asarray(Image.open(noglow).convert("RGB"), dtype=np.int16)
m = np.asarray(Image.open(mask_path).convert("L")) >= 250
d = np.abs(a - b).max(2)
l = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255.0
print(json.dumps({
    "max": int(d[m].max()) if m.any() else 0,
    "mean": round(float(d[m].mean()) if m.any() else 0.0, 3),
    "over2": int((d[m] > 2).sum()) if m.any() else 0,
    "mask_pixels": int(m.sum()),
    "ink_min": round(float(l.min()), 4),
    "ink_p1": round(float(np.percentile(l, 1)), 4),
}))
