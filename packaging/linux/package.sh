#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
bundle_dir="$repo_root/target/release/bundle/deb"

cd "$repo_root"
cargo build --locked --release -p zd-desktop --bin zd
./node_modules/.bin/tauri build \
  --config packages/tauri/tauri.conf.json \
  --bundles deb \
  --ci

shopt -s nullglob
artifacts=("$bundle_dir"/zd_*.deb)
if (( ${#artifacts[@]} != 1 )); then
  echo "zd: expected one Debian package in $bundle_dir" >&2
  exit 1
fi

echo "Packaged ${artifacts[0]}"
