# zd

`zd` 1.0.1 is a native Rust terminal workbench for navigating, reading, editing, and reviewing the
files in a project. It is designed to run inside the terminal and agent session the user already
owns. It does not serve a web application or own shells, PTYs, or multiplexer sessions.

The v1.0.1 prototype is under active construction. The current root is a tested command skeleton;
the document, workspace, terminal UI, Markdown, review, handoff, and image workflows land in the
ordered goals under [the active objective](docs/planning/objectives/terminal-workbench/README.md).

## Build and verify

The repository pins Rust in `rust-toolchain.toml`. If Rust is not installed but Podman is available,
the helper uses a minimal Rust container.

```sh
scripts/dev-container.sh cargo test --locked
scripts/dev-container.sh cargo clippy --all-targets --locked -- -D warnings
scripts/dev-container.sh cargo build --release --locked
```

Run the current prototype against a project path:

```sh
scripts/dev-container.sh cargo run --locked -- .
```

Use `cargo run --locked -- --help` for the current command surface.

## Repository map

- [`src/`](src/) contains the native v1 application.
- [`docs/`](docs/) contains current product and engineering authority.
- [`v0/`](v0/) is the runnable historical browser/Tauri product. It is not part of the v1 build.
- [`LICENSE`](LICENSE) applies to the repository unless a nested third-party notice says otherwise.
