#!/bin/bash
# Composite watermark on processed frames and encode with the original frame timings + original audio.
set -e
cd "$(dirname "$0")/.."
python3 - <<'P'
from PIL import Image
import os
wm=Image.open('assets/watermark.png')
os.makedirs('out/wm',exist_ok=True)
pts=[float(l) for l in open('out/pts.txt')]
for i in range(1,len(pts)+1):
    a=Image.open(f'out/proc/f{i:04d}.png').convert('RGBA'); a.alpha_composite(wm); a.convert('RGB').save(f'out/wm/f{i:04d}.png')
pts=[float(l) for l in open('out/pts.txt')]
end=42.645967
with open('out/concat.txt','w') as f:
    for i,t in enumerate(pts):
        d=(pts[i+1] if i+1<len(pts) else end)-t
        f.write(f"file 'wm/f{i+1:04d}.png'\nduration {d:.6f}\n")
P
mkdir -p final
ffmpeg -y -v error -f concat -safe 0 -i out/concat.txt -i input/original.mp4 \
  -vf format=yuv420p -map 0:v -map 1:a \
  -fps_mode vfr -enc_time_base 1/90000 -c:v libx264 -preset slow -crf 17 -profile:v high \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a copy -movflags +faststart final/stats_test.mp4
