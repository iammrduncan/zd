# Contributing to zd

`zd` is preparing its first public release. Small, focused changes are easiest to review.

## Before opening a change

1. Read [AGENTS.md](AGENTS.md) for the repository's engineering rules.
2. Install the Node and Rust prerequisites from [README.md](README.md#development).
3. Create a focused branch from `main`.
4. Add or update tests with every code change. Bug fixes must start with a failing regression test.

## Verify your change

Run the checks that cover what you changed:

```sh
npm run check
npm run test:e2e
cd packages/tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Use `npm run format:check` before submitting. Keep commits small, use short imperative subjects,
and do not add generated output, local logs, credentials, or environment files.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
