# Contributing to zd

Contributions to `zd` are welcome. Keep changes focused enough that a reviewer can understand the
user need, decision, implementation, and verification together.

## Rules

1. File an issue for a bug, question, or small improvement that needs discussion.
2. Submit a [ZSIP](docs/zsip/README.md) before a meaningful product, process, governance, or
   architecture change. Small fixes that touch one behavior and a few files can go directly to a
   pull request.
3. Follow accepted [ADRs](docs/adr/README.md). When an accepted ZSIP creates an architecture
   decision, maintainers record that decision as an ADR.
4. Read [AGENTS.md](AGENTS.md) for repository engineering rules.
5. Follow [Develop zd](docs/user-facing-docs/how-to/develop.md) to install dependencies and run the
   app.
6. Follow the [user-documentation instructions](docs/user-facing-docs/AGENTS.md) when a change
   affects product guidance.

## Tests and commits

Add or update tests with every code change. A bug fix must start with a failing regression test.

Run the checks that cover your change:

```sh
npm run check
npm run test:e2e
cd packages/tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Run `npm run format:check` before submitting. Keep commits small and use short imperative subjects.
Do not add generated output, local logs, credentials, or environment files.

## Security issues

Follow [SECURITY.md](SECURITY.md) instead of opening a public issue for a vulnerability.
