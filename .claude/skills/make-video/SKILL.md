---
name: make-video
description: Technical pipeline for making a vertical cartoon short in this repo from an idea and the user's files (character pictures, backgrounds) — three.js in headless Chromium on the server, no Blender, no Remotion. Use whenever the user sends an idea, a character picture or asks for a video, a fix to a video, highlights/screenshots, or a final render.
---

# make-video: idea + files -> highlights -> approval -> final mp4

Read `CLAUDE.md` first: it has the user-facing rules. In short, answer in Russian, send highlights, and STOP for approval before the final render. This file is the "how".

Environment: cloud container, CPU only. Chromium + Playwright (global) and ffmpeg are pre-installed. Run `bash tools/setup.sh` at the start of every session: it installs three.js and the Python libs and is safe to repeat. **Never use Blender.**

## 0. Files from the chat
Images attached in chat live in the session's temp `images/` folder (the path is shown with the attachment).
Copy them straight away:
- into `projects/<name>/input/` (keep the original file, give it a clear name, e.g. `hero.webp` or `background.jpg`);
- into `inbox/` if there is no project yet.

## 1. New project
```bash
cp -r projects/park_walk projects/<name>          # closest finished project as the base
rm -rf projects/<name>/{out,final,input}/* projects/<name>/assets/*
```
Rename things in `src/` and `NOTES.md`. Project name: short latin slug (`street_dance`, `bus_stop`).

## 2. Character cut-out + skeleton (2D cut-out rig in 3D)
Proven in `projects/park_walk/tools/`:
- `cutout.py`: segment by colour classes (background greens/browns/ground → transparent). Keep the black ink by including dark pixels near the character core, fill holes, and drop small islands.
  - Retune the colour rules for every new picture.
  - Check the magenta preview (`out/cut_preview.png`) by eye at full resolution, edges especially: green fringe, bits of bench, missing belt or dark clothes.
- `rig.py`: split into parts with pivots → `assets/parts/*.png` + `rig.json`.
  - Torso+head is one card. The arm is cut at the shoulder (polygon) and split at the elbow with overlap. The other arm can be a mirrored copy.
  - Ink the cut edges that would be visible.
  - Missing limbs (legs cropped by the frame) are drawn in the drawing's style: same fill colours, thick ink, rounded shapes. Draw at 4× supersampling.
- `src/hero.js`: parts = unlit `MeshBasicMaterial` cards (alphaTest 0.5, `toneMapped:false`), with a `customDepthMaterial` so they cast shadows.
  - Hierarchy: body → shoulder → elbow. Legs live in root space with **2-bone IK** toward foot targets that stay planted during stance, so the feet never slide.
  - Gait: cycle T, duty ~0.58. The plant x is the hip x at mid-stance. Swing uses smootherstep plus a sine lift.
  - Add body bob, a waddle roll, and arm swing opposite to the legs.
  - Actions (kick etc.) are keyframed foot paths that replace a swing.
- The front-facing card walking sideways is the accepted flat-cartoon look.

## 3. World (`src/world.js`)
- Toon-shaded world: `MeshToonMaterial` with a 3-step gradient, plus screen-space **ink hulls** (back-face shell pushed along smooth normals in clip space, ~4.6 px at 1080 wide).
- Canvas-painted textures (grass, paving, bark), a gradient sky sphere, fog = horizon colour.
- Light: hemisphere + a sun with a 2048 shadow map that follows the hero.
- Take colours from the user's picture so the character sits in its world.
- Keep every prop out of the camera's path: a tree between the camera and the hero = black frames.

## 4. Story, camera, effects (`src/story.js`, `src/main.js`, `src/fx.js`)
- Everything is a pure function of t (deterministic, seeded RNG), so any frame renders on its own.
- Camera: slow push-in, a lead in the direction of travel, and a 7-frame flip-shake on impacts. Never a static hold.
- Effects:
  - flat 2D sprite cards (dust, impact star) facing the camera;
  - physics objects precomputed at 600 Hz (start a thrown object with `v.y>0` *above* the ground test, or it gets glued to the ground).
- `window.EVENTS` lists sound events (`step`, `kick`, `bounce`, …) with time and x.

## 5. Highlights (mandatory stop)
```bash
node tools/render.mjs projects/<name> stills out/stills 0,30,52,90,140 0.5
python3 tools/sheet.py projects/<name>/out/highlights.jpg --cols 3 \
  projects/<name>/out/stills/f000.png="0.0 с — начало" projects/<name>/out/stills/f052.png="1.7 с — удар" ...
node tools/render.mjs projects/<name> video out/draft.mp4 0.5     # silent draft, ~1 min for 5 s
```
- Pick one frame per key moment and look at each yourself first: black frames, things blocking the camera, cut seams, floating feet.
- Send the sheet (plus the draft if motion matters) with SendUserFile and ask «Забираем дальше? Что исправить или добавить?».
- **Wait for the answer.**

## 6. Final (only after "забирай")
```bash
node tools/render.mjs projects/<name> events out/events.json
(cd projects/<name> && python3 tools/sound.py out/events.json out/mix.wav)   # steps, hits, ambience, tune, -14 LUFS
node tools/render.mjs projects/<name> video out/video_noaudio.mp4 1           # ~3 min per 5 s at 1080x1920
bash tools/finish.sh projects/<name> out/video_noaudio.mp4 out/mix.wav final/<name>.mp4
```
- `finish.sh` prints streams, black-frame count (must be 0) and loudness.
- Look at a frame strip of the final file:
  ```bash
  ffmpeg -i final.mp4 -vf "select='not(mod(n\,15))',scale=270:480,tile=10x1" -frames:v 1 strip.jpg
  ```
- Then SendUserFile the mp4, update `NOTES.md`, commit and push `main`.

## Sound (`tools/sound.py` in the project)
- It uses `kit/templates/audio/{dsp.py,sfx_gen.py}`: `stroll_step`, `push_thump`, `whoosh`, `bird_chirps`, `breeze`, `modal` tones, `make_ir` reverb, `integrated` loudness.
- Add the events from `events.json`. Build music from simple synthesized instruments locked to the action tempo.
- Finish with the look-ahead limiter loop to −14 LUFS, true peak ≤ −1 dBTP.

## Long renders
- Run full renders with `run_in_background` and wait with an until-loop on the log ("done in").
- Rough speed with SwiftShader: 0.5 scale ≈ 0.3 s/frame, full 1080×1920 ≈ 1.2 s/frame.
