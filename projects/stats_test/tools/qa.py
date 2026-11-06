"""QA: wherever an old number is visible in the original frame, the processed frame must differ there."""
import sys, cv2, numpy as np
sys.path.insert(0,'tools')
import replace as R
pts=[float(l) for l in open('out/pts.txt')]
tpls=[]
for p in R.P:
    o=p['orig'].mean(2); ink=np.abs(o-np.median(o))>25
    ys,xs=np.nonzero(ink); tpls.append((p['name'],o[ys.min()-1:ys.max()+2, xs.min()-1:xs.max()+2].astype(np.float32)))
miss=[]; found=0
for i in range(1,len(pts)+1):
    a=cv2.imread(f'out/frames/f{i:04d}.png',0).astype(np.float32)
    b=cv2.imread(f'out/proc/f{i:04d}.png',0).astype(np.float32)
    for name,t in tpls:
        if len(name)<3: continue
        r=cv2.matchTemplate(a,t,cv2.TM_CCOEFF_NORMED)
        ys,xs=np.nonzero(r>0.9)
        for y,x in zip(ys,xs):
            if r[y,x]<r[max(0,y-2):y+3,max(0,x-2):x+3].max(): continue
            found+=1
            h,w=t.shape
            win=np.abs(a[y:y+h,max(0,x-12):x+w+14]-b[y:y+h,max(0,x-12):x+w+14])
            if win.max()<40: miss.append((i,round(pts[i-1],2),name,(int(x),int(y)),round(float(r[y,x]),3)))
print('occurrences:',found,'not replaced:',len(miss))
for m in miss[:80]: print(m)
