#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
bundle_dir="$repo_root/target/release/bundle"
app_path="$bundle_dir/macos/zd.app"
version="$(node -p "require('$repo_root/package.json').version")"
architecture="$(uname -m)"
dmg_path="$bundle_dir/dmg/zd_${version}_${architecture}.dmg"
staging="$(mktemp -d "${TMPDIR:-/tmp}/zd-dmg.XXXXXX")"

cleanup() {
  rm -rf "$staging"
}
trap cleanup EXIT

cd "$repo_root"
cargo build --locked --release -p zd-desktop --bin zd
./node_modules/.bin/tauri build \
  --config packages/tauri/tauri.conf.json \
  --bundles app \
  --ci

if [[ ! -x "$app_path/Contents/MacOS/zd-desktop" || ! -x "$app_path/Contents/Resources/bin/zd" ]]; then
  echo "zd: the application bundle does not contain both executable roles" >&2
  exit 1
fi

codesign --force --sign - "$app_path/Contents/Resources/bin/zd"
codesign --force --sign - "$app_path/Contents/MacOS/zd-desktop"
codesign --force --sign - "$app_path"
codesign --verify --deep --strict "$app_path"

mkdir -p "$(dirname "$dmg_path")"
cp -R "$app_path" "$staging/zd.app"
ln -s /Applications "$staging/Applications"

hdiutil create \
  -volname "zd" \
  -srcfolder "$staging" \
  -ov \
  -format UDZO \
  "$dmg_path"

echo "Packaged $app_path"
echo "Packaged $dmg_path"
