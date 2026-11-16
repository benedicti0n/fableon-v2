"""Absolute RGB difference between two frames, amplified x8 (for `fableon diff`).
usage: python tools/qa/frame_diff.py <a.jpg> <b.jpg> <heat.png>
"""
import sys

from PIL import Image, ImageChops

a = Image.open(sys.argv[1]).convert("RGB")
b = Image.open(sys.argv[2]).convert("RGB")
if a.size != b.size:
    raise SystemExit(f"size mismatch {a.size} != {b.size}")
d = ImageChops.difference(a, b)
Image.eval(d, lambda v: min(255, v * 8)).save(sys.argv[3])
