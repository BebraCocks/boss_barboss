# Park walk — 5 s vertical short (three.js, no Blender)

The character from `assets/source.webp` walks down a park alley and kicks two stones.
1080x1920, 30 fps, 5 s, with sound: `park_walk.mp4`.

## How it is made
1. `tools/rig.py` cuts the character out of the picture (`assets/cut.png`) and splits it into a 2D skeleton:
   torso+head, arm (shoulder -> elbow, mirrored for the other side), and drawn legs (thigh -> shin -> shoe).
   Pivots go to `assets/parts/rig.json`.
2. `src/` is the three.js scene:
   - `world.js`: toon-shaded park with ink outlines, paving, trees, benches, lamps, flowers, sky.
   - `hero.js`: the skeleton. Legs use 2-bone IK toward planted foot targets (no foot sliding), plus arm swing, waddle and the kick pose.
   - `fx.js`: the stones' flight with bounces and spin, dust and the impact flash.
   - `story.js`: timing (speed, gait, which steps become kicks).
3. `tools/render.mjs` renders frames in headless Chromium (WebGL) and pipes them into ffmpeg.
4. `tools/sound.py` builds the sound (steps, kicks, stone knocks, birds, a tune in step tempo) from the skill's DSP kit.

## Rebuild
```bash
npm install            # three
python3 tools/rig.py .
node tools/render.mjs events out/events.json
node tools/render.mjs video out/video_noaudio.mp4 1
python3 tools/sound.py out/events.json out/mix.wav
ffmpeg -i out/video_noaudio.mp4 -i out/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k park_walk.mp4
```
Stills for checks: `node tools/render.mjs stills out/stills 0,52,120 0.5`.
