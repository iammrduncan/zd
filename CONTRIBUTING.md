# Contributing

Read [`AGENTS.md`](AGENTS.md), [`docs/GOOD_ENGINEERING_H.md`](docs/GOOD_ENGINEERING_H.md), and
[`docs/DESIGN.md`](docs/DESIGN.md) before changing the v1 application.

Every code change must include or update tests. Run the complete local gate before committing:

```sh
scripts/dev-container.sh cargo fmt --all -- --check
scripts/dev-container.sh cargo clippy --all-targets --locked -- -D warnings
scripts/dev-container.sh cargo test --all-targets --locked
scripts/dev-container.sh cargo build --release --locked
```

Keep commits focused and use short one-line commit messages. Do not add generated build output. The
historical product under `v0/` is inactive; change it only when repairing its archived build or
documentation integrity.

User-facing behavior belongs in [`docs/REFERENCE.md`](docs/REFERENCE.md). Keep the command table in
that page and `zd --help` aligned with `app::bindings`; `tests/cli.rs` checks the help surface.
