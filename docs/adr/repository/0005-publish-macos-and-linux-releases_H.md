# 0005: Publish versioned macOS and Linux releases

## Status

Accepted

Supersedes
[0002: Publish versioned desktop releases](0002-publish-versioned-desktop-releases_H.md).

## Context

The `zd` host runs on the machine that owns a project. A Linux package therefore serves both local
desktop use and remote browser access. The prior release decision required macOS and Windows
artifacts but did not include Linux.

Windows needs separate native process-containment, wrapper, installer, and cleanup evidence. That
work is deferred. A release matrix must not imply Windows support before those behaviors are built
and tested.

## Decision

We will publish versioned releases from matching `v<major>.<minor>.<patch>` tags only after the
release workflow verifies Apple Silicon and Intel macOS disk images and one Linux x86_64 Debian
package. Every artifact will have a SHA-256 checksum. The publication job will depend on every
supported platform job and will hold the only repository write permission.

Windows will not be part of the release matrix until a later decision adds its native lifecycle and
package evidence.

## Consequences

- A release supports the two macOS architectures and Linux x86_64.
- Linux users and remote hosts receive one installable package for the same `zd serve` backend.
- Windows users do not receive a supported installer from this release process.
- Adding Windows later requires a new decision and complete native artifact evidence.
- Hosted release verification takes longer because every supported artifact is installed and
  exercised before publication.
- Intel macOS runner availability remains an external release dependency.
