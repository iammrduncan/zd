# Desktop shell source map

Status: **current implementation context (2026-09-01)**

This crate is a desktop wrapper around the same served host that a remote browser uses. It does not
implement a second filesystem, Git, persistence, watcher, diagnostic, or terminal backend. Those
operations run in the supervised `zd` child through [`packages/host`](../../host) and
[`packages/server`](../../server).

## Composition and authority

| Path | Responsibility |
| --- | --- |
| [`main.rs`](main.rs) | Enter the public `zd` console dispatcher. |
| [`bin/zd-desktop.rs`](bin/zd-desktop.rs) | Enter the private GUI/Tauri executable. |
| [`dispatch.rs`](dispatch.rs) | Select desktop, foreground `serve`, or the private wrapper-child mode. |
| [`executables.rs`](executables.rs) | Resolve the installed console and desktop executables from each platform layout. |
| [`launch.rs`](launch.rs) | Resolve one trusted desktop launch path against its invocation directory. |
| [`lib.rs`](lib.rs) | Compose the Tauri application, plugins, shell commands, and exit cleanup. |
| [`desktop.rs`](desktop.rs) | Start the supervisor, install the exact-origin capability, navigate after readiness, and report child failure. |
| [`supervisor/`](supervisor/) | Own one child generation, private bootstrap/control frames, deadlines, shutdown, and reaping. |
| [`single_instance.rs`](single_instance.rs) | Forward a secondary desktop path to the primary process. |
| [`shell.rs`](shell.rs) | Expose only trusted picker/open input and viewing-computer behavior to the active served origin. |
| [`quick_access.rs`](quick_access.rs) | Own native summon registration and root-window presentation. |
| [`notifications.rs`](notifications.rs) | Validate and present native notifications and completion sounds. |

Absolute picker and file-association paths stay between native code and the child control pipe. The
webview receives only typed grants or launch intents. Every callable shell command checks that it
came from the `main` webview at the current child origin.

## Verification

- [`tests/authority.rs`](../tests/authority.rs) proves retired host commands are absent from Rust
  registration, Tauri permissions, and the frontend invoke adapter.
- [`tests/supervisor.rs`](../tests/supervisor.rs) exercises a real host plus executable fake children
  for readiness framing, pipe pressure, crash, deadlines, and reaping.
- [`tests/cli_dispatch.rs`](../tests/cli_dispatch.rs) exercises the distinct console and desktop
  roles, foreground and wrapper-child modes, and parent-channel loss.
- Frontend shell composition and disconnect presentation are covered under
  [`packages/app/tests/unit/platform`](../../app/tests/unit/platform).

Run focused tests while iterating. Before closing a native goal, run the full Cargo test, format, and
strict Clippy gates from the repository root.
