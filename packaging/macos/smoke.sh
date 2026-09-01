#!/usr/bin/env bash

set -euo pipefail

if (( $# != 1 )); then
  echo "usage: packaging/macos/smoke.sh <artifact.dmg>" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
artifact="$(realpath "$1")"
mount_root="$(mktemp -d "${TMPDIR:-/tmp}/zd-macos-mount.XXXXXX")"
install_root="$(mktemp -d "${TMPDIR:-/tmp}/zd-macos-install.XXXXXX")"
mounted=false

cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_root" -quiet || true
  fi
  case "$mount_root" in
    "${TMPDIR:-/tmp}"/zd-macos-mount.*) rm -rf -- "$mount_root" ;;
    *) echo "zd: refusing unexpected mount cleanup target" >&2; return 1 ;;
  esac
  case "$install_root" in
    "${TMPDIR:-/tmp}"/zd-macos-install.*) rm -rf -- "$install_root" ;;
    *) echo "zd: refusing unexpected install cleanup target" >&2; return 1 ;;
  esac
}
trap cleanup EXIT

cd "$repo_root"
hdiutil verify "$artifact" >/dev/null
hdiutil attach "$artifact" -readonly -nobrowse -mountpoint "$mount_root" >/dev/null
mounted=true

ZD_APP_SOURCE="$mount_root/zd.app" \
ZD_APPLICATIONS_DIR="$install_root/Applications" \
ZD_BIN_DIR="$install_root/bin" \
  bash packaging/macos/install.sh >/dev/null
installed_app="$install_root/Applications/zd.app"
node packages/scripts/release/inspect-macos-app.mjs "$installed_app"
if [[ "$(readlink "$install_root/bin/zd")" != "$installed_app/Contents/Resources/bin/zd" ]]; then
  echo "zd: installed macOS console link targets the wrong executable" >&2
  exit 1
fi

browser_log="$install_root/browser-smoke.log"
browser_started=$SECONDS
if ! ZD_SERVE_EXECUTABLE="$install_root/bin/zd" \
  npx playwright test --config playwright.served.config.ts >"$browser_log" 2>&1; then
  echo "zd: installed macOS browser smoke failed" >&2
  exit 1
fi
echo "Verified installed macOS browser: tests=3 cleanup=passed durationSeconds=$((SECONDS - browser_started))"

wrapper_log="$install_root/wrapper-smoke.log"
if ! node packages/scripts/release/smoke-macos-wrapper.mjs "$installed_app" \
  >"$wrapper_log" 2>&1; then
  echo "zd: installed macOS wrapper smoke failed" >&2
  exit 1
fi
echo "Verified installed macOS wrapper: health=204 secondary=reused cleanup=passed"
