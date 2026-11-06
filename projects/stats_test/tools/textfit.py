import numpy as np
from PIL import Image, ImageDraw, ImageFont
SS=4
FONTS={w:f'assets/fonts/Roboto-{w}.ttf' for w in (400,500,600,700)}
FONTS.update({('tt',w):f'assets/fonts/TikTokSans-{w}.ttf' for w in (400,500,600,700,800)})
_fc={}
def font(w,size):
    k=(w,round(size*SS,2))
    if k not in _fc: _fc[k]=ImageFont.truetype(FONTS[w], size*SS)
    return _fc[k]
def layout(text,w,size,track=0.0):
    """returns list of (char, x_offset) in output px and ink bbox (x0,y0,x1,y1) relative to baseline origin"""
    f=font(w,size); xs=[]; x=0.0
    for i,ch in enumerate(text):
        xs.append(x)
        x+=f.getlength(ch)/SS + track
    # kerning ignored except pairwise through getlength of pairs
    x0=y0=1e9; x1=y1=-1e9
    for ch,cx in zip(text,xs):
        if ch==' ': continue
        b=f.getbbox(ch,anchor='ls')
        x0=min(x0,cx+b[0]/SS); y0=min(y0,b[1]/SS); x1=max(x1,cx+b[2]/SS); y1=max(y1,b[3]/SS)
    return xs,(x0,y0,x1,y1)
def coverage(text,w,size,W,H,x,y,track=0.0):
    """coverage 0..1 in WxH; (x,y)=baseline origin in output px"""
    f=font(w,size); xs,_=layout(text,w,size,track)
    im=Image.new('L',(W*SS,H*SS),0); d=ImageDraw.Draw(im)
    for ch,cx in zip(text,xs):
        d.text(((x+cx)*SS,y*SS),ch,fill=255,font=f,anchor='ls')
    return np.asarray(im.resize((W,H),Image.BOX)).astype(np.float32)/255.
_ib={}
def ink_bbox(text,w,size,track=0.0):
    k=(text,w,round(size,3),round(track,3))
    if k in _ib: return _ib[k]
    f=font(w,size); xs,_=layout(text,w,size,track)
    W=int((xs[-1]+size*2)*SS)+40; H=int(size*2*SS)
    im=Image.new('L',(W,H),0); d=ImageDraw.Draw(im)
    for ch,cx in zip(text,xs): d.text((20+cx*SS,size*1.5*SS),ch,fill=255,font=f,anchor='ls')
    a=np.asarray(im)>127; ys,xs2=np.nonzero(a)
    r=((xs2.min()-20)/SS,(ys.min()-size*1.5*SS)/SS,(xs2.max()+1-20)/SS,(ys.max()+1-size*1.5*SS)/SS)
    _ib[k]=r; return r
