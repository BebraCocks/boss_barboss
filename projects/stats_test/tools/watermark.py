"""Visible 'ТЕСТ' marking: corner badge + faint diagonal pattern across the whole frame."""
from PIL import Image, ImageDraw, ImageFont
W,H=576,1280
ov=Image.new('RGBA',(W,H),(0,0,0,0))
# faint diagonal pattern
big=Image.new('RGBA',(W*2,H*2),(0,0,0,0)); d=ImageDraw.Draw(big)
f=ImageFont.truetype('assets/fonts/Roboto-700.ttf',64)
for row,y in enumerate(range(0,H*2,230)):
    for x in range(-200 if row%2 else 0,W*2,330):
        d.text((x,y),'ТЕСТ',font=f,fill=(255,255,255,40))
big=big.rotate(28,resample=Image.BICUBIC)
ov.alpha_composite(big.crop((W//2,H//2,W//2+W,H//2+H)))
# corner badge (top-left, under the status bar)
b=ImageDraw.Draw(ov); fb=ImageFont.truetype('assets/fonts/Roboto-700.ttf',26)
x0,y0=14,58; tw=b.textlength('ТЕСТ',font=fb)
b.rounded_rectangle((x0,y0,x0+tw+24,y0+38),radius=8,fill=(230,30,45,235))
b.text((x0+12,y0+19),'ТЕСТ',font=fb,fill=(255,255,255,255),anchor='lm')
ov.save('assets/watermark.png')
