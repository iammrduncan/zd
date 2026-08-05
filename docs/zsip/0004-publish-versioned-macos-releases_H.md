# 0004: Publish versioned macOS releases

## Status

Accepted

## Summary

Use one synchronized semantic version and publish verified Apple Silicon and Intel macOS artifacts
from version tags.

## Motivation

A public desktop tool needs a repeatable download and update path. Manual local builds do not prove
which source produced an artifact, whether both Mac architectures work, or whether a download
matches its checksum.

## Proposal

- Use `package.json` as the release-version source.
- Synchronize native configuration and reject version drift.
- Accept `v<major>.<minor>.<patch>` tags only when they match the source version.
- Run static, unit, browser, Rust, and packaging gates before publication.
- Build separate Apple Silicon and Intel DMGs on GitHub-hosted Mac runners.
- Publish a SHA-256 checksum beside each DMG.
- Give write permission only to the final release job.
- State the v0.1 ad-hoc-signing and no-notarization boundary in install and release docs.

## Alternatives

- Upload local builds manually.
- Publish one architecture and ask other users to build from source.
- Keep independent frontend, native, and release versions.
- Publish artifacts before the repository verification gates complete.

## Effects

### Positive

- A tag identifies the exact source and version for every download.
- Users can choose the correct Mac architecture and verify its checksum.
- Release permissions stay narrow.
- Local and hosted packaging use the same command.

### Negative

- Hosted Mac builds consume more time than a source-only release.
- Ad-hoc signing still requires honest Gatekeeper guidance for v0.1.
- Notarization and Developer ID signing remain future distribution work.

### Neutral

- The workflow does not publish on ordinary branch pushes.
- Windows packaging can join a later matrix without changing the version source.

## If we do not adopt this proposal

Users must trust manually produced artifacts or build from source. The project cannot reliably map
a public download back to one verified source revision.

## Resulting ADRs

None. The proposal defines release governance and automation rather than runtime architecture.
