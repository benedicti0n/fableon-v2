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
rows_per_page = 3
base, ext = os.path.splitext(out)
os.makedirs(os.path.dirname(out), exist_ok=True)
for page, first in enumerate(range(0, len(scenes), rows_per_page), start=1):
    part = scenes[first:first + rows_per_page]
    sheet_w = cols * cell_w
    sheet_h = len(part) * (cell_h + label_h) + 46
    img = Image.new("RGB", (sheet_w, sheet_h), (18, 16, 24))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
        title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 21)
    except Exception:
        font = ImageFont.load_default()
        title_font = font
    d.text((12, 10), f"Look-dev — {manifest.get('title', '')} ({page})", fill=(245, 238, 220), font=title_font)
    for r, scene in enumerate(part):
        row = [c for c in cells if c["scene"] == scene]
        row = sorted(row, key=lambda c: (not c.get("pick"), c["mood"]))
        y = 46 + r * (cell_h + label_h)
        for i, c in enumerate(row[:cols]):
            im = Image.open(c["path"]).convert("RGB")
            im.thumbnail((cell_w, cell_h))
            img.paste(im, (i * cell_w + (cell_w - im.width) // 2, y))
            label = f"{scene} · {c['mood']}" + ("  (pick)" if c.get("pick") else "")
            d.rectangle([i * cell_w, y + cell_h, (i + 1) * cell_w, y + cell_h + label_h], fill=(28, 24, 34))
            d.text((i * cell_w + 6, y + cell_h + 5), label, fill=(255, 226, 170) if c.get("pick") else (220, 220, 230), font=font)
    path = out if page == 1 else f"{base}-{page}{ext}"
    img.save(path, quality=90)
    print(f"lookdev sheet: {path} ({img.width}x{img.height}, {len(part)} scenes)")
