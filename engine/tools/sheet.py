# contact sheet: python3 engine/sheet.py out.jpg cols img... (labels = frame numbers from the file names)
import sys, re
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
S = Image.new("RGB", (cols * (w + 6), rows * (h + 26)), "white")
d = ImageDraw.Draw(S)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * (w + 6), (i // cols) * (h + 26)
    S.paste(im, (x, y + 22)); d.text((x + 4, y + 4), re.sub(r".*_(\d+)\.jpg", r"\1", f), fill="black")
S.save(out, quality=85)
