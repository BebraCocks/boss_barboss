#!/usr/bin/env bash
# Prepares a fresh cloud session: three.js (npm), Python image/audio libs. Chromium + Playwright and ffmpeg are
# pre-installed on the server. Safe to run many times. Blender is never used in this repo.
cd "$(dirname "$0")/.."
[ -d node_modules/three ] || npm install --no-audit --no-fund --silent >/dev/null 2>&1 || echo "setup: npm install failed"
python3 -c "import numpy, scipy, PIL" 2>/dev/null || pip install -q numpy scipy pillow >/dev/null 2>&1 || echo "setup: pip install failed"
python3 -c "import cv2" 2>/dev/null || pip install -q opencv-python-headless >/dev/null 2>&1 || true
mkdir -p inbox
exit 0
