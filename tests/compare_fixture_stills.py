"""Compare final-quality fixture stills with pre-Phase-7 references at native size.
usage: python tests/compare_fixture_stills.py <stills-dir> <reference-dir> <frame,...>
"""
import json, os, sys
import numpy as np
from PIL import Image
stills, refs = sys.argv[1], sys.argv[2]
frames = [int(x) for x in sys.argv[3].split(',') if x]
out = []
for f in frames:
    a = Image.open(os.path.join(stills, f'f_{f}.jpg')).convert('L')
    b = Image.open(os.path.join(refs, f'frame_{f}.jpg')).convert('L')
    if a.size != b.size:
        raise SystemExit(f'{f}: size mismatch {a.size} != {b.size}')
    mad = float(np.abs(np.asarray(a, np.float32) - np.asarray(b, np.float32)).mean())
    out.append({'frame': f, 'mad': round(mad, 3), 'max': round(float(np.abs(np.asarray(a, np.float32) - np.asarray(b, np.float32)).max()), 1)})
print(json.dumps({'frames': out, 'max': max(x['mad'] for x in out), 'limit': 1.0}))
