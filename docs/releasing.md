# Releasing zd

`package.json` is the single source for the product version. Tauri reads it directly, and the
version synchronizer keeps npm and Cargo lock metadata aligned with it.

Release work requires a Node version accepted by the `engines.node` range in `package.json`.

## Prepare a version

1. Start from a clean checkout of `main`.
2. Move the relevant entries from `Unreleased` in `CHANGELOG.md` under a dated version heading.
3. Run `npm run version:bump -- <version>`, using a semantic version such as `0.1.1`.
4. Run `npm run check` and `cargo test --manifest-path packages/tauri/Cargo.toml`.
5. Review and commit all version and changelog changes together as `Prepare v<version>`.

`npm run version:bump` deliberately does not create a commit or tag. Tagged publishing and artifact
verification belong to the release workflow added with packaging, so the version change remains
visible for review before any release is created.
