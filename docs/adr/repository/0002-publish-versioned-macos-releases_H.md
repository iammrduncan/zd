# 0002: Publish versioned macOS releases

## Status

Accepted

## Context

A public desktop tool needs a repeatable download and update path. Manual local builds do not prove
which source produced an artifact, whether both Mac architectures work, or whether a download
matches its checksum.

## Decision

We will use `package.json` as the release-version source and publish releases from matching
`v<major>.<minor>.<patch>` tags.

The release workflow will run repository verification before building separate Apple Silicon and
Intel DMGs. Each artifact will include a SHA-256 checksum. Only the final publication job will
receive repository write permission.

Release and installation documentation will state the current signing and notarization boundary.

## Consequences

- A tag identifies the exact source and version for every download.
- Users can choose the correct Mac architecture and verify its checksum.
- Release permissions remain narrow.
- Local and hosted packaging use the same command.
- Hosted Mac builds take more time than a source-only release.
- Developer ID signing and notarization remain separate future decisions.
