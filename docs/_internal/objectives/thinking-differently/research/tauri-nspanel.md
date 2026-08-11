# `tauri-nspanel`

Research date: 2026-08-11

Project: [ahkohd/tauri-nspanel](https://github.com/ahkohd/tauri-nspanel)

## What it is

`tauri-nspanel` is an open-source Tauri plugin for macOS. It can create an AppKit `NSPanel` around a
Tauri webview or convert an existing Tauri window. Its current `v2.1` branch exposes a panel builder,
configurable key-window behavior and floating level, event handling, and access from ordinary Tauri
commands. It is MIT/Apache-2.0 licensed.

The repository lists real applications using it for launchers, overlays, capture tools, notes, and
search. That is encouraging evidence for this pattern, but it is not a compatibility guarantee for
ZD.

## Fit for ZD

This plugin addresses one narrow requirement extremely well: turn ZD's existing Tauri webview into
a Mac-style quick-access panel. It does not provide a project model, editor, terminal, browser, or
agent orchestration. That narrowness is a virtue if it is treated as a native adapter rather than a
new foundation.

## Pros

- Directly fits the current Tauri 2 architecture.
- Preserves the existing TypeScript/CodeMirror UI.
- Encapsulates Objective-C/AppKit mechanics instead of requiring a fork of Tauri.
- Can create a dedicated panel or convert an existing window.
- Supports panels that may become key, which matters for typing into ZD.
- Thread-sensitive native operations are handled on the main thread by the plugin.
- Permissive licensing.
- Existing adopters include overlay, launcher, and Markdown-note use cases.

## Cons

- macOS-only; ZD still needs a plain-window behavior on Windows and Linux.
- Installed directly from a Git branch in the documented setup rather than from a versioned
  crates.io release, increasing supply-chain and reproducibility care.
- Introduces a relatively small third-party native dependency at a sensitive window-lifecycle
  boundary.
- Does not decide focus restoration, current-display placement, shortcut conflicts, or lifecycle
  semantics for ZD.
- AppKit behavior changes across Spaces, Stage Manager, and OS releases still need native tests.
- Converting the main window may couple ordinary and quick-panel lifecycles; a dedicated panel may
  be safer.

## Recommendation

Use it in a time-boxed spike, behind a ZD-owned native interface. Prefer a dedicated quick-access
panel that presents the same application state over permanently converting the primary window.
Pin the exact Git revision if it is adopted. The fallback is a tiny in-repository AppKit adapter;
the public ZD interface should be small enough that either implementation can satisfy it.

## Evidence gaps

- No ZD branch has proved keyboard focus inside CodeMirror through this plugin.
- No native checklist has proved its behavior across the user's Spaces/monitor setup.
- Maintenance cadence, release policy, and compatibility with ZD's exact Tauri version need a
  repository-level dependency check at adoption time.
