#!/usr/bin/env python3
"""Compose a look-dev contact sheet from a manifest of scene/mood stills."""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

manifest = json.load(open(sys.argv[1]))
cells = manifest["cells"]
out = manifest["out"]
scenes = []
for c in cells:
    if c["scene"] not in scenes:
        scenes.append(c["scene"])
cols = 3
cell_w, cell_h = 270, 480
label_h = 30
sheet_w = cols * cell_w
sheet_h = len(scenes) * (cell_h + label_h) + 46
# keep the page <= 1600 px tall
scale = min(1.0, 1600 / sheet_h)
if scale < 1:
    cell_w, cell_h, label_h = int(cell_w * scale), int(cell_h * scale), max(18, int(label_h * scale))
    sheet_w = cols * cell_w
    sheet_h = len(scenes) * (cell_h + label_h) + int(46 * scale)
img = Image.new("RGB", (sheet_w, sheet_h), (18, 16, 24))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", max(12, int(15 * scale)))
    title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", max(16, int(21 * scale)))
except Exception:
    font = ImageFont.load_default()
    title_font = font
d.text((12, 10), f"Look-dev — {manifest.get('title', '')}", fill=(245, 238, 220), font=title_font)
for r, scene in enumerate(scenes):
    row = [c for c in cells if c["scene"] == scene]
    row = sorted(row, key=lambda c: (not c.get("pick"), c["mood"]))
    y = int(46 * scale) + r * (cell_h + label_h)
    for i, c in enumerate(row[:cols]):
        im = Image.open(c["path"]).convert("RGB")
        im.thumbnail((cell_w, cell_h))
        x = i * cell_w + (cell_w - im.width) // 2
        img.paste(im, (x, y))
        label = f"{scene} · {c['mood']}" + ("  (pick)" if c.get("pick") else "")
        d.rectangle([i * cell_w, y + cell_h, (i + 1) * cell_w, y + cell_h + label_h], fill=(28, 24, 34))
        d.text((i * cell_w + 6, y + cell_h + 5), label, fill=(255, 226, 170) if c.get("pick") else (220, 220, 230), font=font)
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, quality=90)
print(f"lookdev sheet: {out} ({img.width}x{img.height}, {len(scenes)} scenes)")
