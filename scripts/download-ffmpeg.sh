#!/usr/bin/env zsh
# Download a static FFmpeg binary into src-tauri/resources/ for bundling.
# Run once after cloning: zsh scripts/download-ffmpeg.sh
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
DEST="$SCRIPT_DIR/../src-tauri/resources/ffmpeg"

if [[ -f "$DEST" ]]; then
  echo "✓ FFmpeg already present at $DEST"
  exit 0
fi

ARCH=$(uname -m)
echo "→ Downloading static FFmpeg for macOS ($ARCH)…"

TMP=$(mktemp -d)
# evermeet.cx serves the same universal/arm64 build for both arches on Apple Silicon
curl -L "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip" -o "$TMP/ffmpeg.zip"
unzip -q "$TMP/ffmpeg.zip" -d "$TMP"
mv "$TMP/ffmpeg" "$DEST"
chmod +x "$DEST"
rm -rf "$TMP"

echo "✓ FFmpeg saved to $DEST ($(du -sh "$DEST" | cut -f1))"
