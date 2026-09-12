#!/usr/bin/env bash
#
# Install the system packages needed to build, test, and package zd on
# Debian/Ubuntu: the C toolchain and pkg-config Cargo links through, the
# WebKit/GTK stack the desktop wrapper needs, and the browser dependencies
# Playwright drives. Node and Rust are expected already; see
# docs/user-facing-docs/how-to/develop.md.

set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "zd: this installer covers Debian/Ubuntu (apt); install the listed" >&2
  echo "    packages with your distribution's tools instead." >&2
  exit 1
fi

sudo=""
if ((EUID != 0)); then
  command -v sudo >/dev/null 2>&1 || {
    echo "zd: this script needs root for apt; rerun with sudo or as root." >&2
    exit 1
  }
  sudo="sudo"
fi

webkit_dev="libwebkit2gtk-4.1-dev"
if ! apt-cache show "$webkit_dev" >/dev/null 2>&1; then
  webkit_dev="libwebkit2gtk-4.0-dev"
fi

$sudo apt-get update
$sudo apt-get install -y \
  build-essential \
  pkg-config \
  file \
  curl \
  wget \
  git \
  libssl-dev \
  libgtk-3-dev \
  "$webkit_dev" \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libxdo-dev \
  xvfb \
  xauth \
  dbus-x11

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "zd: Node is missing; install a version accepted by package.json" >&2
  echo "    (engines.node), then run npm ci in $repo_root." >&2
elif ! command -v cargo >/dev/null 2>&1 && [[ ! -x "$HOME/.cargo/bin/cargo" ]]; then
  echo "zd: Rust is missing; install it through rustup, then rerun checks." >&2
fi

if [[ -d "$repo_root/node_modules" ]]; then
  if ((EUID == 0)) && [[ -n "${SUDO_USER:-}" ]]; then
    su "$SUDO_USER" -c "cd '$repo_root' && npx playwright install --with-deps chromium"
  elif ((EUID == 0)); then
    echo "zd: run npx playwright install --with-deps chromium as the" >&2
    echo "    developer user so browsers land in that user's cache." >&2
  else
    (cd "$repo_root" && npx playwright install --with-deps chromium)
  fi
else
  echo "zd: run npm ci, then npx playwright install --with-deps chromium." >&2
fi

echo "zd: development dependencies installed."
