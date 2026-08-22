# Develop zd

Use the browser fixtures for fast frontend work and the native shell whenever a change touches
projects, files, Git, terminals, windows, notifications, diagnostics, or packaging.

## Set up the checkout

Install a Node version accepted by `package.json` and Rust through rustup. The repository pins its
Rust toolchain in `rust-toolchain.toml`.

```sh
npm ci
```

## Run the app

```sh
npm run app                       # native workbench without a project
npm run app:open -- .             # native workbench with the current folder
npm run app:open -- README.md     # native workbench with one file
npm run dev                       # browser development server
```

The browser build deliberately has no native authority. Use these assembled fixtures when the
corresponding native boundary is not part of the change:

- `http://localhost:1420/dev/workbench.html` for the workbench shell;
- `http://localhost:1420/dev/editor.html` for editor behavior;
- `http://localhost:1420/dev/changes-performance.html` for Changes and diff behavior; and
- `http://localhost:1420/dev/terminal-performance.html` for the bounded terminal surface.

## Choose the verification cut point

```sh
npm run check
npm run test:e2e
npm run test:e2e:release
cargo test --manifest-path packages/tauri/Cargo.toml --all-targets
cargo clippy --manifest-path packages/tauri/Cargo.toml --all-targets -- -D warnings
npm run website:build
npm run format:check
```

`npm run check` covers types, lint, unit and contract tests, and synchronized release versions.
Playwright drives Chromium. Native-boundary changes need the proportional Cargo test and Clippy
checks; performance claims need the release fixture that owns the claim.

## Find the owning module

| Path | Responsibility |
| --- | --- |
| `packages/app/src/workbench` | Root state, shell, commands, preferences, and lifecycle composition |
| `packages/app/src/projects` | Project model, controller, and compact project list |
| `packages/app/src/threads` | Thread model, lifecycle, terminal surface, and attention events |
| `packages/app/src/files` | Persistent compact file tree and filtering |
| `packages/app/src/git` and `packages/app/src/changes` | Git adapters, reconciliation, Changes, history, and diffs |
| `packages/app/src/editor` | CodeMirror buffer, language, Find/Replace, and editor facade |
| `packages/app/src/design` | Semantic tokens, fonts, and validated themes |
| `packages/app/src/platform.ts` | The frontend’s complete native boundary |
| `packages/tauri` | Native grants, files, Git, PTYs, windows, notifications, and diagnostics |
| `packages/scripts` | Repository checks, releases, objectives, and session automation |

Read [the architecture explanation](../explanation/architecture.md) before moving a responsibility
across a boundary. Read [CONTRIBUTING.md](../../../CONTRIBUTING.md) before preparing a repository
change.
