"""Replace numbers in every frame: inpaint old digits, draw new ones (same font/size/colour), clip where occluded."""
import sys, json, cv2, numpy as np
from PIL import Image
sys.path.insert(0,'tools')
from textfit import coverage, ink_bbox
ELS=json.load(open('out/elements_refined.json'))
TR={int(k):v for k,v in json.load(open(__import__('os').environ.get('TRACK','out/track.json'))).items()}
pts=[float(l) for l in open('out/pts.txt')]
rd=lambda i: cv2.imread(f'out/frames/f{i:04d}.png').astype(np.float32)
REFS={}
def prep(e):
    a=REFS.setdefault(e['ref'],rd(e['ref']))
    f=tuple(e['font']) if isinstance(e['font'],list) else e['font']
    ox,oy=e['org']; s,tr=e['size'],e['track']
    ibo=ink_bbox(e['old'],f,s,tr)
    ibn=ink_bbox(e['new'],f,s,tr)
    if e['align']=='left': nx=ox+ibo[0]-ibn[0]
    else: nx=ox+(ibo[0]+ibo[2])/2-(ibn[0]+ibn[2])/2
    X0=int(np.floor(min(ox+ibo[0],nx+ibn[0])))-5; X1=int(np.ceil(max(ox+ibo[2],nx+ibn[2])))+6
    Y0=int(np.floor(oy+min(ibo[1],ibn[1])))-5; Y1=int(np.ceil(oy+max(ibo[3],ibn[3])))+6
    crop=a[Y0:Y1,X0:X1].copy(); W,H=X1-X0,Y1-Y0
    covo=coverage(e['old'],f,s,W,H,ox-X0,oy-Y0,tr)
    covn=coverage(e['new'],f,s,W,H,nx-X0,oy-Y0,tr)
    gray=crop.mean(2); bgv=np.median(gray[covo<0.01])
    oldm=((np.abs(gray-bgv)>8)&(cv2.dilate((covo>0.02).astype(np.uint8),np.ones((5,5)))>0)).astype(np.uint8)
    oldm=cv2.dilate(oldm,np.ones((3,3)))
    clean=cv2.inpaint(crop.clip(0,255).astype(np.uint8),oldm,3,cv2.INPAINT_TELEA).astype(np.float32)
    fg=np.median(crop[covo>0.97],axis=0)
    # recover the true text colour assuming linear AA: fit crop = bg + (fg-bg)*cov
    patch=clean*(1-covn[...,None])+fg*covn[...,None]
    al=np.maximum(oldm.astype(np.float32),cv2.dilate((covn>0.01).astype(np.uint8),np.ones((3,3))).astype(np.float32))
    al=cv2.GaussianBlur(al,(3,3),0.6); al=np.maximum(al,covn)
    return dict(X0=X0,Y0=Y0,W=W,H=H,orig=crop,patch=patch,alpha=al,g=e['g'],name=e['old'])
P=[prep(e) for e in ELS]
DEBUG=bool(__import__('os').environ.get('DEBUG'))
def shift(img,fx,fy):
    M=np.float32([[1,0,fx],[0,1,fy]])
    return cv2.warpAffine(img,M,(img.shape[1],img.shape[0]),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
def apply(i,frame,log):
    tr=TR.get(i,{})
    for p in P:
        if p['g'] not in tr: continue
        dx,dy=tr[p['g']][:2]
        # local sub-pixel refinement against the original glyphs
        gx,gy=p['X0']+dx,p['Y0']+dy
        fx0,fy0=int(round(gx))-3,int(round(gy))-3
        if fx0>=0 and fy0>=0 and fx0+p['W']+6<=frame.shape[1] and fy0+p['H']+6<=frame.shape[0]:
            win=frame[fy0:fy0+p['H']+6,fx0:fx0+p['W']+6].mean(2).astype(np.float32)
            r=cv2.matchTemplate(win,p['orig'].mean(2).astype(np.float32),cv2.TM_CCOEFF_NORMED)
            _,mx,_,loc=cv2.minMaxLoc(r)
            if mx>0.9:
                lx,ly=loc; ddx=ddy=0.0
                if 0<lx<r.shape[1]-1:
                    a_,b_,c_=r[ly,lx-1],r[ly,lx],r[ly,lx+1]; q=a_-2*b_+c_; ddx=0.5*(a_-c_)/q if q else 0
                if 0<ly<r.shape[0]-1:
                    a_,b_,c_=r[ly-1,lx],r[ly,lx],r[ly+1,lx]; q=a_-2*b_+c_; ddy=0.5*(a_-c_)/q if q else 0
                dx=fx0+lx+ddx-p['X0']; dy=fy0+ly+ddy-p['Y0']
        ix,iy=int(np.floor(dx)),int(np.floor(dy)); fx,fy=dx-ix,dy-iy
        orig=shift(p['orig'],fx,fy); patch=shift(p['patch'],fx,fy); al=shift(p['alpha'],fx,fy)
        x0,y0=p['X0']+ix,p['Y0']+iy; W,H=p['W'],p['H']
        cx0,cy0=max(0,x0),max(0,y0); cx1,cy1=min(frame.shape[1],x0+W),min(frame.shape[0],y0+H)
        if cx1-cx0<4 or cy1-cy0<2: continue
        sl=(slice(cy0-y0,cy1-y0),slice(cx0-x0,cx1-x0))
        F=frame[cy0:cy1,cx0:cx1]
        og=orig[sl].mean(2)
        Fg=F.mean(2); og_full=orig.mean(2)
        ys_,xs_=sl
        def cand(k):
            o2=np.roll(og_full,k,axis=0)[sl]; return np.abs(Fg-o2)
        d=np.minimum(np.minimum(cand(0),cand(1)),cand(-1))
        ink=np.abs(og-np.median(og))>25
        inkrow=ink.any(1)
        bad=d.mean(1)>12
        bad|=np.where(inkrow,(d*ink).sum(1)/np.maximum(ink.sum(1),1),0)>30
        nb=np.zeros_like(bad); nb[1:]|=bad[:-1]; nb[:-1]|=bad[1:]
        edge=np.zeros_like(bad); edge[0]=edge[-1]=True
        bad=bad&(nb|edge)
        okink=np.nonzero(inkrow&~bad)[0]
        if DEBUG: print(p['name'],round(dx,2),round(dy,2),bad.astype(int),inkrow.astype(int))
        if len(okink)<3: continue
        inkidx=np.nonzero(inkrow)[0]
        badink=inkidx[bad[inkidx]]
        if len(badink):
            # bad ink rows are acceptable only as one block at the top or bottom of the ink (occlusion by a bar)
            top=badink.max()<okink.min(); bot=badink.min()>okink.max()
            if not (top or bot): continue
        # correlation check on the ok ink rows
        rr=np.zeros(len(bad),bool); rr[okink]=True
        A_=Fg[rr].ravel(); B_=og[rr].ravel()
        if A_.std()<5 or np.corrcoef(A_,B_)[0,1]<0.9: continue
        a0,b0=okink[0],okink[-1]
        while a0>0 and not bad[a0-1]: a0-=1
        while b0<len(bad)-1 and not bad[b0+1]: b0+=1
        rowok=np.zeros(len(bad),bool); rowok[a0:b0+1]=True
        # rows next to an occluder: keep one row margin
        if a0>0: rowok[a0]=False
        if b0<len(bad)-1: rowok[b0]=False
        A=al[sl]*rowok[:,None]
        frame[cy0:cy1,cx0:cx1]=F*(1-A[...,None])+patch[sl]*A[...,None]
        log.append((p['name'],int(rowok.sum()),int(len(rowok))))
    return frame
if __name__=='__main__':
    import os
    os.makedirs('out/proc',exist_ok=True)
    only=[int(x) for x in sys.argv[1:]]
    rng=only or range(1,len(pts)+1)
    for i in rng:
        f=rd(i); log=[]
        f=apply(i,f,log)
        cv2.imwrite(f'out/proc/f{i:04d}.png',f.clip(0,255).round().astype(np.uint8))
        if log: print(i, round(pts[i-1],2), log, flush=True)
