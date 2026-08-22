# `@coder/libghostty-vt-node`

Research date: 2026-08-11

Project: [coder/libghostty-vt-node](https://github.com/coder/libghostty-vt-node)

## What it actually is

This project is an early Node-API binding to Ghostty's `libghostty-vt` terminal **state engine**.
It can accept terminal bytes, resize state, return visible plain text, and expose structured rows
and styled cells. Its own README is explicit that it is not a GUI or raster renderer.

That distinction matters: it cannot be dropped into a Tauri webview to produce a terminal. ZD would
still need to build a renderer, selection, input method handling, accessibility, link handling,
scrollback UI, font shaping, cursor behavior, and a PTY/process bridge. Doing so would make ZD a
terminal implementer—the exact complexity `thoughts.txt` wants an existing system to absorb.

## Architecture and maturity

- Native binding built with Node-API, `node-addon-api`, and `node-gyp`.
- Builds and statically links a pinned upstream Ghostty commit.
- Small API: create, feed, resize, snapshot, visible text, debug formatting, dispose, and build
  metadata.
- Intended prebuilt targets currently include Linux x64/arm64 and macOS arm64; Windows is stated as
  unsupported initially.
- The repository records only a handful of commits and explicitly says the upstream Ghostty C API
  remains unstable.
- MIT licensed.

## Fit for the current ZD stack

The root ZD app is a Tauri/Rust process with a browser TypeScript frontend, not an Electron/Node
runtime. Adding a native Node addon would create an unnatural sidecar or new runtime solely to
reach terminal state semantics. Calling the Ghostty C API from Rust would be more direct, but still
would not solve rendering.

## Pros

- Uses Ghostty's well-tested VT state semantics instead of reimplementing escape parsing.
- ABI-stable Node-API boundary insulates JavaScript callers from V8 versions.
- Pinning the Ghostty revision makes upstream changes intentional.
- Structured cells could support noninteractive terminal transcript analysis or export.
- Permissive license.

## Cons

- No terminal renderer—the largest visible part of the desired feature remains ZD's problem.
- No PTY/process management.
- Node-native addon is a poor fit for Tauri's existing Rust boundary.
- Upstream API is unstable and pinned by commit.
- Very young project with a tiny adoption signal.
- No initial Windows support, despite Windows being a supported ZD target.
- Native prebuild distribution adds a platform/architecture release matrix.
- Using DOM rendering built from cell snapshots would likely sacrifice terminal performance,
  accessibility, and correctness while increasing security-sensitive code.

## Verdict

Do not adopt this as ZD's terminal foundation. It is useful evidence that `libghostty-vt` is becoming
consumable, but it supplies the wrong layer. Revisit only if ZD needs terminal-state parsing without
a GUI, or if the project later supplies a stable renderer designed for embedding.

## Evidence gaps

- There is no published ZD prototype measuring the cost of snapshot-to-DOM rendering, but the
  package's stated scope already excludes it as an integrated terminal solution.
- The npm release and prebuild status should be checked again if the package is reconsidered.
