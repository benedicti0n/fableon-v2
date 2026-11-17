"""Compose the Fableon cast sheet: a labelled grid of the group and solo stills."""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

spec = json.load(open(sys.argv[1]))
images = spec["images"]
out = spec["out"]
W, H, label_h, header = 270, 480, 28, 40
cols = 3
rows = (len(images) + cols - 1) // cols
sheet = Image.new("RGB", (W * cols, header + rows * (H + label_h)), (20, 20, 24))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    hfont = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 18)
except Exception:
    font = ImageFont.load_default()
    hfont = font
for i, item in enumerate(images):
    x = (i % cols) * W
    y = header + (i // cols) * (H + label_h)
    im = Image.open(item["path"]).convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 6, y + H + 4), item["label"], fill=(235, 235, 240), font=font)
d.text((8, 8), "Fableon cast sheet", fill=(255, 255, 255), font=hfont)
if sheet.height > 1600:
    k = 1600 / sheet.height
    sheet = sheet.resize((max(1, int(sheet.width * k)), 1600), Image.LANCZOS)
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out, quality=88, optimize=True)
print(f"cast sheet: {out} ({os.path.getsize(out)} bytes, {sheet.size[0]}x{sheet.size[1]})")
