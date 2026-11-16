"""Compare storyboard renders against the golden frames: grayscale at native size, mean absolute difference.
usage: python tests/compare_golden.py <stills-dir> <golden-dir> <frame:shot,...>   -> JSON on stdout
"""
import json
import os
import sys

import numpy as np
from PIL import Image

stills, golden = sys.argv[1], sys.argv[2]
pairs = [tuple(int(v) for v in p.split(":")) for p in sys.argv[3].split(",") if p]
out = []
for frame, shot in pairs:
    a = Image.open(os.path.join(stills, f"f_{frame}.jpg")).convert("L")
    b = Image.open(os.path.join(golden, f"shot_{shot:02d}.jpg")).convert("L")
    if a.size != b.size:
        raise SystemExit(f"shot {shot}: size mismatch {a.size} != {b.size}")
    mad = float(np.abs(np.asarray(a, np.float32) - np.asarray(b, np.float32)).mean())
    out.append({"shot": shot, "frame": frame, "mad": round(mad, 3)})
print(json.dumps({"shots": out, "max": max(x["mad"] for x in out), "limit": 1.0}))
