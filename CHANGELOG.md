# Changelog

Notable user-facing changes to zd are recorded here.

## [Unreleased]

## [0.2.3] - 2026-08-25

### Added

- Added theme overrides for Markdown, code, terminals, navigation panels, and transient settings
  surfaces, with matching theme-configuration documentation.
- Added a focused suite of separate Markdown rendering demos for typography, lists, tables, code,
  diagrams, images, and links.
- Added Markdown formatting shortcuts for strong text, emphasis, inline code, and links.
- Added a confirmed **Discard Unsaved Changes…** action for selected dirty files or folders.

### Changed

- Made rendered Markdown tables support physical drag selection across cells and copy the selected
  cell text as rows and columns.
- Made project-relative Markdown links reveal and select their destination in Files.
- Added website event tracking for download, GitHub, Discord, and maintainer-profile links.

### Fixed

- Kept rendered Markdown images visible through clicks and drag selections, including images backed
  by desktop blob URLs.
- Protected rendered code-fence boundaries, restored empty-fence backspace, and added top and bottom
  breathing room inside fenced code.
- Fixed Markdown list continuation, nested-list exit, and Tab or Shift-Tab indentation across every
  CodeMirror document type.
- Replaced unreliable native file-tree drag events with physical mouse dragging while retaining
  multi-file moves, copy modifiers, drop indicators, and folder hover expansion.
- Made long Home project lists scroll instead of being cut off by the window.

## [0.2.2] - 2026-08-24

### Added

- Restored Markdown review comments with selected-text anchors and generated `zd-feedback.txt`
  handoff files.
- Added focused guides for Markdown reading and editing, review comments, screenshot paste, and the
  intentionally minimal daily-driver workflow.
- Added Discord and maintainer X links to the website.

### Changed

- Reworked the website around rendered, editable Markdown and the paired thread/file workflow.
- Updated release screenshots for the current Markdown reading and review surfaces, and changed the
  social card to show all three bundled themes.

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

[Unreleased]: https://github.com/iammrduncan/zd/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/iammrduncan/zd/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/iammrduncan/zd/compare/v0.2.0...v0.2.2
[0.2.0]: https://github.com/iammrduncan/zd/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/iammrduncan/zd/releases/tag/v0.1.0
