# Changelog

## 1.0.1 — testable prototype

- Replaced the root browser/Tauri product with a native Rust Ratatui/Crossterm workbench; preserved
  the historical product under `v0/`.
- Added an ignore-aware project tree, project search, UTF-8 editing, mouse selection, save,
  undo/redo, find/replace, active-row viewports, and narrow-terminal layouts.
- Added safe source-mapped Markdown Read mode with inert raw HTML and no remote image fetching.
- Added versioned source-anchored review comments with deterministic re-anchoring and visible
  detached state.
- Added bounded Herdr agent discovery, target selection, payload preview, explicit submission, and
  manual fallback without shell interpolation.
- Added capability-gated RGBA clipboard image ingestion, validated PNG encoding, content-hash reuse,
  document-local `zd-images/` storage, and one-edit Markdown insertion.
- Added deterministic application/UI tests and real PTY quit, error, mouse, feature-workflow, and
  terminal-restoration smokes.

No v1.0.1 tag or published release exists. Ghostty and same-host graphical clipboard acceptance
remain owner-run checks.
