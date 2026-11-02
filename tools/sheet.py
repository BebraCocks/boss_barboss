"""Contact sheet of stills for the highlights review: each tile gets its scene label / time under it.
Usage: python3 tools/sheet.py OUT.jpg [--cols 3] [--width 360] still1.png[=label] still2.png[=label] ...
Labels are only on the sheet (for the chat), never in the video."""
import argparse
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("items", nargs="+")
ap.add_argument("--cols", type=int, default=3); ap.add_argument("--width", type=int, default=360)
a = ap.parse_args()
tiles = []
for it in a.items:
    path, _, label = it.partition("=")
    im = Image.open(path).convert("RGB")
    h = round(im.height * a.width / im.width)
    tiles.append((im.resize((a.width, h), Image.LANCZOS), label))
th = max(t.height for t, _ in tiles) + 40
rows = (len(tiles) + a.cols - 1) // a.cols
sheet = Image.new("RGB", (a.cols * a.width + (a.cols + 1) * 8, rows * th + (rows + 1) * 8), (24, 24, 28))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
except OSError:
    font = ImageFont.load_default()
for i, (t, label) in enumerate(tiles):
    x = 8 + (i % a.cols) * (a.width + 8); y = 8 + (i // a.cols) * (th + 8)
    sheet.paste(t, (x, y))
    d.text((x + 6, y + t.height + 8), label or str(i + 1), fill=(240, 240, 240), font=font)
sheet.save(a.out, quality=88)
print(a.out, sheet.size)
