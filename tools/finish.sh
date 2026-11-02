#!/usr/bin/env bash
# Final assembly: mux picture + sound, then quick QA (length, streams, black frames, loudness).
# Usage: bash tools/finish.sh projects/<name> out/video_noaudio.mp4 out/mix.wav final/<name>.mp4
set -euo pipefail
P="$1"; V="$P/$2"; A="$P/$3"; O="$P/$4"
mkdir -p "$(dirname "$O")"
ffmpeg -y -loglevel error -i "$V" -i "$A" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$O"
echo "== streams"; ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,duration -of compact "$O"
echo "== black frames (should be 0)"; ffmpeg -i "$O" -vf blackdetect=d=0.03:pix_th=0.1 -an -f null - 2>&1 | grep -c black_start || true
echo "== loudness"; ffmpeg -i "$O" -af ebur128=peak=true -vn -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tail -2
ls -la "$O"
