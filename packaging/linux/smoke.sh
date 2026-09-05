#!/usr/bin/env bash

set -euo pipefail

if (( $# != 1 )); then
  echo "usage: packaging/linux/smoke.sh <artifact.deb>" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
artifact="$(realpath "$1")"
install_root="$(mktemp -d "${TMPDIR:-/tmp}/zd-linux-install.XXXXXX")"

cleanup() {
  case "$install_root" in
    "${TMPDIR:-/tmp}"/zd-linux-install.*) rm -rf -- "$install_root" ;;
    *) echo "zd: refusing unexpected smoke cleanup target" >&2; return 1 ;;
  esac
}
trap cleanup EXIT

cd "$repo_root"
node packages/scripts/release/inspect-linux-package.mjs "$artifact"
node packages/scripts/release/linux-install-lifecycle.mjs prepare "$artifact" "$install_root"
installed_zd="$(PATH="$install_root/usr/bin:$PATH" command -v zd)"
if [[ "$installed_zd" != "$install_root/usr/bin/zd" ]]; then
  echo "zd: installed Linux console command is unavailable on PATH" >&2
  exit 1
fi
browser_log="$install_root/browser-smoke.log"
browser_started=$SECONDS
if ! ZD_SERVE_EXECUTABLE="$installed_zd" \
  npx playwright test --config playwright.served.config.ts >"$browser_log" 2>&1; then
  browser_log_bytes="$(wc -c <"$browser_log" | tr -d '[:space:]')"
  echo "zd: installed Linux browser smoke failed outcome=failed durationSeconds=$((SECONDS - browser_started)) logBytes=$browser_log_bytes" >&2
  exit 1
fi
browser_tests="$(sed -nE 's/^[[:space:]]*([0-9]+) passed .*/\1/p' "$browser_log" | tail -n 1)"
if [[ ! "$browser_tests" =~ ^[1-9][0-9]*$ ]]; then
  echo "zd: installed Linux browser smoke result is unavailable" >&2
  exit 1
fi
echo "Verified installed Linux browser: tests=$browser_tests cleanup=passed durationSeconds=$((SECONDS - browser_started))"

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "zd: installed Linux wrapper smoke unavailable dependency=xvfb-run" >&2
  exit 1
fi
if ! command -v dbus-run-session >/dev/null 2>&1; then
  echo "zd: installed Linux wrapper smoke unavailable dependency=dbus-run-session" >&2
  exit 1
fi
wrapper_log="$install_root/wrapper-smoke.log"
wrapper_started=$SECONDS
if ! XDG_CONFIG_HOME="$install_root/home" \
  xvfb-run -a dbus-run-session -- \
  node packages/scripts/release/smoke-linux-wrapper.mjs "$install_root" >"$wrapper_log" 2>&1; then
  wrapper_log_bytes="$(wc -c <"$wrapper_log" | tr -d '[:space:]')"
  echo "zd: installed Linux wrapper smoke failed outcome=failed durationSeconds=$((SECONDS - wrapper_started)) logBytes=$wrapper_log_bytes" >&2
  exit 1
fi
echo "Verified installed Linux wrapper: controller=one reload=same-session shell=show-workbench secondary=reused graceful=passed forced=passed crash=presented cleanup=passed"
node packages/scripts/release/linux-install-lifecycle.mjs remove "$install_root"
