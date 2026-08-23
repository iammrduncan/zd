# Architecture

`zd` is a portable TypeScript workbench inside a thin Tauri desktop shell. The frontend owns
interaction and rendering. Native Rust owns filesystem grants, terminal processes, Git inspection,
window behavior, notifications, and local diagnostic files.

## One workbench state

One versioned state owner holds the active project, worktree, thread, file, region geometry, window
presentation, and theme selection. Projects, Threads, Files, Changes, the editor, and the terminal
observe that state and request guarded transitions from it.

This is why choosing a thread can restore its project, worktree, file, and terminal together.
Features do not stitch a context switch together with independent setters. A pending native write
or live process can still refuse an unsafe transition, while unsaved file text remains a local,
recoverable draft and does not block navigation.

## Narrow native authority

The frontend reaches the operating system only through a typed platform boundary. Native code
mints opaque project, worktree, file, and terminal identities after a launch path, folder picker, or
structured Git worktree operation approves them. Later calls use those identities; they do not send
arbitrary paths or commands.

The terminal boundary starts the user’s shell inside an approved project/worktree. Git status,
history, comparisons, and diffs use fixed read-only operations with output, time, and page bounds.
File scans avoid descending ignored dependency/build trees indefinitely. File writes are atomic.

## One editor engine

CodeMirror owns the current Markdown, Mermaid, or code buffer, language selection, Find/Replace, selection,
undo history, and dirty state. Markdown decorations shape the editable source as a reading surface;
code files use a compact code presentation. Git comparisons create separate read-only buffers with
explicit revision identities, so they cannot overwrite the live document.

Each unsaved editable file is stored under its approved project, worktree, and relative path.
Returning to that file restores the draft, including after `zd` relaunches. Saving the file clears
the draft. The Files tree bolds its name and includes `unsaved` in its accessible label while the
draft exists.

The command registry owns both dispatch and displayed shortcut labels. Settings writes validated,
conflict-free window-command overrides to local preferences; the same registry applies them after
launch, so the Command List and Shortcut Reference cannot drift from the active binding.

## Local and opt-in behavior

Theme files are bounded, closed-schema configuration rather than executable extensions. Remote
images are not fetched. Desktop completion notifications and sound are off by default and currently
use native macOS presentation. Local diagnostics are also off by default, redact path-like values,
rotate bounded files, and remain on the computer until you reveal or remove them.

The plain browser build has no filesystem, terminal, Git, notification, or diagnostic authority. It
reports those capabilities as unavailable instead of pretending to emulate the desktop shell.

## Verification at the boundaries

- Unit and contract tests cover state, adapters, parsing, limits, and repository invariants.
- Browser tests cover assembled interaction, accessibility, virtualization, and idle behavior.
- Rust tests cover grants, files, Git, PTYs, notifications, diagnostics, and process cleanup.
- Packaging checks inspect release metadata, installers, checksums, and application bundles.

This split keeps the fast-changing workbench portable while containing security-sensitive details
behind one small native boundary.
