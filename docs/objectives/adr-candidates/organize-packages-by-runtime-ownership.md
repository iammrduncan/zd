# Candidate: Organize packages by runtime ownership

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: Repository.

## Context

The original repository placed frontend, native, automation, tests, and assets in overlapping
top-level locations. A session report requested `packages/app`, `packages/tauri`, and
`packages/scripts`, with tests and assets stored beside their owner. Later session handoffs use
those paths, and the current repository retains that structure.

The accepted portable-frontend and platform-boundary ADRs separate browser product behavior from
native authority. They do not say how the repository preserves that separation. Without a layout
decision, new code can drift back into ambiguous top-level folders and weaken package-local tests,
dependencies, and ownership.

## Decision

The proposed decision is to organize executable concerns as workspace packages owned by their
runtime:

- `packages/app/` owns the portable web frontend, its browser entry points, assets, and tests.
- `packages/tauri/` owns the native shell, capabilities, Rust source, icons, and native tests.
- `packages/scripts/` owns repository automation and its tests.
- Additional products, such as the website, receive a package only when they have a distinct build
  and runtime boundary.

Tests and package-specific assets will stay with the package they verify or serve. Root files will
remain limited to workspace-wide configuration and entry points.

## Consequences

- Repository paths communicate runtime and ownership before a reader opens a file.
- Package tests, assets, and dependencies can evolve without recreating a mixed root layout.
- Cross-package imports and scripts must cross an explicit workspace boundary.
- Some configuration remains at the root because it governs the complete workspace.
- Moving a concern between runtimes requires a deliberate package move rather than a local rename.

## Evidence and ADR overlap

- Session evidence: the 2026-08-01 handoffs repeatedly identify the package reorganization as the
  next durable task; handoffs after the refile use the package-owned paths.
- Current evidence: `packages/app/`, `packages/tauri/`, and `packages/scripts/` each contain their
  source and tests or native support files.
- Related accepted ADRs: suite 0001 chooses the portable frontend and suite 0002 defines the
  platform boundary. This candidate records the repository consequence without changing either
  decision.
