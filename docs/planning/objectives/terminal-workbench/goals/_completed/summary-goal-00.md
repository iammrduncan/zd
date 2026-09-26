# Summary — goal 00: Archive v0 and make the Rust TUI root authoritative

**Completed:** 2026-09-26
**Commits:** `35bfc02`, `d8b4fab`, `d77c9d0`
**Goal file:** [`execute-goal-00.md`](execute-goal-00.md)

## Action needed from the owner

Nothing in this summary needs you. The owner already chose the native terminal direction and no
cutover decision remains open.

## What was delivered

1. The complete tracked browser/Tauri product, its docs and ADRs, npm workspace, Rust workspace,
   packaging, and release workflow moved under [`v0/`](../../../../../../v0/). Ignored caches and build
   output were not added, moved, or deleted.
2. The root now contains a dependency-free Rust package named `zd` at version 1.0.1, a locked
   toolchain, library/binary command skeleton, Rust-only CI, and help/version/launch tests.
3. Current vision, design, engineering, security, planning, contribution, and changelog authority
   replaced the archived records at the root.
4. Two owner-approved ADRs establish the native foreground TUI and the single source-ranged document
   model. The old ADR set is linked only as historical evidence.
5. A root build helper selects a complete native Rust/linker toolchain or a minimal Podman image. Its
   regression coverage prevents Cargo-without-a-linker from being mistaken for a usable toolchain.
6. The terminal-workbench objective is the only active root objective; no duplicate exists below
   `v0/`.

## What I got wrong

The first goal files linked prerequisites directly to future `_completed/` locations and one raw
research example looked like a real image link. The existing documentation-link test failed; the
links now target live goal files until each goal moves, and the example is plain prose.

The old desktop-dispatch test inherited `ZD_CWD` from the container helper, so it asserted the wrong
invocation directory. Its existing regression exposed the mismatch. The test now removes that
helper-only variable and reports expected and observed bytes when it fails.

The first root helper considered Cargo alone sufficient for native execution. This host has rustup
but no `cc`, so the launch failed at link time. A failing repository regression now requires both
tools before native selection, and the helper correctly uses Podman here.

## Traps worth knowing

- The v0 Tauri build needs ignored `packages/app/dist` assets. After a tracked-only move, run
  `npm run build` before the Rust workspace tests.
- A full v0 test run once split Markdown paragraph/list/fence parse nodes, while the exact 19-test
  range suite immediately passed and the next full 949-test run passed. Treat that as a known
  concurrency-sensitive legacy test, not relocation damage.
- The clean Rust image bootstrap reached rustup but the network mirror was too slow to finish. The
  verified local image was seeded with the exact installed 1.97.1 toolchain on the completed clean
  Debian/GCC layer. The checked-in Containerfile remains the reproducible cold-start path.
- `npm ci` reports six known vulnerabilities in the inactive v0 dependency graph. No v1 build or
  workflow consumes that graph.

## Evidence

| Check | Result |
|---|---|
| Pre-move npm gate | `npm run check`: 107 files and 949 tests passed; version 0.2.10 synchronized |
| Pre-move Rust gate | workspace tests, format, and strict Clippy passed after the container-env regression fix |
| Tracked archive boundary | all old product/config/workflow paths resolve below `v0/`; root operator files remain |
| Ignored-state boundary | no tracked `target`, `node_modules`, Playwright result, or generated dist path |
| v0 npm install/build | `npm ci` and `npm run build` passed from `v0/` |
| v0 npm quality gate | `npm run check`: 107 files and 949 tests passed; version synchronized |
| v0 Rust quality gate | workspace tests, format, and strict Clippy passed through `v0/packaging/linux/dev-container.sh` |
| Root tests | `cargo test --locked`: 9 tests passed, including docs, CI boundary, and helper regression |
| Root quality gate | format, strict Clippy, and locked release build passed |
| Root command smoke | `zd --version` printed `1.0.1`; help and project launch succeeded |
| Root image boundary | Rust/Cargo 1.97.1 and `cc` present; Node and npm absent |
| Documentation/ADR links | repository integration test passed for all current Markdown links |
| Patch hygiene | `git diff --check` passed; worktree clean after cutover commit |

## What this unblocks

- Goal 01 can implement the authoritative `Document` and `Workspace` modules without old-root
  authority or build ambiguity.
- Later TUI, Markdown, review, handoff, and image work can depend only on the v1 Cargo package.

## What remains blocked

- Goals 02–04 remain serialized behind Goal 01 and their stated prerequisites.
