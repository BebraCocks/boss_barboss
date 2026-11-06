"""Refine each element's origin with its font fixed (small local search)."""
import sys, json, numpy as np
sys.path.insert(0,'tools')
from textfit import coverage, ink_bbox
from fit import load
from elements import ELEMENTS
out=[]
cache={}
for e in ELEMENTS:
    a=cache.setdefault(e['ref'],load(e['ref']).mean(2))
    ib=ink_bbox(e['old'],e['font'],e['size'],e['track'])
    ox,oy=e['org']
    X0,Y0=int(ox+ib[0])-4,int(oy+ib[1])-4; X1,Y1=int(ox+ib[2])+5,int(oy+ib[3])+5
    crop=a[Y0:Y1,X0:X1]; bg=np.median(np.concatenate([crop[:2].ravel(),crop[-2:].ravel()])); fg=np.percentile(crop,99.7)
    best=None
    for ds in (-0.25,0,0.25):
      for dx in np.arange(-1.5,1.51,0.25):
        for dy in np.arange(-1.5,1.51,0.25):
            cov=coverage(e['old'],e['font'],e['size']+ds,X1-X0,Y1-Y0,ox+dx-X0,oy+dy-Y0,e['track'])
            err=((bg+(fg-bg)*cov-crop)**2).mean()
            if best is None or err<best[0]: best=(err,ds,dx,dy)
    err,ds,dx,dy=best
    e=dict(e); e['size']+=ds; e['org']=(ox+dx,oy+dy); e['err']=float(err)
    print(e['old'],'->',e['new'],'rmse %.1f'%err**.5, 'd',ds,dx,dy)
    out.append(e)
json.dump(out,open('out/elements_refined.json','w'),ensure_ascii=False,default=list)
