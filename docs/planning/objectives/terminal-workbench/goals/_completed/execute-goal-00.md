# Execute goal 00: Archive v0 and make the Rust TUI root authoritative

## Prerequisites

- Research and planning in this objective are complete.
- The existing old-root documentation and verification checks must be green before files move.
- This goal owns all tracked pre-v1 product paths during the move, plus new root manifests,
  authority, workflow, and skeleton. No other goal may edit the repository concurrently.
- The owner may review this cutover independently; it establishes authority and a buildable skeleton,
  not a usable editor.

### Needed from the owner before starting

Nothing. The owner explicitly required the old product under `v0/` and the new product in Rust.

## `/goal` objective

This goal delivers Phase 0 from [`02-DELIVERY-PLAN.md:8-21`](../../02-DELIVERY-PLAN.md#phase-0--cut-over-authority-and-repository-root).

Move the browser/Tauri product into a self-contained historical island and prevent any v1 tag,
build, or current document from resolving to it. Leave a locked `zd` 1.0.1 Rust skeleton at the root
with the new product authority and tests.

## Required outcome

When the work is complete, the repository must have:

1. the tracked old product, docs, ADRs, npm/TypeScript files, packages, packaging, and release
   workflow under `v0/`, with generated/ignored state neither committed nor destructively removed;
2. root operator tooling and `LICENSE` preserved, with `AGENTS.md` and `CLAUDE.md` pointing to valid
   new root engineering/design documents;
3. a new root Cargo package named `zd`, version `1.0.1`, with library and binary skeleton, lockfile,
   Rust toolchain, Rust-only CI, and help/version/launch smoke coverage;
4. a minimal new root README, changelog, contributing guide, vision, design contract, security
   boundary, planning index, and ADR index;
5. owner-approved successor ADRs for the native Rust terminal workbench and one source-ranged
   document model; and
6. this terminal-workbench objective as the sole active v1 objective at the root, without an active
   duplicate below `v0/`.

## In scope

- **Tracked archive.** Owns `.github/`, old root product configs/manifests/docs, `packages/`, and
  `packaging/`. Move tracked files with Git history. Do not sweep ignored filesystem children into
  the archive.
- **New authority.** Owns root `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `AGENTS.md`,
  `CLAUDE.md`, `docs/`, and new ADRs.
- **Rust skeleton.** Owns `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `src/`, `tests/`,
  `.gitignore`, and the new CI workflow.
- **Build support.** Owns a minimal root container/build helper if the host lacks Rust. It must not
  depend on a path that moved into v0.
- **Serialization.** Goals 01–04 depend on these root paths and cannot run until the cutover commits.

## Required tests and evidence

At minimum, prove:

- the pre-move old documentation checks and complete practical old test commands pass;
- `git ls-files` shows every old product path below `v0/`, while root operator tooling stays put;
- generated `target/`, `node_modules/`, test results, and ignored nested build output are not added;
- `cd v0 && npm ci` metadata remains coherent, `npm run check` passes, and the old Rust workspace
  tests pass from `v0/` through the documented container path;
- root `cargo test --locked`, `cargo fmt --check`, strict Clippy, `cargo build --release --locked`,
  `zd --help`, and `zd --version` pass;
- new doc/ADR local links resolve and the current authority never links an old ADR as active;
- the new workflow contains no npm, Vite, Playwright, Tauri, served-host, or v0 build dependency; and
- `git diff --check` is clean.

## Explicit non-goals

- Do not implement the document, tree, Markdown, review, handoff, or image features.
- Do not delete ignored user files or build caches.
- Do not make v1 depend on an archived crate or copy a module without its later goal and tests.
- Do not rewrite the content of historical v0 ADRs; archive them intact.
- Do not tag or publish version 1.0.1.

## Engineering constraints

- Follow root `AGENTS.md`; add tests with code changes and use short one-line commits without
  coauthor tags.
- Use `git mv` or tracked-file moves that retain history. Keep one focused archive/cutover commit.
- Keep handwritten production files below 500 lines when practical.
- Preserve unrelated and ignored worktree data. Never use a destructive broad delete.
- The new root may reuse the old toolchain version initially, but old WebKit/Node dependencies do
  not belong in the v1 build image.

## Completion definition

The goal is complete only when the old product is a runnable inactive `v0/` island, the current root
contains only v1 authority and a locked Rust 1.0.1 skeleton, both documented verification paths pass,
all new ADR/link checks are green, generated state was not committed or destroyed, and no active
root workflow can publish the old product.

If tracked moves cannot preserve both the active terminal objective and a coherent v0 snapshot, stop
and report the exact path conflict. Do not leave a mixed root or silently drop historical evidence;
every later goal depends on this boundary being unmistakable.
