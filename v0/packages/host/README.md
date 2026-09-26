# Workbench host source map

Status: **current implementation context (2026-09-01)**

This crate owns the operating-system work used by both direct browser sessions and the Tauri
wrapper. It has no Tauri or HTTP dependency. Callers use project, worktree, session, and relative
resource identities after a trusted startup or desktop control path approves the root.

## Authority owners

| Path | Responsibility |
| --- | --- |
| [`service.rs`](src/service.rs) | Expose the cohesive `HostService` boundary used by the server. |
| [`grants.rs`](src/grants.rs) | Canonicalize approved roots and resolve scoped resources without traversal or symlink escape. |
| [`identity/`](src/identity/) | Persist stable project and worktree identities. |
| [`durable/`](src/durable/) | Persist revisioned workbench state, drafts, and review records. |
| [`files.rs`](src/files.rs), [`atomic_write.rs`](src/atomic_write.rs), and [`file_mutations.rs`](src/file_mutations.rs) | Read, classify, save, and mutate bounded grant-scoped files. |
| [`file_tree.rs`](src/file_tree.rs) and [`file_tree_watch.rs`](src/file_tree_watch.rs) | Produce bounded tree snapshots and path-free change signals. |
| [`git/`](src/git/) and [`worktrees.rs`](src/worktrees.rs) | Inspect Git through fixed operations and create structured project worktrees. |
| [`terminal/`](src/terminal/) | Own structured PTY sessions, bounded output, process containment, and cleanup. |
| [`instrumentation/`](src/instrumentation/) | Own opt-in, content-free host diagnostic records. |
| [`workspaces.rs`](src/workspaces.rs) and [`themes.rs`](src/themes.rs) | Persist recent project sets and read bounded theme configuration. |

## Adapters

[`packages/server`](../server) is the only workbench-operation adapter. It authenticates and bounds
the WebSocket protocol, then calls `HostService`. The Tauri crate supervises that server process and
keeps only viewing-computer behavior; it does not call these modules through a second command set.

## Verification

Unit tests live beside pure owners. Real grant, persistence, file, Git, watcher, terminal, and
service boundaries live under [`tests/`](tests/). Run `cargo test -p zd-host` while iterating, then
the workspace Cargo and strict Clippy gates before completing a host change.
