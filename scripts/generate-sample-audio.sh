#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/samples"
mkdir -p "${OUT_DIR}"

FFMPEG_BIN="${FFMPEG_PATH:-ffmpeg}"

# Tiny synthetic mono WAV (~1s, 440Hz tone). Not copyrighted media.
"${FFMPEG_BIN}" -y -f lavfi -i "sine=frequency=440:duration=1" -ac 1 -ar 16000 \
  "${OUT_DIR}/sample.wav" >/dev/null 2>&1

# Companion MP3 for format-coverage demos.
"${FFMPEG_BIN}" -y -i "${OUT_DIR}/sample.wav" -codec:a libmp3lame -qscale:a 9 \
  "${OUT_DIR}/sample.mp3" >/dev/null 2>&1

echo "Generated ${OUT_DIR}/sample.wav and ${OUT_DIR}/sample.mp3"
