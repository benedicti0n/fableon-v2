"""Compose fableon review sheets from a render manifest (start/mid/end pairs)."""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

spec = json.load(open(sys.argv[1]))
left, right, out = spec["left"], spec.get("right"), spec["out"]
W, H, label_h, header = 270, 480, 26, 36
cols = 6 if right else 3
shots = spec["shots"]
sheet = Image.new("RGB", (W * cols, header + len(shots) * (H + label_h)), (20, 20, 24))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    hfont = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 18)
except Exception:
    font = ImageFont.load_default()
    hfont = font
for row, shot in enumerate(shots):
    y = header + row * (H + label_h)
    x = 0
    for f in shot["frames"]:
        pairs = [(left, "compiled")] + ([(right, "fixture")] if right else [])
        for prefix, label in pairs:
            path = f"{prefix}{f}.jpg"
            im = Image.open(path).convert("RGB") if os.path.exists(path) else Image.new("RGB", (W, H), (80, 0, 0))
            sheet.paste(im, (x, y))
            d.text((x + 4, y + 4), f"{shot['id']} f{f} {label}", fill=(255, 220, 120), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
            x += W
    d.text((4, y + H + 3), f"{shot['id']}  frames {shot['frames'][0]} / {shot['frames'][1]} / {shot['frames'][2]}", fill=(230, 230, 235), font=font)
d.text((8, 8), "Fableon review: compiled (left of each pair) vs comparison (right)", fill=(255, 255, 255), font=hfont)
sheet.save(out, quality=88, optimize=True)
print(f"review sheet: {out} ({os.path.getsize(out)} bytes, {sheet.size[0]}x{sheet.size[1]})")
