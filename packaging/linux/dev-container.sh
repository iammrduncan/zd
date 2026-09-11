#!/usr/bin/env bash
#
# Run a command with zd's full Linux build toolchain: C toolchain, WebKit/GTK,
# Rust, Node, and the browser dependencies, inside the podman image from
# packaging/linux/Containerfile.
#
#   packaging/linux/dev-container.sh cargo test --workspace
#   packaging/linux/dev-container.sh npm run test:e2e:served
#
# With --if-needed the command runs natively when the host already provides the
# toolchain and enters the container only when it does not:
#
#   packaging/linux/dev-container.sh --if-needed cargo build --release
#
# ZD_DEV_CONTAINER=0 forces native execution; ZD_DEV_CONTAINER=1 forces the
# container. The checkout, Cargo caches, and the Playwright browser cache are
# mounted at their real paths and the command runs on the host network, so
# build artifacts stay user-owned and a `zd serve` keeps its URL.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
image="localhost/zd-build:bookworm"

if (($# == 0)); then
  sed -n '2,20p' "$0" >&2
  exit 2
fi

if_needed=0
if [[ "${1:-}" == "--if-needed" ]]; then
  if_needed=1
  shift
fi
(($# > 0)) || {
  echo "zd: dev-container needs a command to run" >&2
  exit 2
}

native_ready() {
  command -v cargo >/dev/null 2>&1 \
    && command -v cc >/dev/null 2>&1 \
    && command -v pkg-config >/dev/null 2>&1 \
    && pkg-config --exists gtk+-3.0 webkit2gtk-4.1 2>/dev/null
}

if [[ "${ZD_IN_DEV_CONTAINER:-}" == "1" ]] || [[ "${ZD_DEV_CONTAINER:-}" == "0" ]]; then
  ZD_DEV_CONTAINER_RESOLVED=1 exec "$@"
fi

if ((if_needed)) && [[ "${ZD_DEV_CONTAINER:-}" != "1" ]] && native_ready; then
  ZD_DEV_CONTAINER_RESOLVED=1 exec "$@"
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "zd: no native toolchain and podman is unavailable; install the" >&2
  echo "    dependencies with packaging/linux/install-dev-deps.sh instead." >&2
  exit 1
fi

if ! podman image exists "$image"; then
  podman build -t "$image" -f "$script_dir/Containerfile" "$script_dir"
fi

mkdir -p "$HOME/.cargo/registry" "$HOME/.cargo/git" "$HOME/.cache/ms-playwright"

workdir="$PWD"
case "$workdir" in
  "$repo_root"/*) ;;
  *) workdir="$repo_root" ;;
esac

run_flags=(--rm -i --userns=keep-id --network host)
[[ -t 0 ]] && run_flags+=(-t)

exec podman run "${run_flags[@]}" \
  -e ZD_IN_DEV_CONTAINER=1 \
  -e ZD_DEV_CONTAINER_RESOLVED=1 \
  -e TERM="${TERM:-dumb}" \
  -e ZD_CWD="$repo_root" \
  -v "$repo_root:$repo_root" \
  -v "$HOME/.cargo/registry:/usr/local/cargo/registry" \
  -v "$HOME/.cargo/git:/usr/local/cargo/git" \
  -v "$HOME/.cache/ms-playwright:/home/dev/.cache/ms-playwright" \
  -w "$workdir" \
  "$image" "$@"
