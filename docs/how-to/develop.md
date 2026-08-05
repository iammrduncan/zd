# Develop zd

Use the browser surface for fast frontend work and the native shell whenever a change touches files,
launching, windows, or packaging.

## Set up the checkout

Install a Node version accepted by `package.json` and Rust through rustup. The repository pins its
Rust toolchain in `rust-toolchain.toml`.

```sh
npm ci
```

## Run the app

```sh
npm run app                         # native app without a document
npm run app:open -- md README.md    # native app with a file
npm run dev                         # frontend dev server
```

The browser build deliberately has no filesystem access. Use
`http://localhost:1420/dev/editor.html` for the real editor over an in-memory specimen and
`http://localhost:1420/dev/specimen.html` for design tokens.

## Choose the verification cut point

```sh
npm run check
npm run test:e2e
cargo test --manifest-path packages/tauri/Cargo.toml
cargo clippy --manifest-path packages/tauri/Cargo.toml --all-targets -- -D warnings
npm run format:check
```

`npm run check` covers types, lint, unit and contract tests, and synchronized release versions.
Playwright drives Chromium; changes to the Tauri shell still need an appropriate native check.

## Find the owning module

| Path | Responsibility |
| --- | --- |
| `packages/app/src/miniapps` | Product surfaces; `md` owns documents and workspaces |
| `packages/app/src/suite` | Boot, registry, preferences, and suite-wide overlays |
| `packages/app/src/design` | Tokens, fonts, and shared visual rules |
| `packages/app/src/platform.ts` | The frontend’s complete native boundary |
| `packages/tauri` | Filesystem scope, launch parsing, and native windows |
| `packages/scripts` | Repository checks and session automation |

Read [the architecture explanation](../explanation/architecture.md) before moving a responsibility
across one of these boundaries. The repository workflow and task grammar live in
[docs/way-of-working](../way-of-working/).
