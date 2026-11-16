"""Compose fableon per-key review sheets (and optional per-shot splits)."""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

spec = json.load(open(sys.argv[1]))
left, right, cover, out, split, split_dir = spec["left"], spec.get("right"), spec.get("coverage"), spec["out"], spec.get("split"), spec.get("splitDir")
W, H, label_h, header = 270, 480, 30, 40
max_frames = max(len(r["frames"]) for r in spec["rows"])
cols = max_frames * (1 + (1 if right else 0) + (1 if cover else 0))
rows = spec["rows"]
sheet = Image.new("RGB", (W * cols, header + len(rows) * (H + label_h)), (20, 20, 24))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
    hfont = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 17)
except Exception:
    font = ImageFont.load_default()
    hfont = font
for ri, row in enumerate(rows):
    y = header + ri * (H + label_h)
    x = 0
    for f in row["frames"]:
        sources = [(left, "compiled")] + ([(right, "compare")] if right else []) + ([(cover, "coverage")] if cover else [])
        for prefix, label in sources:
            path = f"{prefix}{f}.jpg" if label != "coverage" else os.path.join(prefix, f"{f}.png")
            im = Image.open(path).convert("RGB") if os.path.exists(path) else Image.new("RGB", (W, H), (80, 0, 0))
            if im.size != (W, H):
                im = im.resize((W, H), Image.NEAREST)
            sheet.paste(im, (x, y))
            d.text((x + 4, y + 4), f"{label} f{f}", fill=(255, 220, 120), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
            x += W
    d.text((4, y + H + 4), row["label"], fill=(230, 230, 235), font=font)
d.text((8, 8), "Fableon review: compiled / comparison / coverage, per camera key (settle + end-2)", fill=(255, 255, 255), font=hfont)
sheet.save(out, quality=88, optimize=True)
print(f"review sheet: {out} ({os.path.getsize(out)} bytes, {sheet.size[0]}x{sheet.size[1]})")
if split:
    os.makedirs(split_dir, exist_ok=True)
    by_shot = {}
    for ri, row in enumerate(rows): by_shot.setdefault(row["shot"], []).append(ri)
    for shot, idx in by_shot.items():
        top = header + min(idx) * (H + label_h); bottom = header + (max(idx) + 1) * (H + label_h)
        im = sheet.crop((0, top, W * cols, bottom))
        if im.height > 1600:
            k = 1600 / im.height; im = im.resize((max(1, int(im.width * k)), 1600), Image.LANCZOS)
        im.save(os.path.join(split_dir, f"{shot}.jpg"), quality=88, optimize=True)
    print(f"review split: {len(by_shot)} shot images in {split_dir}")
