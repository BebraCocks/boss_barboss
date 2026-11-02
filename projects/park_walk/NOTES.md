# park_walk — 5 s vertical short (three.js, no Blender)

The character from `input/source.webp` walks down a park alley and kicks two stones.
1080x1920, 30 fps, 5 s, with sound: `final/park_walk.mp4`.

## How it is made
1. `tools/cutout.py` cuts the character out of the picture (`assets/cut.png`). `tools/rig.py` splits it into a 2D skeleton:
   torso+head, arm (shoulder -> elbow, mirrored for the other side), and drawn legs (thigh -> shin -> shoe).
   Pivots go to `assets/parts/rig.json`.
2. `src/` is the three.js scene:
   - `world.js`: toon-shaded park with ink outlines, paving, trees, benches, lamps, flowers, sky.
   - `hero.js`: the skeleton. Legs use 2-bone IK toward planted foot targets (no foot sliding), plus arm swing, waddle and the kick pose.
   - `fx.js`: the stones' flight with bounces and spin, dust and the impact flash.
   - `story.js`: timing (speed, gait, which steps become kicks).
3. `../../tools/render.mjs` (shared) renders frames in headless Chromium (WebGL) and pipes them into ffmpeg.
4. `tools/sound.py` builds the sound (steps, kicks, stone knocks, birds, a tune in step tempo) from the skill's DSP kit.

## Rebuild (from the repo root)
```bash
bash tools/setup.sh
P=projects/park_walk
(cd $P && python3 -I tools/cutout.py input/source.webp out/mask.png assets/cut.png out/cut_preview.png && python3 -I tools/rig.py .)
node tools/render.mjs $P stills out/stills 0,52,122 0.5        # highlights
node tools/render.mjs $P events out/events.json
(cd $P && python3 tools/sound.py out/events.json out/mix.wav)
node tools/render.mjs $P video out/video_noaudio.mp4 1
bash tools/finish.sh $P out/video_noaudio.mp4 out/mix.wav final/park_walk.mp4
```
Change timing (speed, which steps become kicks, kick strength) in `src/story.js`.
