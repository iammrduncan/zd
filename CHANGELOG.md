# Changelog

Notable user-facing changes to zd are recorded here.

## [Unreleased]

## [0.2.1] - 2026-08-24

### Added

- Restored Markdown review comments with selected-text anchors and generated `zd-feedback.txt`
  handoff files.
- Added focused guides for Markdown reading and editing, review comments, screenshot paste, and the
  intentionally minimal daily-driver workflow.
- Added Discord and maintainer X links to the website.

### Changed

- Reworked the website around rendered, editable Markdown and the paired thread/file workflow.
- Updated release screenshots and social artwork to show the current Markdown reading and review
  surfaces.

### Fixed

- Made homepage documentation links use full document navigation so stale client routing cannot
  turn a published page into a 404.

## [0.2.0] - 2026-08-24

### Added

- Added the local workbench for several approved projects, terminal-backed threads, current files,
  and bounded Git inspection.
- Added a compact Files/Changes region with filtering, safe file operations, status, history,
  comparisons, and read-only diffs.
- Added CodeMirror editing for Markdown, Mermaid, code, and configuration files, including durable
  unsaved drafts, Find/Replace, focus and typewriter modes, line wrapping, and screenshot paste.
- Added Current Light, Dark, and Dracula themes, a searchable Command List, editable window
  shortcuts, local settings, and opt-in diagnostics.
- Added direct terminal creation in the active project with `Cmd+N` or `Ctrl+N`, numbered project
  shortcuts, and previous/next project shortcuts.
- Added opt-in macOS completion notifications and sounds for supported-agent thread identities.
- Added the static product website, canonical user documentation, release screenshots, and measured
  performance baseline.

### Changed

- Replaced the single-document product shell with one stateful workbench that restores project,
  thread, worktree, file, layout, and theme context together.
- Simplified launch forms to `zd`, `zd <folder>`, and `zd <file>`.
- Moved project-scoped terminal threads to the left and Files/Changes to the right, with collapsible
  and hideable regions and a paired terminal/file centre layout.
- Bounded terminal renderer chunks at 64 KiB and made native reads wait for asynchronous xterm
  writes, preventing the renderer from outrunning its consumer.

### Known limitations

- macOS builds are ad-hoc signed and not notarized. Windows installers are not code signed.
- The direct **New terminal** action creates a shell thread. Starting an agent inside it does not
  relabel the thread for completion notifications.
- Very large unbroken terminal transcripts can still cause substantial transient WebKit memory
  pressure; the measured stress case is in `docs/planning/performance.md`.

## [0.1.0] - 2026-08-05

### Added

- A focused markdown reader and editor designed for long, agent-written documents.
- Native folder and file launch flows backed by a scoped filesystem boundary and atomic writes.
- Markdown typography, syntax highlighting, focus modes, keyboard navigation, and a compact command
  reference.
- macOS-first Tauri application scaffolding with Windows support and best-effort Linux support.

[Unreleased]: https://github.com/iammrduncan/zd/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/iammrduncan/zd/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/iammrduncan/zd/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/iammrduncan/zd/releases/tag/v0.1.0
