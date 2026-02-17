#!/bin/bash
# Remove macOS quarantine attribute from Rchic2.app
# Run this after downloading the app from GitHub Actions

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/Rchic2-macOS-ARM/Rchic2.app"

if [ ! -d "$APP_PATH" ]; then
  echo "Rchic2.app not found at: $APP_PATH"
  exit 1
fi

xattr -rc "$APP_PATH"
echo "Quarantine removed. You can now open Rchic2.app."
