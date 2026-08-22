# Native source map

Status: **implementation context for the merged workbench foundation (Gate 2, 2026-08-22)**

This directory is the trusted side of the desktop boundary. The webview sends stable project,
worktree, file, and session identities through the typed adapter in
[`packages/app/src/platform.ts`](../../app/src/platform.ts). Native code resolves those identities
against approved grants; frontend callers do not supply arbitrary filesystem paths or commands.

## Composition and authority

| Path | Current responsibility |
| --- | --- |
| [`main.rs`](main.rs) | Enter the desktop application through the library builder. |
| [`lib.rs`](lib.rs) | Compose managed state, register native commands, and own shutdown cleanup. |
| [`cli.rs`](cli.rs) | Parse launch input, queue native open requests, and expose the current grant lifecycle. |
| [`grants.rs`](grants.rs) | Mint, resolve, recover, and revoke least-privilege grants with stable identities. |
| [`projects.rs`](projects.rs) | Choose and recover approved project roots through the native folder picker. |
| [`fs.rs`](fs.rs) | Perform current grant-scoped listings, reads, file stamps, links, and atomic writes. |
| [`themes.rs`](themes.rs) | Discover bounded, direct-child theme configuration files. |
| [`quick_access.rs`](quick_access.rs) | Own native summon registration and root-window presentation. |
| [`instrumentation/`](instrumentation/) | Write, rotate, sample, and retain local opt-in diagnostics. |
| [`terminal/`](terminal/) | Own structured PTY sessions, bounded output, resize, exit, and process cleanup. |
| [`terminal_runtime.rs`](terminal_runtime.rs) | Adapt terminal-session ownership to Tauri managed state and commands. |

`lib.rs` and the frontend platform adapter are shared integration points. Keep feature complexity
inside its owning module and propose the narrowest command/interface addition required. Do not add
a generic path, process-execution, shell-command, or environment-variable escape hatch.

## Verification

Module tests live beside their Rust owner. Cross-module lifecycle evidence lives under
[`packages/tauri/tests/`](../tests/), including diagnostics and terminal sessions. Run focused Rust
tests while iterating, then the repository's complete Cargo test and Clippy checks before a native
gate closes.

The active sequence and still-pending feature work are tracked in the
[expanded-scope execution plan](../../../docs/planning/goals/expanded-scope/goal.md). This source
map describes only modules present at this checkpoint; the plan remains execution context, not a
license to widen native authority ahead of an owning feature.
