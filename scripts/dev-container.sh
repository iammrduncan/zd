#!/usr/bin/env bash
# Run a command with the pinned Rust toolchain, using Podman only when needed.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
image="localhost/zd-rust:1.97.1"

if (($# == 0)); then
  echo "usage: scripts/dev-container.sh <command> [arguments...]" >&2
  exit 2
fi

native_ready() {
  command -v cargo >/dev/null 2>&1 \
    && command -v cc >/dev/null 2>&1
}

if [[ "${ZD_IN_DEV_CONTAINER:-}" == "1" ]] || native_ready; then
  exec "$@"
fi

if [[ -x "$HOME/.cargo/bin/cargo" ]] && command -v cc >/dev/null 2>&1; then
  export PATH="$HOME/.cargo/bin:$PATH"
  exec "$@"
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "zd: Rust is unavailable and Podman is not installed" >&2
  exit 1
fi

if ! podman image exists "$image"; then
  podman build -t "$image" -f "$repo_root/dev/Containerfile" "$repo_root/dev"
fi

mkdir -p "$HOME/.cargo/registry" "$HOME/.cargo/git"

run_flags=(--rm -i --userns=keep-id)
[[ -t 0 ]] && run_flags+=(-t)

exec podman run "${run_flags[@]}" \
  -e ZD_IN_DEV_CONTAINER=1 \
  -e TERM="${TERM:-dumb}" \
  -v "$repo_root:$repo_root" \
  -v "$HOME/.cargo/registry:/usr/local/cargo/registry" \
  -v "$HOME/.cargo/git:/usr/local/cargo/git" \
  -w "$repo_root" \
  "$image" "$@"
