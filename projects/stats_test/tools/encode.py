"""Bake the ТЕСТ marking into the processed frames and encode with the exact original frame timestamps; copy original audio."""
import av, os, subprocess, numpy as np
from fractions import Fraction
from PIL import Image
os.chdir(os.path.join(os.path.dirname(__file__),'..'))
pts=[float(l) for l in open('out/pts.txt')]
wm=Image.open('assets/watermark.png')
os.makedirs('final',exist_ok=True)
tmp='out/video_only.mp4'
out=av.open(tmp,'w')
st=out.add_stream('libx264',rate=30)
st.width,st.height=576,1280; st.pix_fmt='yuv420p'
st.time_base=Fraction(1,90000); st.codec_context.time_base=Fraction(1,90000)
st.options={'crf':'17','preset':'slow','profile':'high','colorprim':'bt709','transfer':'bt709','colormatrix':'bt709'}
for i,t in enumerate(pts):
    a=Image.open(f'out/proc/f{i+1:04d}.png').convert('RGBA'); a.alpha_composite(wm)
    fr=av.VideoFrame.from_image(a.convert('RGB')).reformat(format='yuv420p',dst_colorspace='ITU709',src_colorspace='ITU709')
    fr.pts=int(round(t*90000)); fr.time_base=Fraction(1,90000)
    for p in st.encode(fr): out.mux(p)
for p in st.encode(): out.mux(p)
out.close()
subprocess.run(['ffmpeg','-y','-v','error','-i',tmp,'-i','input/original.mp4','-map','0:v','-map','1:a','-c','copy','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
                '-movflags','+faststart','final/stats_test.mp4'],check=True)
