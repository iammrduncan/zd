#!/usr/bin/env bash

set -euo pipefail

if (( $# != 1 )); then
  echo "usage: packaging/macos/smoke.sh <artifact.dmg>" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
artifact="$(realpath "$1")"
temporary_root="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
mount_root=""
install_root=""
mounted=false

is_safe_staging() {
  local candidate="$1"
  local prefix="$2"
  local name
  name="$(basename "$candidate")"
  [[ -d "$candidate" &&
    ! -L "$candidate" &&
    "$(dirname "$candidate")" == "$temporary_root" &&
    "$name" == "$prefix".* ]]
}

cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_root" -quiet || true
  fi
  if [[ -n "$mount_root" && ( -e "$mount_root" || -L "$mount_root" ) ]]; then
    if is_safe_staging "$mount_root" "zd-macos-mount"; then
      rm -rf -- "$mount_root"
    else
      echo "zd: refusing unexpected mount cleanup target" >&2
      return 1
    fi
  fi
  if [[ -n "$install_root" && ( -e "$install_root" || -L "$install_root" ) ]]; then
    if is_safe_staging "$install_root" "zd-macos-install"; then
      rm -rf -- "$install_root"
    else
      echo "zd: refusing unexpected install cleanup target" >&2
      return 1
    fi
  fi
}
trap cleanup EXIT

mount_root="$(mktemp -d "$temporary_root/zd-macos-mount.XXXXXX")"
if ! is_safe_staging "$mount_root" "zd-macos-mount"; then
  echo "zd: refusing unexpected mount staging path" >&2
  exit 1
fi
install_root="$(mktemp -d "$temporary_root/zd-macos-install.XXXXXX")"
if ! is_safe_staging "$install_root" "zd-macos-install"; then
  echo "zd: refusing unexpected install staging path" >&2
  exit 1
fi

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
  browser_log_bytes="$(wc -c <"$browser_log" | tr -d '[:space:]')"
  echo "zd: installed macOS browser smoke failed outcome=failed durationSeconds=$((SECONDS - browser_started)) logBytes=$browser_log_bytes" >&2
  exit 1
fi
browser_tests="$(sed -nE 's/^[[:space:]]*([0-9]+) passed .*/\1/p' "$browser_log" | tail -n 1)"
if [[ ! "$browser_tests" =~ ^[1-9][0-9]*$ ]]; then
  echo "zd: installed macOS browser smoke result is unavailable" >&2
  exit 1
fi
echo "Verified installed macOS browser: tests=$browser_tests cleanup=passed durationSeconds=$((SECONDS - browser_started))"

wrapper_log="$install_root/wrapper-smoke.log"
wrapper_started=$SECONDS
if ! node packages/scripts/release/smoke-macos-wrapper.mjs "$installed_app" \
  >"$wrapper_log" 2>&1; then
  wrapper_log_bytes="$(wc -c <"$wrapper_log" | tr -d '[:space:]')"
  echo "zd: installed macOS wrapper smoke failed outcome=failed durationSeconds=$((SECONDS - wrapper_started)) logBytes=$wrapper_log_bytes" >&2
  exit 1
fi
echo "Verified installed macOS wrapper: controller=one reload=same-session shell=show-workbench secondary=reused graceful=passed forced=passed crash=presented cleanup=passed"
