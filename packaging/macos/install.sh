#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
source_app="${ZD_APP_SOURCE:-$repo_root/packages/tauri/target/release/bundle/macos/zd.app}"
applications_dir="${ZD_APPLICATIONS_DIR:-/Applications}"
bin_dir="${ZD_BIN_DIR:-/usr/local/bin}"
destination_app="$applications_dir/zd.app"
destination_executable="$destination_app/Contents/MacOS/zd"
command_path="$bin_dir/zd"

if [[ ! -x "$source_app/Contents/MacOS/zd" ]]; then
  echo "zd: $source_app does not contain Contents/MacOS/zd; run npm run package:macos first" >&2
  exit 1
fi

if [[ -e "$command_path" || -L "$command_path" ]]; then
  if [[ ! -L "$command_path" || "$(readlink "$command_path")" != "$destination_executable" ]]; then
    echo "zd: refusing to replace unrelated command at $command_path" >&2
    exit 1
  fi
fi

mkdir -p "$applications_dir" "$bin_dir"
app_staging="$(mktemp -d "$applications_dir/.zd-install.XXXXXX")"
link_staging="$(mktemp -d "$bin_dir/.zd-install.XXXXXX")"
previous_app="$app_staging/previous.app"
staged_app="$app_staging/zd.app"
staged_link="$link_staging/zd"

cleanup() {
  rm -rf "$app_staging" "$link_staging"
}
trap cleanup EXIT

ditto "$source_app" "$staged_app"
ln -s "$destination_executable" "$staged_link"

if [[ -e "$destination_app" ]]; then
  mv "$destination_app" "$previous_app"
fi

if ! mv "$staged_app" "$destination_app"; then
  if [[ -e "$previous_app" ]]; then
    mv "$previous_app" "$destination_app"
  fi
  exit 1
fi

if ! mv -f "$staged_link" "$command_path"; then
  rm -rf "$destination_app"
  if [[ -e "$previous_app" ]]; then
    mv "$previous_app" "$destination_app"
  fi
  exit 1
fi

echo "Installed $destination_app"
echo "Linked $command_path"
