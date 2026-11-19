#!/usr/bin/env python3
"""Character behind a world occluder: the mask and the hidden-vs-visible frame must be clean on the occluder.

Usage: occlusion_check.py <visible.png> <hidden.png> <mask.png>
The camera/storyboard is fixed by tests/depth_mask.mjs. The hut post is the big vertical world column; the actor peeks
out to its left. On the post the mask is 0 and hiding the actor changes nothing; on the exposed actor it is 1 and
hiding the actor changes the frame.
"""
import json
import sys

import numpy as np
from PIL import Image

vis, hid, mask = sys.argv[1], sys.argv[2], sys.argv[3]
a = np.asarray(Image.open(vis).convert("RGB"), dtype=np.int16)
b = np.asarray(Image.open(hid).convert("RGB"), dtype=np.int16)
m = np.asarray(Image.open(mask).convert("L"))

# 540 x 960 frame: the near hut post is x 310-360, y 300-600; the exposed actor is x 240-285, y 400-540.
post = (310, 360, 300, 600)
actor = (240, 285, 400, 540)


def box(rect):
    x0, x1, y0, y1 = rect
    return (slice(y0, y1), slice(x0, x1))


pd = np.abs(a - b).max(2)[box(post)]
pm = m[box(post)]
ad = np.abs(a - b).max(2)[box(actor)]
am = m[box(actor)]

out = {
    "post": {"diff_max": int(pd.max()), "diff_over1": int((pd > 1).sum()), "mask_max": int(pm.max()), "mask_pixels": int((pm > 0).sum())},
    "actor": {"diff_max": int(ad.max()), "diff_over1": int((ad > 1).sum()), "mask_max": int(am.max()), "mask_pixels": int((am > 127).sum())},
}
out["ok"] = (
    out["post"]["diff_max"] <= 1
    and out["post"]["diff_over1"] == 0
    and out["post"]["mask_max"] == 0
    and out["actor"]["mask_max"] == 255
    and out["actor"]["mask_pixels"] > 100
    and out["actor"]["diff_over1"] > 100
)
print(json.dumps(out))
