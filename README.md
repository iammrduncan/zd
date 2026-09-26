# zd

`zd` 1.0.1 is a native Rust terminal workbench for moving through a project, editing source, reading
Markdown, leaving source-anchored comments, and handing an exact selection to an existing agent. It
runs in the terminal session you already use; it does not serve a web application or own shells,
PTYs, or multiplexer sessions.

This 52-test prototype is not a tagged or published release; the exact gate is recorded in the
[Linux acceptance record](docs/acceptance/V1.0.1-LINUX.md).

## Run it

The repository pins Rust 1.97.1. With Rust and a C linker installed:

```sh
cargo run --release -- .
```

If the native toolchain is unavailable and Podman is installed:

```sh
scripts/dev-container.sh cargo run --release -- .
```

Pass a file to open its parent as the project, or pass a directory to open that project. Press
`Ctrl-Q` to leave. See [Get started](docs/GETTING_STARTED.md) for a safe first tour.

## What is in the prototype

- An ignore-aware, collapsible file tree and bounded project search
  ([workspace tests](tests/workspace.rs)).
- UTF-8 editing with terminal-cell-aware cursor movement and selection, save, undo/redo, and
  find/replace ([document tests](tests/document.rs), [application tests](tests/app.rs)).
- Read and Edit views over one Markdown source document, with source-mapped selection
  ([Markdown tests](tests/markdown.rs)).
- Persistent attached or detached comments in `.zd/review-v1.json`
  ([review tests](tests/review.rs)).
- Previewed, explicit handoff to an existing Herdr agent, with a manual prepared-prompt fallback
  ([handoff tests](tests/handoff.rs)).
- Explicit local clipboard-image insertion into the active document's `zd-images/` directory
  ([image tests](tests/image.rs)).
- Mouse input, narrow layouts, active-row viewports, and guarded terminal restoration
  ([UI tests](tests/ui.rs), [PTY tests](tests/terminal.rs)).

## Documentation

| Need | Page |
| --- | --- |
| Try the complete workflow | [Get started](docs/GETTING_STARTED.md) |
| Look up keys, files, limits, or errors | [Prototype reference](docs/REFERENCE.md) |
| Test in Ghostty and Herdr | [Owner acceptance checklist](docs/acceptance/GHOSTTY-HERDR.md) |
| Inspect Linux and automated evidence | [v1.0.1 acceptance record](docs/acceptance/V1.0.1-LINUX.md) |
| Understand the architecture | [Design](docs/DESIGN.md) and [ADRs](docs/adr/README.md) |
| Follow the implementation history | [Terminal workbench objective](docs/planning/objectives/terminal-workbench/README.md) |

## Verify it

```sh
scripts/dev-container.sh cargo fmt --all -- --check
scripts/dev-container.sh cargo clippy --all-targets --locked -- -D warnings
scripts/dev-container.sh cargo test --all-targets --locked
scripts/dev-container.sh cargo build --release --locked
```

The helper uses the native Rust toolchain when both Cargo and a C linker are available. Otherwise it
builds a minimal Podman image. The container does not forward a graphical desktop clipboard, so use
a native build for the owner-side image-paste check.

## Repository map

- [`src/`](src/) contains the native v1 application.
- [`docs/`](docs/) contains current product, user, and engineering documentation.
- [`v0/`](v0/) is the runnable historical browser/Tauri product and is excluded from v1 CI.
- [`LICENSE`](LICENSE) applies unless a nested third-party notice says otherwise.
