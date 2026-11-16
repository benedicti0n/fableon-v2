"""Full-resolution grayscale comparison of two still folders.
usage: python tests/compare_full.py <dirA> <dirB> <frame,frame,...>  -> JSON [{frame,mad}, ...]
"""
import json
import os
import sys

import numpy as np
from PIL import Image

a_dir, b_dir, csv = sys.argv[1], sys.argv[2], sys.argv[3]
out = []
for f in [int(x) for x in csv.split(",") if x]:
    a = Image.open(os.path.join(a_dir, f"f_{f}.jpg")).convert("L")
    b = Image.open(os.path.join(b_dir, f"f_{f}.jpg")).convert("L")
    if a.size != b.size:
        raise SystemExit(f"frame {f}: size {a.size} != {b.size}")
    mad = float(np.abs(np.asarray(a, np.float32) - np.asarray(b, np.float32)).mean())
    out.append({"frame": f, "mad": round(mad, 4)})
print(json.dumps(out))
