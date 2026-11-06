"""Track vertical/horizontal page offset of two groups (header H, overview O) per frame."""
import cv2, numpy as np, json
pts=[float(l) for l in open('out/pts.txt')]
g=lambda i: cv2.imread(f'out/frames/f{i:04d}.png',0)
def strips(ref, y0, y1, h=36, cols=((24,200),(200,376),(376,552))):
    a=g(ref); out=[]
    for y in range(y0,y1-h+1,h//2):
        for x0,x1 in cols:
            t=a[y:y+h,x0:x1]
            if t.std()>18: out.append((x0,y,t))
    return out
GROUPS={'H':(287,strips(287,150,530)),'O':(330,strips(330,270,1230))}
def sub(r,loc):
    x,y=loc; dx=dy=0.0
    if 0<x<r.shape[1]-1:
        a,b,c=r[y,x-1],r[y,x],r[y,x+1]; d=a-2*b+c; dx=0.5*(a-c)/d if d!=0 else 0
    if 0<y<r.shape[0]-1:
        a,b,c=r[y-1,x],r[y,x],r[y+1,x]; d=a-2*b+c; dy=0.5*(a-c)/d if d!=0 else 0
    return x+dx,y+dy
res={}
for i in range(1,len(pts)+1):
    t=pts[i-1]
    if not (8.0<=t<=31.0): continue
    f=g(i); res[i]={}
    for name,(ref,anc) in GROUPS.items():
        offs=[]
        for x0,y0,tpl in anc:
            r=cv2.matchTemplate(f,tpl,cv2.TM_CCOEFF_NORMED)
            _,mx,_,loc=cv2.minMaxLoc(r)
            if mx>0.95:
                x,y=sub(r,loc); offs.append((x-x0,y-y0,mx))
        if len(offs)>=2:
            o=np.array(offs); dx=np.median(o[:,0]); dy=np.median(o[:,1])
            ok=o[(abs(o[:,0]-dx)<1)&(abs(o[:,1]-dy)<1)]
            if len(ok)>=2:
                res[i][name]=[float(ok[:,0].mean()),float(ok[:,1].mean()),len(ok),len(anc)]
    print(i, round(t,2), res[i], flush=True)
json.dump(res,open('out/track.json','w'))
