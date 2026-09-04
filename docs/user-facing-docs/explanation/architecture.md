# Architecture

`zd` has one portable TypeScript workbench and one Rust host. The frontend owns interaction and
rendering. The host owns filesystem grants, terminal processes, Git inspection, watchers, saved
state, and local diagnostic files. A browser connects directly to that host; the thin Tauri desktop
shell starts the same host and adds viewing-computer window behavior and notifications.

## One workbench state

One versioned state owner holds the active project, worktree, thread, file, region geometry, window
presentation, and theme selection. Projects, Threads, Files, Changes, the editor, and the terminal
observe that state and request guarded transitions from it.

This is why choosing a thread can restore its project, worktree, file, and terminal together.
Features do not stitch a context switch together with independent setters. A pending native write
or live process can still refuse an unsafe transition, while unsaved file text remains a local,
recoverable draft and does not block navigation.

## Narrow host authority

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

The Vite-only browser fixtures have no filesystem, terminal, Git, notification, or diagnostic
authority. A browser opened from `zd serve` receives host capabilities only after it authenticates
with that process's secret. A successful first unlock pairs that browser through an HTTP-only,
`SameSite=Strict` cookie restricted to the host socket endpoint. The host stores the matching random
token outside project data, so the pairing survives a new process secret and port while page scripts
and browser storage cannot read it. The tradeoff is that the browser profile and its site cookies
become part of the trusted controller boundary.

The host approves the startup folder before listening and accepts one active controller. A newly
authenticated page takes the controller lease and retires the previous page, so the previous page
cannot continue issuing commands. Its remote folder browser lists directories itself and gives the
page short-lived opaque handles; the page never sends an absolute root to widen its own authority.
Approved added projects are remembered for that startup project until the user closes them. The
initial direct mode is plain HTTP, so it belongs only on a protected private network and not on the
public Internet.

Terminal processes live in a host-side keeper below the `zd serve` process. This lets the same
session survive page reloads and server restarts without duplicating the shell. It cannot preserve a
process through a host operating-system restart or keeper failure, so those losses remain explicit.

## Verification at the boundaries

- Unit and contract tests cover state, adapters, parsing, limits, and repository invariants.
- Browser tests cover assembled interaction, accessibility, virtualization, and idle behavior.
- Rust tests cover grants, files, Git, PTYs, notifications, diagnostics, and process cleanup.
- Packaging checks inspect release metadata, installers, checksums, and application bundles.

This split keeps the fast-changing workbench portable while containing security-sensitive details
behind one host boundary shared by browser and desktop clients.
