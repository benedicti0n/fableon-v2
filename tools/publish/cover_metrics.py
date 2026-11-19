# Deterministic cover image metrics: Laplacian variance, contrast and saturation.
import json, sys
import numpy as np
from PIL import Image
rows = []
for path in sys.argv[1:]:
    im = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    gray = 0.2126 * im[:, :, 0] + 0.7152 * im[:, :, 1] + 0.0722 * im[:, :, 2]
    lap = (-4 * gray[1:-1, 1:-1] + gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:])
    sharp = float(lap.var())
    contrast = float(gray.std())
    mx = im.max(axis=2); mn = im.min(axis=2)
    sat = float(np.mean(np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)))
    rows.append({"path": path, "sharpness": sharp, "contrast": contrast, "saturation": sat})
print(json.dumps(rows))
