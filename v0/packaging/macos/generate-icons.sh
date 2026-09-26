#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
font="$repository_root/packages/app/assets/fonts/iAWriterQuattroS-Bold.ttf"
master="$repository_root/packaging/icon.png"
icons="$repository_root/packages/tauri/icons"

cd "$repository_root"
swift packaging/macos/render-icon.swift "$font" "$master"
npm run tauri -- icon "$master" --output "$icons"

# The desktop product does not ship Tauri's generated mobile project assets.
rm -rf "$icons/android" "$icons/ios"
