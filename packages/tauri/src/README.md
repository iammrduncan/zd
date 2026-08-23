# Native source map

Status: **current implementation context (2026-08-22)**

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
| [`clipboard_images.rs`](clipboard_images.rs) | Validate and persist bounded clipboard images below fixed project-owned screenshot directories. |
| [`file_tree.rs`](file_tree.rs) | Scan one approved project/worktree into a bounded ignored-aware tree snapshot. |
| [`file_tree_watch.rs`](file_tree_watch.rs) | Debounce native disk changes for one approved tree and emit path-free scope signals. |
| [`git.rs`](git.rs) | Run the fixed read-only status, history, comparison, and diff operations. |
| [`worktrees.rs`](worktrees.rs) | Create and approve one structured Git worktree without delete or prune authority. |
| [`themes.rs`](themes.rs) | Discover bounded, direct-child theme configuration files. |
| [`quick_access.rs`](quick_access.rs) | Own native summon registration and root-window presentation. |
| [`instrumentation/`](instrumentation/) | Write, rotate, sample, and retain local opt-in diagnostics. |
| [`terminal/`](terminal/) | Own structured PTY sessions, bounded output, resize, exit, and process cleanup. |
| [`terminal_runtime.rs`](terminal_runtime.rs) | Adapt terminal-session ownership to Tauri managed state and commands. |
| [`notifications.rs`](notifications.rs) | Validate bounded attention requests and retain ID-only action routing. |
| [`notifications/`](notifications/) | Present native macOS notifications and completion sounds. |

`lib.rs` and the frontend platform adapter are shared integration points. Keep feature complexity
inside its owning module and propose the narrowest command/interface addition required. Do not add
a generic path, process-execution, shell-command, or environment-variable escape hatch.

## Verification

Module tests live beside their Rust owner. Cross-module lifecycle evidence lives under
[`packages/tauri/tests/`](../tests/), including diagnostics and terminal sessions. Run focused Rust
tests while iterating, then the repository's complete Cargo test and Clippy checks before a native
gate closes.

The completed implementation sequence and acceptance contracts are recorded in the
[expanded-scope execution plan](../../../docs/planning/goals/expanded-scope/goal.md). This source
map describes the current modules; the plan is not a license to widen native authority outside an
owning feature.
