import json, sys
from PIL import Image, ImageDraw, ImageFont

manifest = json.load(open(sys.argv[1]))
out = sys.argv[2]
THUMB = (360, 640)
BLOCK = 900
HEADER = 150
ROW = 730
rows = (len(manifest) + 1) // 2
W = BLOCK * 2 + 80
H = HEADER + rows * ROW + 40
sheet = Image.new("RGB", (W, H), "#f7f2e8")
d = ImageDraw.Draw(sheet)

def font(size, bold=False):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
              "/System/Library/Fonts/Supplemental/Arial.ttf",
              "/System/Library/Fonts/Helvetica.ttc"]:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

d.text((40, 40), "Fableon Phase 7 context sheet", fill="#1e1418", font=font(46, True))
d.text((40, 96), "Every iconography preset and new pose in the arena, 1440x2560 medium crops, day and golden light.", fill="#3a2a20", font=font(22))

for i, item in enumerate(manifest):
    col = i % 2
    row = i // 2
    x0 = 40 + col * BLOCK
    y0 = HEADER + row * ROW
    d.text((x0, y0), item["name"], fill="#1e1418", font=font(28, True))
    d.text((x0, y0 + 32), item["kind"], fill="#6a5a4a", font=font(18))
    for j, key in enumerate(["day", "golden"]):
        img = Image.open(item[key]).convert("RGB").resize(THUMB, Image.LANCZOS)
        x = x0 + j * (THUMB[0] + 30)
        y = y0 + 64
        sheet.paste(img, (x, y))
        d.rectangle([x, y, x + THUMB[0] - 1, y + THUMB[1] - 1], outline="#c9bba5", width=2)
        d.text((x + 8, y + 8), key, fill="#f7f2e8", font=font(20, True))

sheet.save(out, quality=88, optimize=True)
print(out)
