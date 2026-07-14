#!/usr/bin/env zsh
# Download the standalone yt-dlp binary into src-tauri/resources/ for bundling.
# Run once after cloning: zsh scripts/download-ytdlp.sh
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
DEST="$SCRIPT_DIR/../src-tauri/resources/yt-dlp"

if [[ -f "$DEST" ]]; then
  echo "✓ yt-dlp already present at $DEST"
  exit 0
fi

echo "→ Downloading yt-dlp for macOS (arm64)…"
curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" -o "$DEST"
chmod +x "$DEST"

echo "✓ yt-dlp saved to $DEST ($("$DEST" --version))"
