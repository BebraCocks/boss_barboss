import sys, numpy as np
from PIL import Image
sys.path.insert(0,'tools')
from textfit import coverage, ink_bbox
def load(fr): return np.asarray(Image.open(f'out/frames/f{fr:04d}.png').convert('RGB')).astype(np.float32)
def fit(a, bb, text, pad=4, weights=(400,500,600,700), tracks=(0,), W_TOL=3):
    x0,y0,x1,y1=bb
    X0,Y0,X1,Y1=x0-pad,y0-pad,x1+pad,y1+pad
    crop=a[Y0:Y1,X0:X1].mean(2)
    bg=np.median(np.concatenate([crop[:2].ravel(),crop[-2:].ravel()]))
    fg=np.percentile(crop,99.7)
    best=None
    for w in weights:
      for tr in tracks:
        h0=(y1-y0-1)
        ib=ink_bbox(text,w,20,tr); s0=20*h0/(ib[3]-ib[1])
        for size in np.arange(s0*0.92,s0*1.08,0.25):
            ib=ink_bbox(text,w,size,tr)
            if abs((ib[2]-ib[0])-(x1-x0-1))>W_TOL: continue
            for dx in np.arange(-1,1.01,0.25):
              for dy in np.arange(-1,1.01,0.25):
                x=(x0+x1)/2-(ib[0]+ib[2])/2+dx-X0; y=(y0+y1)/2-(ib[1]+ib[3])/2+dy-Y0
                cov=coverage(text,w,size,X1-X0,Y1-Y0,x,y,tr)
                e=((bg+(fg-bg)*cov-crop)**2).mean()
                if best is None or e<best[0]: best=(float(e),w,float(size),float(tr),float(x+X0),float(y+Y0),float(bg),float(fg))
    return best
if __name__=='__main__':
    a=load(int(sys.argv[1])); text=sys.argv[2]; bb=tuple(map(int,sys.argv[3].split(',')))
    tr=tuple(np.arange(-0.5,3.01,0.25)) if len(sys.argv)>4 else (0,)
    print(text, fit(a,bb,text,tracks=tr))
