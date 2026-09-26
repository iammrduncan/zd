# Terminal editor landscape

Fast-moving findings checked **2026-09-26**. Popularity was not used as evidence.

## Sources

### Helix

- [Workspace manifest](https://github.com/helix-editor/helix/blob/master/Cargo.toml)
- [Architecture](https://github.com/helix-editor/helix/blob/master/docs/architecture.md)
- [Terminal editor/mouse implementation](https://github.com/helix-editor/helix/blob/master/helix-term/src/ui/editor.rs)
- [Picker and workspace-search documentation](https://docs.helix-editor.com/master/pickers.html)
- [Selection-first editing](https://docs.helix-editor.com/master/usage.html)
- [Editor configuration, including mouse support](https://docs.helix-editor.com/master/editor.html)

### Neovim

- [Repository and source layout](https://github.com/neovim/neovim/blob/master/README.md)
- [License](https://github.com/neovim/neovim/blob/master/LICENSE.txt)
- [API and extmarks](https://neovim.io/doc/user/api)
- [External UI protocol](https://neovim.io/doc/user/api-ui-events/)
- [`--embed`](https://neovim.io/doc/user/starting/)
- [Developer architecture](https://neovim.io/doc/user/dev_arch/)
- [Search and substitution](https://neovim.io/doc/user/change/)

### Kakoune

- [Repository](https://github.com/mawww/kakoune)
- [Design rationale](https://kakoune.org/why-kakoune/why-kakoune.html)
- [Commands and hooks](https://github.com/mawww/kakoune/blob/master/doc/pages/commands.asciidoc)
- [Control socket/interface](https://github.com/mawww/kakoune/blob/master/doc/interfacing.asciidoc)
- [Scripting](https://github.com/mawww/kakoune/blob/master/doc/writing_scripts.asciidoc)
- [File-explorer position](https://github.com/mawww/kakoune/blob/master/doc/pages/faq.asciidoc)
- [Unlicense](https://github.com/mawww/kakoune/blob/master/UNLICENSE)

### Amp and Scribe

- [Amp repository](https://github.com/jmacdonald/amp)
- [Amp manifest](https://github.com/jmacdonald/amp/blob/main/Cargo.toml)
- [Amp license](https://github.com/jmacdonald/amp/blob/main/LICENSE)
- [Amp usage limitations](https://amp.rs/docs/usage/)
- [Amp configuration/file-manager integration](https://amp.rs/docs/configuration/)
- [Scribe editor toolkit](https://github.com/jmacdonald/scribe)

### Lapce and Floem

- [Lapce repository](https://github.com/lapce/lapce)
- [Lapce architecture](https://docs.lapce.dev/development/architecture)
- [Floem workspace manifest](https://github.com/lapce/floem/blob/main/Cargo.toml)
- [`floem-editor-core` manifest](https://github.com/lapce/floem/blob/main/editor-core/Cargo.toml)
- [`floem-editor-core` modules](https://github.com/lapce/floem/blob/main/editor-core/src/lib.rs)
- [Floem editor view implementation](https://docs.rs/floem/latest/src/floem/views/editor/mod.rs.html)

### Fresh

- [v0.5.1 README](https://github.com/sinelaw/fresh/blob/v0.5.1/README.md)
- [Workspace manifest](https://github.com/sinelaw/fresh/blob/v0.5.1/Cargo.toml)
- [`fresh-editor` features and dependencies](https://github.com/sinelaw/fresh/blob/v0.5.1/crates/fresh-editor/Cargo.toml)
- [Internal architecture](https://github.com/sinelaw/fresh/blob/v0.5.1/docs/internal/00-overview.md)
- [Plugin architecture](https://github.com/sinelaw/fresh/blob/v0.5.1/docs/internal/plugins.md)
- [Search, replace, and known correctness defects](https://github.com/sinelaw/fresh/blob/v0.5.1/docs/internal/search-and-diff.md)
- [Mouse drag-selection analysis](https://github.com/sinelaw/fresh/blob/v0.5.1/docs/internal/terminal-drag-select-exit-analysis.md)
- [Markdown compose mode](https://github.com/sinelaw/fresh/blob/v0.5.1/docs/internal/editor-ux-features.md)
- [GPL-2.0 license](https://github.com/sinelaw/fresh/blob/v0.5.1/LICENSE)

### mdt

- [Repository and README](https://github.com/PPRAMANIK62/mdt)
- [Manifest](https://github.com/PPRAMANIK62/mdt/blob/main/Cargo.toml)
- [Application ownership](https://github.com/PPRAMANIK62/mdt/blob/main/src/app/mod.rs)
- [File-tree implementation](https://github.com/PPRAMANIK62/mdt/blob/main/src/file_tree.rs)
- [Editor wrapper](https://github.com/PPRAMANIK62/mdt/blob/main/src/input/editor.rs)
- [Search implementation](https://github.com/PPRAMANIK62/mdt/blob/main/src/input/search.rs)
- [Mouse handling](https://github.com/PPRAMANIK62/mdt/blob/main/src/input/mouse.rs)
- [Markdown rendering pipeline](https://github.com/PPRAMANIK62/mdt/blob/main/src/markdown/mod.rs)

### Oride

- [Repository](https://github.com/ori-team/oride)
- [Rust workspace manifest](https://github.com/ori-team/oride/blob/main/Cargo.toml)
- [Rope-backed Rust document model](https://github.com/ori-team/oride/blob/main/crates/oride-core/src/document.rs)
- [Project search and replace](https://github.com/ori-team/oride/blob/main/crates/oride-search/src/lib.rs)
- [Mouse handler](https://github.com/ori-team/oride/blob/main/crates/oride-app/src/app/mouse_handler.rs)
- [Authoritative migration/refactoring plan](https://github.com/ori-team/oride/blob/main/docs/migration/refactoring-plan.md)

### Focused Rust components

- [`ratatui-textarea`](https://github.com/ratatui/ratatui-textarea)
- [`ratatui-textarea` mouse-selection example](https://github.com/ratatui/ratatui-textarea/blob/main/examples/minimal.rs)
- [`tui-textarea-2` documentation](https://docs.rs/tui-textarea-2/latest/tui_textarea/)
- [`edtui`](https://github.com/preiter93/edtui)
- [`modalkit`](https://github.com/ulyssa/modalkit)

## Established facts

- **Helix** has the cleanest full Rust editor decomposition: `helix-core` contains editing primitives, `helix-view` owns editor/view state, and `helix-term` plus `helix-tui` implement the application and terminal renderer. It supports multiple selections, regex/project search, replacement, syntax support, and text mouse drag. Its user-facing architecture does not expose a stable public plugin or embedding boundary for replacing the surrounding product UI. A derivative also introduces MPL-2.0-covered files.

- **Neovim** has the strongest supported embedding boundary. It can run over stdio Msgpack-RPC, provides an external-grid UI protocol, and exposes extmarks that follow text edits—particularly useful for comment anchors. It is nevertheless a C editor process/library with Lua/Vimscript/RPC extension points, not a Rust editor component.

- **Kakoune** offers an unusually good selection-first model, hooks, shell integration, and a control socket. It deliberately delegates windowing and file exploration to external tools. It is C++20, Unix-oriented, and not an embeddable Rust library.

- **Amp** is a Rust application built over its extracted MIT-licensed **Scribe** toolkit. Amp itself is GPL-3.0-or-later and lacks required capabilities such as a built-in tree and complete project search/replace. Scribe provides buffers, cursors, undo, search, lexing, and workspace primitives, but no terminal renderer, tree, or mouse-to-buffer mapping.

- **Lapce** is a native GUI editor. **Floem** uses `winit`/GPU-oriented rendering and is therefore the wrong presentation layer. Its MIT-licensed `floem-editor-core` is independently interesting: it separates buffers, commands, cursor/movement, and selections from GUI rendering. Terminal layout and mouse hit-testing would remain `zd` work.

- **Fresh v0.5.1** is the closest functional match: Rust terminal editor, file explorer, project search, query replacement, multi-cursor/block selection, full mouse support, Markdown compose/preview, and a broad TypeScript/QuickJS plugin surface. It is also a 13-crate GPL-2.0 workspace spanning terminal, GUI/web, client/server, PTY, LSP, plugin runtime, updater, and orchestration concerns. Feature flags reduce compilation surface but do not remove the source-level ownership and coupling. Its own search document records project-replace defects: replacement bypasses undo and repeated application can use stale offsets and corrupt a file.

- **mdt** is compact and MIT-licensed, but source inspection contradicts the impression of a near-complete match. Its tree accepts only Markdown, skips dotfiles, and stops at depth five. “File search” filters filenames; document search scans rendered preview lines; there is no project-content search or replacement. Mouse support changes focus and scrolls but does not position the editor cursor or drag-select text. Editing wraps `ratatui-textarea` and implements only a shallow subset of normal-mode commands.

- **Oride’s Rust code** contains a Rope-backed buffer, selections/multi-cursor state, project search/replace, drag selection, syntax infrastructure, and Markdown-preview code. However, the active repository is migrating to Go. Its own plan says the Rust crates will be tagged and archived, while the Go replacement still lacks several required features. Forking it adopts a broad, effectively orphaned Rust workspace.

- **Focused widgets** solve only part of the product:
  - `ratatui-textarea` has editing, selection, undo/redo, search, wrapping, scrolling, and demonstrated mouse hit-testing/drag selection, but its document representation is `Vec<String>`.
  - `edtui` is explicitly an embeddable editor widget with Vim/Emacs input, mouse selection, wrapping, search, and highlighting.
  - `modalkit` provides reusable modal-editing behavior rather than a complete document/editor surface.
  - None supplies the project tree, comments, handoff protocol, Markdown reader, or durable annotation anchors.

## Upstream claims

- Fresh describes itself as a complete terminal editor and advertises full mouse interaction, Markdown compose mode, file exploration, project search, and sandboxed TypeScript plugins. Its source and internal documents substantiate most of those claims, with the noted project-replace correctness exceptions.

- mdt advertises a file tree, Vim-style editor, live Markdown preview, search, and mouse. The implementation supports narrower forms of each; it does not meet the planned workspace-search, proper code-editing, or text-selection requirements without substantial additions.

- Helix describes itself as selection-first and supports external language tooling through LSP/debug adapters. That is not equivalent to an application-extension API for `zd` panels, comments, handoff, or Markdown-reading views.

- Floem describes itself as still maturing before a stable 1.0 API. That increases version-pin and integration risk even though its headless editor core is well factored.

## Inferences

- **A Fresh plugin is the only extend option that plausibly beats a focused build on delivery time.** It already has almost all generic editor behavior, and its plugin API exposes commands, overlays, virtual text, view transforms, panels, widgets, search, and terminals. The trade is architectural: Fresh becomes the host product, product-specific extensions are TypeScript/QuickJS rather than Rust, and GPL distribution implications need explicit acceptance.

- **Do not fork and subtract Fresh.** Its feature flags are useful for builds, but the central editor/application layer still spans many product concerns. Removing daemon, GUI/web, PTY, LSP, updater, orchestration, and plugin facilities while retaining the mature editor is a long-lived fork, not a shortcut.

- **Do not fork Helix merely for `helix-core`.** Its editor behavior is mature, but the terminal UI, command system, and views are internal layers of one application. The missing stable extension seam and MPL-covered modifications outweigh reuse unless `zd` deliberately becomes a Helix derivative.

- **Do not treat mdt as the implementation base.** It is valuable reference code for Markdown block rendering, rewrapping, and source-line mapping. Most difficult workspace and editing behavior still has to be built, so a fork adds inherited application assumptions without removing the central work.

- **Do not adopt the Oride Rust workspace.** Its technical breadth is attractive, but upstream has explicitly chosen to archive it. That transfers ownership of sixteen crates and their integration surface to `zd` on day one.

- **Neovim is the best non-Rust-host option.** RPC, external UI, and extmarks fit comments and handoff well. It should only be chosen if “Rust-native editor” is relaxed; otherwise the additional editor process/protocol becomes a second runtime and product boundary.

- Comment anchors require more than a visual widget. The document abstraction should expose ranges or markers that transform as edits occur, analogous to Neovim extmarks or Helix selections. A `TextArea` embedded directly in global application state would make this difficult to retrofit.

## Scored Build vs Extend matrix

Scale: 1 poor, 5 strong. Weights: requirements coverage 30%, Rust/TUI fit 15%, extension boundary 15%, MIT-project license fit 15%, low subtraction cost 15%, upstream direction/risk 10%. “License fit” is an engineering-policy assessment, not legal advice.

| Candidate | Coverage | Rust/TUI | Extension | License | Subtraction | Direction | Weighted |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Focused build using editor components** | 4 | 5 | 5 | 5 | 5 | 4 | **92/100** |
| **Fresh plugin/host extension** | 5 | 3 | 5 | 2 | 5 | 4 | **84/100** |
| **Floem editor-core + focused terminal UI** | 3 | 5 | 4 | 5 | 5 | 3 | **81/100** |
| **Neovim embedded/external UI** | 5 | 1 | 5 | 4 | 3 | 5 | **79/100** |
| **mdt fork** | 3 | 5 | 2 | 5 | 4 | 3 | **72/100** |
| **Oride Rust fork** | 4 | 5 | 3 | 5 | 1 | 1 | **68/100** |
| **Helix fork** | 4 | 5 | 2 | 3 | 1 | 4 | **65/100** |
| **Fresh fork-and-strip** | 5 | 5 | 2 | 1 | 1 | 4 | **65/100** |
| **Kakoune wrapper** | 3 | 1 | 3 | 5 | 3 | 4 | **62/100** |
| **Amp fork** | 2 | 5 | 2 | 1 | 2 | 2 | **46/100** |

## Recommendation

**Build a focused MIT Rust TUI, while reusing a narrow editor component rather than implementing every editing primitive from zero.**

Use an application-owned boundary such as `Document`/`EditorSurface`; keep workspace tree, project search/replace, comments, handoff, and Markdown reading outside the widget. Prototype `ratatui-textarea` or `edtui` behind that boundary, with acceptance tests for Unicode graphemes, tabs, wrapped-line mouse mapping, drag selection, multi-line replacement, undo grouping, large files, and bracketed paste. If the widget fails the file-size or marker requirements, replace its document core with Ropey or evaluate `floem-editor-core`; the rest of the application should not change.

Reuse or adapt mdt’s Markdown block/rewrap/source-line-map ideas under its MIT license, but do not inherit the entire app. Use Helix and Neovim as behavioral references for selection transformation and persistent anchors.

Keep **Fresh-as-host** as a deliberate alternative decision:

- If GPL hosting/distribution, QuickJS/TypeScript extensions, and Fresh owning the surrounding application are acceptable, extend Fresh; it is the fastest credible path.
- If the product must remain a focused MIT Rust executable whose primary abstractions `zd` owns, do not fork or embed Fresh.

Reject full forks of Helix, Fresh, Amp, and Oride; reject Neovim/Kakoune embedding unless the Rust-native constraint is explicitly relaxed.

## Gaps

- No candidate was compiled or benchmarked; API and source inspection should be followed by short spikes.
- Fresh’s plugin API needs a proof for a persistent project tree, editable comment anchors, handoff, and image-paste workflow.
- Clipboard image ingestion is not substantively supplied by any evaluated editor and remains product-specific.
- Exact GPL/MIT distribution implications require legal review before choosing Fresh or Amp.
- `ratatui-textarea`, `edtui`, and `floem-editor-core` still need corpus testing for Unicode, wide characters, tabs, wrap/hit-test agreement, undo semantics, and large files.
- The annotation transformation model—byte offsets, character offsets, or persistent markers—remains an architectural decision.

Research completed in approximately 8 minutes 42 seconds.
