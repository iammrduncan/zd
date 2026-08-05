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

## Publish the release

After the prepared version commit is on `main`, validate and push one annotated tag whose name
exactly matches `package.json`:

```sh
npm run release:check -- v<version>
git tag -a v<version> -m "zd v<version>"
git push origin v<version>
```

The tag starts `.github/workflows/release.yml`. It runs the static, unit, end-to-end, and native
checks before packaging. A failed check publishes nothing. A green run builds Apple Silicon and
Intel DMGs, verifies each image, writes a SHA-256 checksum beside each download, and creates the
GitHub Release from the existing tag with generated release notes.

The v0.1 line is ad-hoc signed so macOS can verify that the completed bundle has not changed. It is
not Developer ID signed or notarized; signing and notarization remain explicitly outside this
prototype's scope in `docs/_internal/objectives/vision.md` §11.
