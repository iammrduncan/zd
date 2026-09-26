# Summary — goal 04: Verify and hand off the v1.0.1 prototype

**Completed:** 2026-09-26
**Commits:** `6d47d76`, `4f3ed42`, `b7680ba`
**Goal file:** [`execute-goal-04.md`](execute-goal-04.md)

## Action needed from the owner

Run the [Ghostty and Herdr acceptance checklist](../../../../../acceptance/GHOSTTY-HERDR.md) on the actual
macOS desktop. It is the remaining evidence for enhanced keys, native mouse bypass, resize,
same-host image acquisition, one deliberate prompt to a disposable agent, and terminal cleanup in
Ghostty. It does not block the repository prototype or its Linux/automated handoff record.

## What was delivered

1. A guarded PTY workflow now covers launch, tree navigation, editing and saving, find/replace,
   Markdown mode, comments, fake Herdr discovery/preview/submission, unavailable clipboard handling,
   quit, and termios restoration.
2. Both document and sidebar active rows remain inside their viewports, including scrolled mouse hit
   mapping. Project search and tree truncation now report their bounded result state visibly.
3. The root README, tutorial, command/reference page, changelog, contribution guide, Linux evidence
   record, and owner Ghostty/Herdr checklist describe only implemented behavior and known limits.
4. The production command registry is checked against both `zd --help` and the reference page. The
   version surface reports `zd 1.0.1` without a tag or publication claim.
5. Root CI runs the complete locked Rust target set and rejects retired Node, Vite, Playwright,
   Tauri, and `v0/` build surfaces.
6. The historical product remains runnable under `v0/`: its JavaScript suite passed 949 tests in
   107 files and its Rust workspace passed 250 tests in its archived GTK/WebKit image.

## What I got wrong

The first PTY workflow used `Ctrl-H` for replace. Real terminal input delivers that byte as
Backspace, so the workflow exposed that the advertised command was unreachable. A failing PTY test
preceded the move to `Ctrl-E`, and the command-registry test now prevents help/reference drift.

The first viewport implementation did not keep keyboard-selected rows visible after scrolling. New
UI and PTY regressions made the viewport derive from the active row and made mouse coordinates use
the same offset.

The first capped project-search UI silently looked complete, and the contribution guide sent
`--check` to Cargo instead of rustfmt. Failing regressions now require a visible limit indication and
the executable quality-gate command.

## Traps worth knowing

- A source file can pass all unit tests while a control-key choice is still impossible in a real
  terminal; command workflows need PTY evidence.
- The minimal v1 container intentionally lacks Node, `rg`, GTK, and WebKit. Historical Rust checks
  must use `v0/packaging/linux/dev-container.sh`, not the v1 helper.
- The anti-slop structure checker reported zero findings over 972 files, but it could not infer Rust
  test collection. Cargo supplied that evidence separately.
- A headless Linux clipboard refusal proves safe capability handling, not graphical clipboard
  acquisition on Linux or macOS.

## Evidence

| Check | Result |
|---|---|
| Clean Rust-only path | All 52 tests passed from a fresh target in the pinned image with Node and `rg` absent |
| PTY | Five tests passed, including complete workflow, mouse mapping, startup failure, quit, and terminal restoration |
| Format and lint | `cargo fmt --all -- --check` and strict Clippy with `-D warnings` passed |
| Release | Locked optimized build passed; release binary reported `zd 1.0.1` and the complete registry-derived help |
| Documentation | Repository link test and deterministic prose audit passed with zero findings |
| Structure audit | Zero findings over 972 files; Rust test collection was explicitly outside that checker's configuration |
| Live environment | Herdr 0.9.1 listed one focused agent read-only; no live prompt or session mutation occurred |
| Historical move | v0 JavaScript passed 949 tests in 107 files; v0 Rust passed 250 tests in its full toolchain image |
| Release safety | No tag, artifact publication, network listener, or external release mutation occurred |

## What this unblocks

- The owner can evaluate the exact release build with a short tutorial and record the remaining
  Ghostty/macOS observations without reverse-engineering the prototype.
- Future v1 work can start from one native Rust boundary with the browser/Tauri implementation kept
  as explicitly historical source.

## What remains blocked

- Ghostty/macOS and same-host graphical clipboard acceptance remain unobserved until the owner runs
  the supplied checklist.
