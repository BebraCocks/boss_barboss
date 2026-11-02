"""Cut a flat cartoon character out of its background (colour classes + ink outline kept).
Usage: python3 -I tools/cutout.py input/source.webp out/mask.png assets/cut.png out/cut_preview.png
The background colour rules (green / trunk / ground / bench / belt) were tuned for input/source.webp:
re-tune them for a new picture and always check the magenta preview."""
import numpy as np, sys
from PIL import Image
from scipy import ndimage as nd
im=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
H,W,_=im.shape
r,g,b=im[...,0],im[...,1],im[...,2]
lum=0.299*r+0.587*g+0.114*b
dark=lum<70
green=(g>r+25)&(g>b+20)
trunk=(abs(r-156)<22)&(abs(g-77)<18)&(b<55)
ground=(abs(r-141)<22)&(abs(g-138)<22)&(abs(b-103)<22)&(abs(r-g)<15)
bench=(r>150)&(g>120)&(b<90)&(abs(r-g)<60)
bgpx=green|trunk|ground|bench
beltpx=(abs(r-100)<30)&(abs(g-60)<22)&(b<50)&(r>g+20)
core=((~dark)&(~bgpx))|beltpx
core=nd.binary_opening(core,iterations=2)
lab,n=nd.label(core); cnt=nd.sum(core,lab,range(1,n+1))
keep=np.zeros(n+1,bool); keep[1:]=cnt>600
core=keep[lab]
near=nd.binary_dilation(core,iterations=22)
m=core|(dark&near)
m=nd.binary_fill_holes(m)
m=nd.binary_opening(m,iterations=3)
# largest component
l2,n2=nd.label(m); s=nd.sum(m,l2,range(1,n2+1)); m=l2==(1+int(np.argmax(s)))
dist=nd.distance_transform_edt(~core)
m=nd.binary_fill_holes(m & (core | (dist<=9)))
m=nd.binary_opening(m,iterations=2)
import os
for _p in sys.argv[2:5]: os.makedirs(os.path.dirname(_p) or ".", exist_ok=True)
Image.fromarray((m*255).astype(np.uint8)).save(sys.argv[2])
rgba=np.dstack([im.astype(np.uint8),(m*255).astype(np.uint8)])
Image.fromarray(rgba).save(sys.argv[3])
# preview on magenta
pv=im.copy(); pv[~m]=[255,0,255]
Image.fromarray(pv.astype(np.uint8)).resize((514,516)).save(sys.argv[4])
