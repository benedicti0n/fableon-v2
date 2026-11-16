"""Compare rendered stills with the fixture references: grayscale, resized to 135x240, mean absolute difference.
usage: python tests/compare_stills.py <stills-dir> <reference-dir> [frames...]   -> JSON on stdout
"""
import json
import os
import sys

import numpy as np
from PIL import Image

stills, refs = sys.argv[1], sys.argv[2]
frames = [int(f) for f in sys.argv[3:]] or sorted(int(f[6:-4]) for f in os.listdir(refs) if f.startswith("frame_") and f.endswith(".jpg"))
W, H = 135, 240
out = []
for f in frames:
    a = Image.open(os.path.join(stills, f"f_{f}.jpg")).convert("L").resize((W, H), Image.BILINEAR)
    b = Image.open(os.path.join(refs, f"frame_{f}.jpg")).convert("L").resize((W, H), Image.BILINEAR)
    mad = float(np.abs(np.asarray(a, np.float32) - np.asarray(b, np.float32)).mean())
    out.append({"frame": f, "mad": round(mad, 3)})
print(json.dumps({"frames": out, "max": max(x["mad"] for x in out), "limit": 6.0}))
