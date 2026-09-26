# Repository and migration findings

Date: 2026-09-26

This document answers which parts of the current repository belong in `v0/` and how to make the
new Rust TUI authoritative without destroying the old product's evidence.

## Established

- The current root is a browser/Tauri product: the Cargo workspace contains `packages/host`,
  `packages/server`, and `packages/tauri`; the npm manifest owns the product version and the
  CodeMirror/Vite frontend; Playwright, Vitest, packaging, and release paths are root-relative.
- The repository has 888 tracked files. Most live under `packages/`, `docs/`, and `.agents/`. The
  tracked product snapshot is small enough to archive, while ignored build output is not: the live
  `target/` alone was 68 GiB at audit time.
- The old release workflow reacts to `v*.*.*` tags. Leaving it at the active root when version
  `1.0.1` is tagged would publish the browser/Tauri product.
- Accepted records require CodeMirror/browser layout, a served host, a terminal keeper, and
  desktop/server packages. These directly conflict with the owner-directed Rust TUI pivot.
- Useful implementation-neutral behavior exists in the old tree: atomic writes, bounded
  ignore-aware traversal, watcher reconciliation tests, clipboard-image validation, one state
  owner, one command registry, truthful dirty state, and untrusted Markdown.
- The earlier egui prototype mentioned in an ADR is not present in reachable Git history.

Primary repository evidence is recorded with exact paths and line references in
[`subagent_outputs/00-repository-migration.md`](subagent_outputs/00-repository-migration.md).

## Claimed, not rerun

- The old README claims rendered editing, review comments, image paste, file operations, and
  terminal threads are shipped.
- The old served-workbench objective claims Linux verification is complete.
- The migration audit did not rerun the old suites, so it does not independently establish those
  behavior or release claims.

## Inferred

The right archive boundary is a hermetic, runnable `v0/` island. Move old manifests, locks, product
source, docs, website, packaging, and release workflow together. Do not make the new root crate
depend on anything below `v0/`. Copy only behavior that has been re-reviewed, together with its
tests.

Repository operator tooling stays at the root: `.agents/`, `.claude/`, `.codex/`, `AGENTS.md`,
`CLAUDE.md`, `skills-lock.json`, and `LICENSE`. Moving these would break the instruction and skill
chain; they are not a product runtime. All other old root product paths move below `v0/`, including
the old `.github/`, `docs/`, npm/TypeScript files, Cargo workspace, `packages/`, and `packaging/`.
New root equivalents replace the active manifest, workflow, README, and binding documents.

The archive move must operate on tracked files, not physical directory contents. Ignored
`node_modules/`, `target/`, test results, generated Tauri files, and built frontend assets remain
generated state. Locally ignored screenshots must be preserved deliberately without treating them
as versioned evidence.

The active terminal objective was created after the pivot. During cutover it should be promoted
back into the new root planning tree, while the complete pre-pivot docs snapshot remains in
`v0/docs/`. The old Accepted ADRs become historical evidence in the archive; new root records must
state the replacement decisions rather than pretending a directory move itself supersedes them.

## Gaps

- The old island's build commands must be executed after the move; relative packaging paths appear
  coherent but this has not been observed.
- The two ignored screenshot files have no Git history. Their intended archival status is unknown.
- The new release targets and packaging form are not yet selected.
- Reused host modules have not been separated from the old workspace and recompiled independently.

