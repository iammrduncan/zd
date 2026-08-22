# Changelog

Notable user-facing changes to zd are recorded here.

## [Unreleased]

### Changed

- Replaced the single-document product shell with one local workbench for approved projects,
  terminal-backed threads, current files, and Git inspection.
- Simplified launch forms to `zd`, `zd <folder>`, and `zd <file>`.
- Moved project-scoped Threads to the left and the compact Files/Changes region to the right.
- Added CodeMirror language-aware editing, bounded terminal sessions, file-tree filtering, Git
  status/history/comparisons, read-only diffs, validated themes, opt-in local diagnostics, and
  opt-in macOS completion attention.

## [0.1.0] - 2026-08-05

### Added

- A focused markdown reader and editor designed for long, agent-written documents.
- Native folder and file launch flows backed by a scoped filesystem boundary and atomic writes.
- Markdown typography, syntax highlighting, focus modes, keyboard navigation, and a compact command
  reference.
- macOS-first Tauri application scaffolding with Windows support and best-effort Linux support.

[Unreleased]: https://github.com/iammrduncan/zd/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/iammrduncan/zd/releases/tag/v0.1.0
