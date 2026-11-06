import sys, numpy as np
from PIL import Image
def bbox(fr, box, thr=45):
    a=np.asarray(Image.open(f'out/frames/f{fr:04d}.png').convert('L')).astype(int)
    x0,y0,x1,y1=box; c=a[y0:y1,x0:x1]
    bg=np.median(c); m=np.abs(c-bg)>thr
    ys,xs=np.nonzero(m)
    return (x0+xs.min(), y0+ys.min(), x0+xs.max()+1, y0+ys.max()+1, int(bg), int(c[m].mean()))
if __name__=='__main__':
    fr=int(sys.argv[1])
    for b in sys.argv[2:]:
        print(b, bbox(fr, tuple(map(int,b.split(',')))))
