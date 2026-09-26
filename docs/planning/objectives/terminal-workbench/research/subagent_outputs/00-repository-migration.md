# Repository and migration audit

Audit snapshot: branch `feat/serve`, commit `1ed25a08f4f02c9bc300fcfb5158438aec9a218a`, clean worktree. Read-only audit; no tests were run and no files were changed.

## Established facts

### Repository shape and history

- `git ls-tree --name-only HEAD` reports these exact tracked root paths:

  ```text
  .agents
  .claude
  .codex
  .github
  .gitignore
  .npmrc
  .prettierignore
  .prettierrc.json
  AGENTS.md
  CHANGELOG.md
  CLAUDE.md
  CONTRIBUTING.md
  Cargo.lock
  Cargo.toml
  LICENSE
  README.md
  docs
  eslint.config.js
  package-lock.json
  package.json
  packages
  packaging
  playwright.config.ts
  playwright.release.config.ts
  playwright.served.config.ts
  rust-toolchain.toml
  skills-lock.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  ```

- Live but ignored root paths are `node_modules/`, `target/`, and `test-results/`. Ignored generated paths inside tracked trees are `packages/app/dist/`, `packages/tauri/gen/`, `packages/tauri/target/`, and `docs/screenshots/`; evidence: `.gitignore:1-18`, `packages/tauri/.gitignore`, and `git status --ignored --short`.
- Generated material is large: `target/` is 68 GiB, `node_modules/` 719 MiB, and `packages/tauri/target/` 284 MiB (`du -sh ...`). These must not be accidentally carried into `v0/`.
- The repository has 888 tracked files: 127 below `docs/`, 588 below `packages/`, 13 below `packaging/`, 127 below `.agents/`, and one release workflow.
- `feat/serve` contains two terminal-pivot commits not present at `origin/feat/serve`: `0c6c787 Start terminal workbench objective` and `1ed25a0 Plan terminal workbench research`. The branch has no configured upstream (`git branch -vv`).
- Reachable Git history begins with `f521045 Build markdown web application`; Rust first appears in `47d9fbc Add native Tauri shell`. `git rev-list --objects --all | rg -i 'egui|eframe'` and Cargo-history searches found no reachable egui/eframe source or dependency. The older egui prototype mentioned by the ADR is therefore not recoverable from this repository’s reachable Git objects.
- Existing release tags run from `v0.1.0` through `v0.2.10` (`git tag --list --sort=version:refname`).

### Current build, test, and release system

- The root Cargo workspace contains only `packages/host`, `packages/server`, and `packages/tauri` (`Cargo.toml:1-3`); Rust is pinned to 1.97.1 with rustfmt and Clippy (`rust-toolchain.toml:1-4`).
- The root npm product is version `0.2.10`, with one npm workspace, `packages/website` (`package.json:1-14`). The manifest declares pnpm as package manager but the checked-in lock and CI use npm (`package.json:91`; `.github/workflows/release.yml:34-46`).
- Browser/editor production code is TypeScript/CodeMirror/Vite; relevant dependencies appear at `package.json:55-75`. Unit, browser, served-browser, build, version, and repository checks are all root-relative npm scripts (`package.json:15-53`).
- Vitest explicitly discovers only `packages/*/tests/unit/**/*.test.ts` and uses `packages/app/tests/setup.ts` (`vitest.config.ts:10-18`). Playwright configs hard-code `packages/app/tests/e2e` or `packages/app/tests/served` (`playwright.config.ts:28-49`; `playwright.release.config.ts:3-20`; `playwright.served.config.ts:3-16`).
- The release workflow is the only root workflow. It triggers on `v*.*.*` tags and manual dispatch, verifies npm/browser/Rust suites, builds two macOS DMGs and one Linux x86_64 Debian package, then publishes a GitHub Release (`.github/workflows/release.yml:3-60,62-180,177-214`).
- The old version source is `package.json`; the synchronizer rewrites all three Cargo manifests, Cargo.lock, the website package, npm lock, and Tauri config (`packages/scripts/release/sync-version.mjs:41-94`). A v1.0.1 tag created before replacing this workflow would build and publish the old browser/Tauri product.
- Tauri paths are tightly relative but internally coherent: the Tauri version points to `../../package.json`, assets to `../app/dist`, binaries to `../../target/release/zd`, and Linux packaging to `../../packaging/linux/zd.desktop` (`packages/tauri/tauri.conf.json:5-9,36-38,56-66`).
- Many repository tests assume `process.cwd()` is the old repository root and assert exact `docs/`, `packages/`, `.github/`, npm, and release paths; examples: `packages/scripts/tests/unit/repository/layout.test.ts:16-52`, `docs-information-architecture.test.ts:9-59`, `docs-governance.test.ts:8-25`, and `release/workflow.test.ts:6-8`.
- Packaging scripts derive their root from their own location, for example `packaging/linux/package.sh:5-21` and `packaging/macos/package.sh:5-32`. Moving the whole old build island together should preserve those relative relationships when invoked from `v0/`; this has not been executed.

### Active planning and accepted decisions

- `docs/planning/` is declared the sole active planning root and moving it requires coordinated script, test, guidance, and release updates (`docs/planning/README.md:3-6,38-45`).
- The terminal-workbench objective is active and requires native Rust, no served UI, no owned runtime, and archival of the current product below `v0/` (`research/00-research-plan.md:76-83`).
- The prior served-workbench objective remains marked “Executing”; goal 05 is open pending native macOS artifact evidence (`docs/planning/objectives/served-workbench/README.md:3-18,37-53`).
- There is stale planning state: `docs/planning/README.md:23-27` says the served durability audit and implementation have not started, while the served objective README says the audit completed and implementation is verified on Linux (`served-workbench/README.md:12-18`).
- Twelve ADRs remain Accepted:

  - Suite: 0002, 0005, 0006, 0007, 0010.
  - Markdown: 0001–0004.
  - Repository: 0001, 0004, 0005.

  Evidence: `docs/adr/README.md:14-40` plus each record’s `Status` at lines 3-5.

- Direct conflicts with the pivot include:

  - CodeMirror/browser layout is mandatory in Markdown ADR 0001 (`md/0001...:14-23`).
  - CodeMirror is mandatory for the single editable document surface in Markdown ADR 0002 (`md/0002...:15-22`).
  - Suite ADR 0010 mandates a first-party terminal keeper and served HTTP process (`suite/0010...:29-42`).
  - Repository ADR 0005 mandates macOS DMGs and a Linux Debian package around the served/Tauri product (`repository/0005...:20-35`).

- Still-useful invariants include one state owner (`suite/0005...:20-33`), one command registry (`suite/0007...:23-40`), truthful save completion and atomic replacement (`md/0003...:15-25`), and untrusted Markdown (`md/0004...:15-29`). Their implementation wording is web-specific and should not silently govern v1.

### Reusable Rust

- Strong reuse candidate: `packages/host/src/atomic_write.rs`. It is transport-independent and implements sibling temporary creation, flush, permission preservation, atomic rename, cleanup, and directory sync (`atomic_write.rs:7-45`), with focused tests at lines 84-150.
- Reuse with adaptation: file reads and file stamps in `packages/host/src/files.rs:10-12,90-137,227-275`.
- Reuse with adaptation: bounded, ignore-aware, symlink-nonfollowing file-tree traversal in `packages/host/src/file_tree.rs:13-18,96-109,122-184,266-287`. Tests cover ordering, ignored folders, traversal bounds, symlink loops, and revision changes (`packages/host/tests/file_tree.rs:65-260`).
- Reuse with adaptation: debounced file watching in `packages/host/src/file_tree_watch.rs:1-19,44-109`.
- Reuse with substantial change: clipboard-image validation and collision-safe writes (`clipboard_images.rs:10-71,75-109,120-194`). It hard-codes `docs/screenshots`, while v1 requires `zd-images` (`clipboard_images.rs:11,176`; test at lines 238-255).
- Conceptual reuse only: durable comment records currently store start line, end line, selected text, and comment (`durable.rs:39-57`). They lack edit-stable anchors, surrounding context, file revision, or byte/character offsets.
- Grant/path validation and file mutations may provide test cases and defensive routines, but the current opaque-ID host/session abstraction exists for a compromised webview and remote server (`grants.rs`; `service.rs:50-60`). It should not be imported wholesale into a same-process local TUI.
- No current Rust module provides an editor buffer, undo/redo, current-file find/replace, project-wide content search, Markdown parsing/rendering, TUI layout, mouse selection, or terminal handoff. `workspace_files_in` lists only Markdown files and does not search content (`files.rs:177-223`).
- Server, Tauri, PTY keeper, browser protocol, and packaging code directly implement the product the pivot rejects; they are archive material, not v1 dependencies.

## Claims

The following are documentary claims and were not independently rerun during this read-only audit:

- The public README claims rendered editable Markdown, selected-text comments, Find/Replace, clipboard-image paste, file-tree editing, and terminal threads are shipped (`README.md:39-55`).
- The served-workbench README claims Linux implementation and verification are complete and only native macOS evidence remains (`served-workbench/README.md:12-15`).
- Markdown ADR 0001 claims an earlier egui prototype spent most of its defect budget on rich-text geometry (`md/0001...:9-12`). No corresponding egui source exists in reachable Git history.
- The current DESIGN claims CodeMirror/browser layout and a first-party host own performance-critical work (`docs/DESIGN.md:847-871`); these are documented contracts, not evidence for a TUI implementation.
- No current test suite was executed in this audit, so pass status is unverifiable here.

## Inferences/recommendation

1. **Recommended boundary: a hermetic, runnable `v0/` island.** Move the old manifests, locks, source, docs, website, packaging, and release configuration together. Do not let the new root Cargo workspace depend on `v0` crates. Reuse selected Rust by copying/extracting reviewed modules into v1 with their tests, preserving attribution through Git history.
2. **Use an atomic governance cutover.** The same migration commit should:

   - archive the complete old docs snapshot;
   - create a minimal new root `docs/` with the terminal objective as the sole active objective;
   - add a v1 vision/design;
   - add owner-approved successor ADRs that explicitly supersede the browser/Tauri/keeper decisions and restate the retained save, trust, state-owner, command, and path-safety invariants;
   - mark the served-workbench and proposed UX work historical.

   Merely moving Accepted ADRs into `v0/` does not logically supersede them.
3. **Replace, do not relocate, the active release workflow.** A nested `v0/.github/workflows/release.yml` becomes inert, which is desirable. A new root workflow must test/build the Rust TUI and derive version `1.0.1` from Cargo metadata before any matching tag can be pushed.
4. **Keep the archive runnable from its own directory.** The inferred legacy commands should become `cd v0 && npm ci`, `npm run check`, and `cargo test --workspace`. Add a short `v0/README.md` explaining archival status and invocation. This inference must be verified after the move.
5. **Move tracked content, not generated state.** Remove/regenerate build caches rather than renaming whole physical directories containing ignored output. Preserve the ignored `docs/screenshots` files separately because they are user material, not Git-backed history.
6. **Preferred over a source-only archive.** A source-only archive would be smaller, but it would sever lockfiles, tests, docs, and release evidence from the code they explain. The tracked archive is only about 14 MiB; generated output causes the actual size problem.
7. **Retain repository operator tooling at root.** `.agents`, `.claude`, `.codex`, `AGENTS.md`, `CLAUDE.md`, `skills-lock.json`, and `LICENSE` should remain root-level. Moving them would break skill discovery, `.claude` symlinks, and the current instruction chain.

## Migration inventory

| Current root path | Proposed disposition |
|---|---|
| `.agents/` | Keep at root; repository agent tooling |
| `.claude/` | Keep at root; symlinks target `../.agents` |
| `.codex/` | Keep at root |
| `.github/` | Move old workflow to `v0/.github/`; create new root workflow |
| `.gitignore` | Preserve old rules as `v0/.gitignore`; create new root rules |
| `.npmrc` | Move to `v0/` |
| `.prettierignore` | Move to `v0/` |
| `.prettierrc.json` | Move to `v0/` |
| `AGENTS.md` | Keep and update new root docs references |
| `CHANGELOG.md` | Move old history to `v0/`; start/rewrite v1 root changelog |
| `CLAUDE.md` | Keep and update new root docs references |
| `CONTRIBUTING.md` | Move old guide to `v0/`; write v1 root guide |
| `Cargo.lock` | Move old lock to `v0/`; generate v1 root lock |
| `Cargo.toml` | Move old workspace to `v0/`; create v1 root workspace/package |
| `LICENSE` | Keep at root; applies to both trees |
| `README.md` | Move old README to `v0/`; write v1 root README |
| `docs/` | Archive full snapshot under `v0/docs/`; create new root docs/governance |
| `eslint.config.js` | Move to `v0/` |
| `package-lock.json` | Move to `v0/` |
| `package.json` | Move to `v0/` |
| `packages/` | Move tracked legacy packages to `v0/packages/` |
| `packaging/` | Move to `v0/packaging/` |
| `playwright.config.ts` | Move to `v0/` |
| `playwright.release.config.ts` | Move to `v0/` |
| `playwright.served.config.ts` | Move to `v0/` |
| `rust-toolchain.toml` | Archive exact old pin in `v0/`; create/confirm v1 root pin |
| `skills-lock.json` | Keep at root with `.agents/` |
| `tsconfig.json` | Move to `v0/` |
| `vite.config.ts` | Move to `v0/` |
| `vitest.config.ts` | Move to `v0/` |
| `.git/` | Keep; never move |
| `node_modules/` | Do not archive; remove/regenerate |
| `target/` | Do not archive; remove/regenerate |
| `test-results/` | Do not archive; remove/regenerate |
| `packages/app/dist/` | Do not archive generated build output |
| `packages/tauri/gen/` | Do not archive generated schemas |
| `packages/tauri/target/` | Do not archive generated Rust output |
| `docs/screenshots/` | Preserve locally under `v0/docs/screenshots/`; currently ignored/untracked, so decide separately whether to commit |

### Specific migration hazards

- `AGENTS.md:17-18` and `CLAUDE.md:2-3` will immediately break if root `docs/GOOD_ENGINEERING_H.md` and `docs/DESIGN.md` disappear without replacements.
- Objective tooling assumes `docs/planning/objectives/` (`docs/planning/README.md:41`; `packages/scripts/objectives/archive.mjs:8-10,98-102`).
- Root npm, TS, Vite, Vitest, Playwright, ESLint, packaging, and repository tests all encode old root paths.
- `packages/website/lib/docs.ts:19,99-100` emits GitHub links to `blob/main/docs/...`; a runnable v0 website would need `blob/main/v0/docs/...`.
- Root README and contributor links all target old root docs/packages (`README.md:11-87`; `CONTRIBUTING.md:8-40`).
- Moving `packages/` as a physical directory without clearing ignored children also moves approximately 288 MiB of disposable output.
- Git records content snapshots, not directory renames as first-class metadata. One focused move commit with minimal simultaneous edits gives `git log --follow` and rename detection the best evidence.

## Gaps

- **Unverifiable:** Whether the owner wants `v0/` merely browseable or actively buildable. The recommendation assumes buildable.
- **Unverifiable:** Whether the two ignored `docs/screenshots/*.png` files are intended repository assets; they have no Git history.
- The active terminal objective must be copied/promoted into the new root planning tree after the full old docs snapshot is archived; the exact anti-duplication marker for its `v0` copy is not yet defined.
- The stale served-workbench planning contradiction needs an explicit retirement note.
- There is no reachable source for the claimed former egui prototype.
- No root CI exists for ordinary pushes/PRs; only tagged/manual release CI exists.
- No v1 TUI crate layout, version source, binary artifact format, or target-platform matrix has yet been accepted.
- No current Rust implementation covers project-wide content search, editing, undo, find/replace, Markdown rendering, mouse mapping, or multiplexer/agent handoff.
- Clipboard-image destination semantics remain unresolved: current code writes worktree-root `docs/screenshots`; the new request says “correct `./zd-images` folder,” but does not yet define worktree-root versus document-relative placement.
- Reusable modules have not yet been extracted or compiled independently from the web host abstractions.
