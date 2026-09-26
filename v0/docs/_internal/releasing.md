# Releasing zd

`package.json` is the single source for the product version. Tauri reads it directly, and the
version synchronizer keeps the website package, npm lockfile, and Cargo metadata aligned with it.

Release work requires a Node version accepted by the `engines.node` range in `package.json`.

## Prepare a version

1. Start from a clean checkout of `main`.
2. Move the relevant entries from `Unreleased` in `CHANGELOG.md` under a dated version heading.
3. Run `npm run version:bump -- <version>`, using a semantic version such as `0.2.1`.
4. Run `npm run check`, `cargo test --workspace`, `cargo fmt --all -- --check`, and
   `cargo clippy --workspace --all-targets -- -D warnings`.
5. Review and commit all version and changelog changes together as `Prepare v<version>`.

`npm run version:bump` deliberately does not create a commit or tag. Tagged publishing and artifact
verification belong to the release workflow added with packaging, so the version change remains
visible for review before any release is created.

## Validate without publishing

Push the branch, then run the complete release matrix without creating a tag:

```sh
gh workflow run release.yml --ref <branch>
```

The manual run performs verification, builds and installs both macOS architectures and the Linux
package, runs their smoke checks, writes checksums, and retains the checked downloads for seven days.
It skips tag-version validation and does not create or modify a GitHub Release.

## Publish the release

After the prepared version commit is on `main`, validate and push one annotated tag whose name
exactly matches `package.json`:

```sh
npm run release:check -- v<version>
git tag -a v<version> -m "zd v<version>"
git push origin v<version>
```

The tag starts `.github/workflows/release.yml`. It runs static, unit, ordinary-browser,
served-browser, and Rust workspace checks before packaging. A failed check publishes nothing. A
green run builds Apple Silicon and Intel DMGs plus a Linux x86_64 Debian package.

Each platform job installs its artifact into an isolated location and runs the direct-browser and
desktop-wrapper smoke checks before it writes a SHA-256 checksum or uploads anything. The publish
job accepts exactly these three downloads and their checksums, verifies their contents, and creates
the GitHub Release from the existing tag with generated release notes. A missing, changed, or extra
platform file stops publication.

The v0.2 line is ad-hoc signed so macOS can verify that the completed bundle has not changed. It is
not Developer ID signed or notarized; signing and notarization remain explicitly outside this
prototype's scope in `docs/VISION.md` §11.

Windows artifacts are deferred and are not part of the build, smoke, checksum, or publish matrix.
