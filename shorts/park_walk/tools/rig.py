"""Cut the character into rig parts: torso(+head), hanging arm (upper/lower), drawn legs (thigh/shin+shoe).
Writes PNGs to assets/parts/ and pivots (image px) to assets/parts/rig.json."""
import json, sys, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
from scipy import ndimage as nd

root = Path(sys.argv[1])
cut = np.asarray(Image.open(root / "assets/cut.png").convert("RGBA")).copy()
H, W, _ = cut.shape
alpha = cut[..., 3] > 0
out = root / "assets/parts"; out.mkdir(parents=True, exist_ok=True)
INK = (14, 6, 8, 255)

def poly_mask(pts):
    im = Image.new("L", (W, H), 0); ImageDraw.Draw(im).polygon(pts, fill=255)
    return np.asarray(im) > 0

# --- hanging arm (image right): region right of the torso/arm seam ---
arm_poly = [(772, 474), (905, 392), (1028, 392), (1028, 935), (872, 935), (850, 882), (836, 845), (835, 800),
            (838, 770), (845, 707), (846, 640), (839, 592), (821, 548), (792, 488)]
armR = alpha & poly_mask(arm_poly)
# --- raised arm (image left): everything left of the shoulder cut ---
armL = alpha & poly_mask([(0, 0), (392, 0), (392, 300), (386, 470), (372, 610), (300, 760), (0, 760)])
# --- pants below the hem ---
hx = [300, 333, 500, 680, 860, 900]; hy = [930, 937, 973, 973, 940, 935]
yy, xx = np.mgrid[0:H, 0:W]
hem = np.interp(xx, hx, hy)
pants = alpha & (yy > hem + 8)

torso_m = alpha & ~armR & ~armL & ~pants
torso = cut.copy(); torso[..., 3] = np.where(torso_m, 255, 0)
# ink along cut edges so the torso reads as closed where it was separated
removed = armL & alpha
edge = torso_m & nd.binary_dilation(removed, iterations=6)
torso[edge] = INK
# keep only the biggest torso component
lab, n = nd.label(torso_m); s = nd.sum(torso_m, lab, range(1, n + 1)); big = lab == 1 + int(np.argmax(s))
torso[..., 3] = np.where(big, 255, 0)
# stray background-green fringe pixels inside the shirt -> shirt pink (keep the green bow-tie button)
tr, tg, tb = (torso[..., i].astype(int) for i in range(3))
greenish = (tg > tr + 25) & (tg > tb + 15) & big
button = (np.abs(xx - 608) < 22) & (np.abs(yy - 418) < 22)
torso[greenish & ~button, :3] = (238, 113, 125)

def save_crop(rgba, name, pad=4):
    a = rgba[..., 3] > 0
    ys, xs = np.where(a); x0, x1, y0, y1 = xs.min() - pad, xs.max() + pad, ys.min() - pad, ys.max() + pad
    x0, y0 = max(x0, 0), max(y0, 0)
    Image.fromarray(rgba[y0:y1 + 1, x0:x1 + 1]).save(out / f"{name}.png")
    return [int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)]

rig = {"scale_px": 1.0, "parts": {}}
rig["parts"]["torso"] = {"box": save_crop(torso, "torso")}

# arm split at the elbow (overlap so the seam hides under the lower piece)
arm = cut.copy(); arm[..., 3] = np.where(armR, 255, 0)
EL = 655
up = arm.copy(); up[yy > EL + 18, 3] = 0
lo = arm.copy(); lo[yy < EL - 6, 3] = 0
rig["parts"]["arm_up"] = {"box": save_crop(up, "arm_up"), "pivot": [872, 478], "child": [905, EL]}
rig["parts"]["arm_lo"] = {"box": save_crop(lo, "arm_lo"), "pivot": [905, EL]}
rig["shoulder_R"] = [872, 478]

# --- legs, drawn in the cartoon's style (pants colour, thick ink, brown shoe) ---
PANTS = (202, 56, 0, 255); SHOE = (92, 50, 26, 255); SOLE = (40, 22, 12, 255)
def draw_piece(w, h, shape, name, pivot):
    S = 4  # supersample
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    shape(d, S)
    im = im.resize((w, h), Image.LANCZOS); im.save(out / f"{name}.png")
    rig["parts"][name] = {"size": [w, h], "pivot": pivot}

TW, TH = 190, 190   # thigh
def thigh(d, S):
    pts = [(10, 0), (TW - 10, 0), (TW - 22, TH - 30), (22, TH - 30)]
    d.rounded_rectangle([8 * S, -40 * S, (TW - 8) * S, (TH - 8) * S], radius=60 * S, fill=INK)
    d.rounded_rectangle([16 * S, -40 * S, (TW - 16) * S, (TH - 16) * S], radius=54 * S, fill=PANTS)
draw_piece(TW, TH, thigh, "thigh", [TW // 2, 30])
SW, SH = 190, 190   # shin (knee -> ankle)
def shin(d, S):
    cx = 95
    d.rounded_rectangle([(cx - 80) * S, -30 * S, (cx + 80) * S, 182 * S], radius=46 * S, fill=INK)
    d.rounded_rectangle([(cx - 72) * S, -30 * S, (cx + 72) * S, 174 * S], radius=40 * S, fill=PANTS)
    d.arc([(cx - 66) * S, 118 * S, (cx + 66) * S, 196 * S], 205, 335, fill=INK, width=6 * S)
draw_piece(SW, SH, shin, "shin", [95, 14])
FW, FH = 300, 120   # shoe, ankle pivot near the heel, toe points +x
def shoe(d, S):
    d.rounded_rectangle([8 * S, 10 * S, 292 * S, 112 * S], radius=46 * S, fill=INK)
    d.rounded_rectangle([16 * S, 18 * S, 284 * S, 88 * S], radius=40 * S, fill=SHOE)
    d.rectangle([16 * S, 88 * S, 284 * S, 102 * S], fill=SOLE)
    d.ellipse([200 * S, 30 * S, 262 * S, 52 * S], fill=(150, 96, 58, 255))
draw_piece(FW, FH, shoe, "shoe", [100, 30])
rig["shin_len"] = 160   # knee -> ankle (px)
rig["ankle_to_sole"] = 102 - 30
rig["hip_L"] = [470, 950]; rig["hip_R"] = [690, 950]
rig["knee_drop"] = TH - 52   # thigh pivot -> knee distance (px)
(out / "rig.json").write_text(json.dumps(rig, indent=1))
print(json.dumps(rig))
