# Terminal workbench objective — archive summary

Archived: 2026-09-26

This objective moved the browser/Tauri product into `v0/` and established `zd` 1.0.1 as a focused
native Rust terminal workbench. It began with editor, Markdown, terminal, Ghostty, Herdr, and
repository-migration research; chose one application-owned source model instead of an editor fork;
then delivered and verified the prototype in five serialized goals.

The prototype is ready for owner evaluation. Its automated and Linux evidence is recorded in the
[v1.0.1 acceptance record](../../../acceptance/V1.0.1-LINUX.md). Ghostty/macOS, a same-host graphical
clipboard, and one deliberate prompt to a disposable real agent remain owner-observed items in the
[Ghostty and Herdr checklist](../../../acceptance/GHOSTTY-HERDR.md).

## Delivered outcome

- The root is one Rust 1.97.1 Cargo product with Rust-only CI, a minimal Podman fallback, a locked
  release build, and no v1 dependency on Node, WebKit, Tauri, a browser, `rg`, a server, or an owned
  terminal runtime.
- The complete prior product, its build systems, documentation, decisions, and release history are
  preserved as the runnable historical [`v0`](../../../../v0/) island.
- A Ropey-backed document owns exact half-open UTF-8 byte ranges, grapheme/cell movement, grouped and
  bounded undo/redo, literal and regular-expression operations, dirty state, and atomic save.
- One canonical workspace policy supplies the ignore-aware, non-symlink-following, ordered and
  collapsible file tree plus bounded project search.
- One Ratatui/Crossterm application state machine projects the tree, document, prompts, status,
  narrow layouts, keyboard input, bracketed paste, and source-correct mouse selection. A lifecycle
  guard restores every terminal mode after quit and returned errors.
- Markdown Edit and Read modes share the same source document. Rendered selectable spans map to
  parser-declared source ranges; synthetic markers, raw HTML, and remote images do not gain
  executable or invented source behavior.
- Bounded `.zd/review-v1.json` comments preserve exact source, context, revision, and range. Missing
  or ambiguous re-anchors detach visibly instead of moving silently.
- Herdr 0.9.1 discovery and submission use bounded direct arguments, explicit target choice, payload
  preview, and separate confirmation. An unavailable adapter leaves a prepared manual prompt; `zd`
  never owns an agent or multiplexer session.
- Explicit image paste validates same-host RGBA data, installs a content-hashed PNG beside the
  document under `zd-images/`, then inserts one undoable relative Markdown link. Refusals and partial
  failures leave the document unchanged.
- The shipped tutorial, reference, acceptance records, and CLI help identify exact commands,
  storage, bounds, unsupported environments, and current prototype exclusions.

## Durable decisions

1. [`ADR 0001`](../../../adr/0001-build-native-rust-terminal-workbench_H.md) makes a foreground native
   Rust TUI the active product boundary. Do not restore serving, browser/Tauri, PTY ownership, or
   agent-session management without superseding that decision.
2. [`ADR 0002`](../../../adr/0002-own-one-source-ranged-document-model_H.md) makes one source-ranged
   document authoritative. UI cells, Markdown events, comments, search, and handoff are projections
   or consumers; none may become a competing position model.
3. Paths and data entering workspace, review, handoff, or image boundaries are canonicalized or
   validated, bounded, and treated as untrusted. Shell interpolation is outside the handoff design.
4. Tree and search share one ignore/symlink scope. Unsupported file contents may remain visible in
   navigation but are never lossy-decoded for editing or search.
5. Platform capabilities are reported honestly. A headless refusal, fake Herdr executable, or test
   backend is evidence for that path only; it cannot establish Ghostty or graphical clipboard
   behavior.
6. The historical product stays under `v0/` and outside current CI. Use its documented full
   GTK/WebKit helper when deliberately validating it; the minimal v1 image is not its toolchain.

## What was learned

- No surveyed editor removed the differentiated work. Forking would still require a truthful shared
  source model while inheriting a larger runtime, license, or IDE surface.
- Byte, scalar, grapheme, terminal-cell, rendered-span, and widget coordinates must meet at explicit
  conversion boundaries. Mouse and keyboard tests that skip a widget's inner rectangle can both
  pass while the real terminal remains one row wrong.
- PTY workflows catch protocol truths that direct state tests cannot. `Ctrl-H` appeared reasonable
  as a binding but arrived as Backspace; replace moved to `Ctrl-E` after a failing PTY regression.
- Failure ownership must start when a resource is created, not after its write succeeds. The image
  cleanup guard originally could leave a partial PNG; its regression now covers incomplete writes.
- UTF-8 context bounds must round inward. Rounding a multibyte character outward produced persisted
  review context that exceeded the validator on reopen.
- Bounded behavior must be visible. The first tree/search limits were safe internally but search
  could look complete; the UI now names truncation.
- Documentation commands are executable interfaces. A regression now keeps the rustfmt separator,
  CI target set, CLI help, and command reference aligned with production.

## Evidence retained

- The v1 clean-path gate passed 52 tests from a fresh target in the pinned minimal Rust image with
  Node and `rg` absent. Format, strict Clippy, the locked release build, repository links, and release
  help/version also passed.
- Five real PTY tests cover the full feature workflow, keyboard and mouse viewport mapping, startup
  failure, quit, and terminal restoration.
- The historical move was rechecked after completion: v0 passed 949 JavaScript tests across 107
  files and 250 Rust tests through its archived full-toolchain image.
- Herdr 0.9.1 was discovered read-only in the live environment. Automated submission targeted only
  a fake executable; no prompt reached the owner's active agent.
- The deterministic prose audit reported zero findings. The final structure audit reported zero
  findings over 945 files and explicitly could not infer Rust test collection; Cargo supplied that
  evidence.
- No v1.0.1 tag, package, artifact publication, network listener, or external release mutation was
  created.

## What was not done

- macOS/Ghostty input, resize, mouse-bypass, terminal cleanup, and native clipboard image acquisition
  were not claimed from Linux. They remain in the owner checklist.
- The prototype has one active document and no tabs, splits, file creation/rename/delete, watcher,
  syntax highlighting, Tree-sitter, LSP, completion, diagnostics, refactoring, plugin runtime,
  embedded terminal, or Git mutation.
- Read mode does not fetch remote images or use terminal graphics. Clipboard images require a
  supported same-host graphical session; remote/SSH transfer is outside the boundary.
- Review anchors do not follow file renames, and external-change reconciliation remains deliberately
  limited. Ambiguity is surfaced instead of guessed.
- No generic tmux or Zellij automation was added. Non-Herdr targets receive the bounded manual
  prompt fallback.

## Follow-on work

- Run and record the owner checklist before treating Ghostty/macOS or graphical clipboard behavior
  as accepted.
- Use real evaluation feedback to decide whether multiple buffers, filesystem mutation, watches,
  richer editing services, or terminal graphics deserve separate objectives. Do not infer those
  additions from this prototype.
- Preserve the existing source-range, capability, lifecycle, and external-agent boundaries when
  extending the product; supersede the ADRs explicitly if the product direction changes.
