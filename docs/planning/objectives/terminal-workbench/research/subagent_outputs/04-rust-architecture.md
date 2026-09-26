Research date: **2026-09-26**. All external evidence below is from primary upstream documentation, manifests, or source repositories.

## Sources

- [Ratatui architecture](https://github.com/ratatui/ratatui/blob/main/ARCHITECTURE.md), [Ratatui `TestBackend`](https://docs.rs/ratatui/latest/ratatui/backend/struct.TestBackend.html)
- [Crossterm events](https://docs.rs/crossterm/latest/crossterm/event/index.html), [mouse limitations](https://docs.rs/crossterm/latest/crossterm/event/struct.MouseEvent.html), [OSC 52 clipboard](https://docs.rs/crossterm/latest/crossterm/clipboard/struct.CopyToClipboard.html)
- [Ropey](https://docs.rs/ropey/latest/ropey/struct.Rope.html), [Crop](https://docs.rs/crop/latest/crop/)
- [ratatui-textarea](https://docs.rs/ratatui-textarea/latest/ratatui_textarea/struct.TextArea.html), [mouse-selection example](https://github.com/ratatui/ratatui-textarea/blob/main/examples/minimal.rs)
- [Tree-sitter incremental editing](https://docs.rs/tree-sitter/latest/tree_sitter/struct.Parser.html), [syntax highlighting](https://tree-sitter.github.io/tree-sitter/3-syntax-highlighting.html)
- [Syntect](https://github.com/trishume/syntect), [Syntect API](https://docs.rs/syntect/latest/syntect/)
- [ripgrep architecture and behavior](https://github.com/BurntSushi/ripgrep/blob/master/README.md), [`grep-searcher`](https://docs.rs/grep-searcher/latest/grep_searcher/struct.Searcher.html), [`ignore::WalkBuilder`](https://docs.rs/ignore/latest/ignore/struct.WalkBuilder.html)
- [`notify::Watcher`](https://docs.rs/notify/latest/notify/trait.Watcher.html), [notify platform support](https://github.com/notify-rs/notify/blob/main/README.md)
- [Arboard](https://github.com/1Password/arboard), [`Clipboard::get_image`](https://docs.rs/arboard/latest/arboard/struct.Clipboard.html)
- [Termwiz input](https://docs.rs/termwiz/latest/termwiz/input/enum.InputEvent.html), [capability detection](https://docs.rs/termwiz/latest/termwiz/caps/index.html), [testable surfaces](https://docs.rs/termwiz/latest/termwiz/surface/struct.Surface.html)
- [Cursive backend API](https://docs.rs/cursive/latest/cursive/backend/index.html), [runner](https://docs.rs/cursive_core/latest/cursive_core/struct.CursiveRunner.html)
- [`mdt` manifest](https://github.com/PPRAMANIK62/mdt/blob/main/Cargo.toml), [`mdt` source](https://github.com/PPRAMANIK62/mdt/tree/main/src)
- [Fresh workspace manifest](https://github.com/sinelaw/fresh/blob/master/Cargo.toml), [`fresh-editor-core`](https://github.com/sinelaw/fresh/tree/master/crates/fresh-editor-core), [`fresh-ui`](https://github.com/sinelaw/fresh/tree/master/crates/fresh-ui)
- [Oride workspace manifest](https://github.com/poppy-team/oride/blob/main/Cargo.toml), [architecture](https://github.com/poppy-team/oride/blob/main/docs/en/design.md), [`oride-core`](https://github.com/poppy-team/oride/tree/main/crates/oride-core), [`oride-search`](https://github.com/poppy-team/oride/tree/main/crates/oride-search)

## Established facts

- Ratatui 0.30.x separates core, widgets, and terminal backends. It renders terminal cells but does not own input handling or application state. Its `TestBackend` records the complete screen buffer, cursor position, visibility, and scrollback for deterministic integration tests.
- Crossterm 0.29 emits key, mouse, paste, focus, and resize events. Mouse capture must be enabled. Modifier/button reporting varies by platform and terminal. Its event reader and async stream must not be used concurrently.
- `ratatui-textarea` 0.9.2 supplies editing, undo/redo, regex search, selection, wrapping, and the coordinate conversion needed for mouse selection. Its document representation is `Vec<String>`, and it exposes state rather than edit deltas. That makes it useful for palette/search inputs, but a poor ownership boundary for persistent comments, syntax invalidation, and stable source anchors.
- Ropey 1.6.1 is an in-memory UTF-8 rope. Nearly all edits and index conversions are worst-case `O(log N)`. Its editing unit is Unicode scalar values, not grapheme clusters or terminal cells.
- Crop 0.4.3 is a credible byte-offset-oriented rope alternative with logarithmic edits and optional grapheme/UTF-16 metrics. It is younger and less represented in the inspected editor implementations.
- Tree-sitter can incrementally reuse an old parse tree, but only if every document edit is also expressed accurately as an `InputEdit` in byte and row/column coordinates. Each bundled language also brings a versioned grammar and highlight-query dependency.
- Syntect 5.3 supports per-line parse-state caching. Its pure-Rust `fancy-regex` backend avoids a native Oniguruma dependency, but upstream documents it as slower, especially in debug builds.
- The ripgrep crates expose streaming search over files/readers plus `.gitignore`-aware traversal. `ignore::WalkBuilder` does not follow symlinks by default and supports file-size, depth, hidden-file, and parallelism limits.
- `notify` 8.2.0 selects native backends per platform and provides a polling fallback. Its own documentation warns that rename/remove behavior can differ by platform. Watch events therefore cannot be the authoritative tree state.
- Arboard 3.6.1 can read decoded RGBA image data on macOS, Windows, X11, and supported Wayland compositors. Wayland image access requires optional data-control protocols. Crossterm’s OSC 52 support is output-only clipboard copy; it does not read clipboard images.
- Termwiz has richer input/capability modeling, including pixel mouse events and test-inspectable surfaces. Its capability detection documentation explicitly describes terminfo staleness and multiplexer interference.
- Cursive provides higher-level retained views, a multiline `TextArea`, pluggable backends, manual event-loop stepping, and dummy/puppet test backends. A specialized editor would still need a substantial custom view and document engine.

Candidate validation:

- `mdt` 0.3.0 is MIT and already combines Ratatui 0.30, Crossterm 0.29, pulldown-cmark, Syntect, `tui-tree-widget`, `ratatui-textarea`, and `notify`. Its manifest declares only a binary, and its application/source modules are private. Its primary editor is `ratatui-textarea`; its tree is Markdown-specific; it lacks project-wide content search. It is a useful interaction/reference implementation, not a reusable crate boundary.
- Fresh’s current workspace manifest is version 0.5.1 and GPL-3.0-or-later. It does expose real library crates: `fresh-core`, `fresh-editor-core`, backend-agnostic `fresh-ui`, and a dedicated terminal input parser. Reusing that code in a distributed combined work would require GPL-compliant distribution, changing zd’s present MIT-only licensing expectations. Its dependency and feature surface includes plugins, JavaScript execution, LSP, embedded terminals, client/server IPC, GUI and web modes.
- Oride 0.2.0 is MIT and actually exposes separate UI-free `oride-core`, `oride-fs`, `oride-search`, `oride-syntax`, `oride-ui`, and `oride-app` crates. However:
  - the crates are workspace path dependencies rather than a demonstrated stable external API;
  - its core cursor columns are Unicode scalar counts, not grapheme/cell positions;
  - its tree uses direct `read_dir` recursion rather than `.gitignore` semantics;
  - its search path either buffers an external `rg --json` process completely or falls back to whole-file UTF-8 reads, with no cancellation;
  - its watcher drops backend errors and uses modification times to suppress self-writes;
  - its clipboard module is text-only;
  - its current repository redirects from `ori-team` to `poppy-team`, includes a Go implementation, and describes the Rust conformance runner as an oracle for that port. This is a material upstream-direction risk.

## Upstream claims

These are not independently benchmarked here.

- **Upstream claim:** Ropey can edit multi-gigabyte files with predictable microsecond-scale operations and approximately 10% text-storage overhead.
- **Upstream claim:** Tree-sitter is fast enough to parse on every keystroke and remains useful while source contains syntax errors.
- **Upstream claim:** Syntect’s checkpoint caching can make visible re-highlighting effectively independent of total file size.
- **Upstream claim:** `mdt` has dirty-only redraw, pre-warmed highlighting, live Markdown preview, and panic-safe teardown.
- **Upstream claim:** Oride supports project replace, rich Markdown images, mouse selection, multiple splits, LSP, and PTY integration. Some supporting code exists, but this research did not build or execute the repository.
- **Unverifiable in this read-only pass:** build health, behavioral completeness, and release reproducibility for `mdt`, Fresh, and Oride.
- **Unverifiable:** real Ghostty/Herdr/tmux behavior for host image-paste and pane handoff. That requires hardware/process testing from research line 3.

## Architecture A

### Focused zd TUI with owned editor core

Use one headless library crate plus one binary:

```text
zd-core
├── document       deep editor model
├── workspace      tree, search, watch reconciliation
├── markdown       source-to-screen projection
├── review         comments and handoff payloads
└── image          validated asset ingestion

zd
├── app            state machine, commands, effects, job generations
├── ui             Ratatui rendering and hit regions
└── platform       Crossterm, clipboard, filesystem, process adapters
```

Core dependency set:

- Ratatui 0.30.x + Crossterm 0.29
- Ropey 1.6.1
- `unicode-segmentation` + `unicode-width`
- pulldown-cmark 0.13
- Syntect 5.3 for v1 code/fence highlighting
- `ignore`, `grep-searcher`, and `grep-regex`
- notify 8.2 plus the compatible mini debouncer
- Arboard 3.6.1 with image support; optional Wayland data-control support
- a PNG encoder for normalized clipboard images

Do not use `ratatui-textarea` as the primary document. It is acceptable for one-line palette/find fields.

The deep boundary should be `Document`, not `Buffer`:

```rust
Document::apply(Command) -> ChangeSet
Document::snapshot(Viewport) -> DocumentSnapshot
Document::selection() -> SourceRange
Document::replace(FindQuery, Replacement, Scope) -> ReplaceReport
```

It owns, and does not leak:

- Ropey and byte/scalar/grapheme/cell conversions;
- cursor and selection state;
- mouse hit-to-source mapping;
- grouped undo/redo;
- find/replace;
- dirty/version/save state;
- comment-anchor transformations;
- syntax-cache invalidation;
- the exact `InputEdit` shape if Tree-sitter is added later.

`Workspace` should similarly hide traversal, lazy tree expansion, ignore policy, bounded streaming search, search cancellation, and watcher-triggered rescans. Watch signals invalidate a subtree or file; a fresh scan remains authoritative.

The app uses one UI thread and bounded worker channels. Every background result carries a generation/document version; stale search, highlight, Markdown, and watch results are discarded. Tokio is unnecessary for this prototype.

Agent handoff is an adapter that invokes an explicitly configured executable and argument vector, sends the selected text plus metadata over stdin, and never invokes a shell.

Image ingestion is one transaction:

1. Read RGBA from the local clipboard adapter.
2. Validate dimensions and a decoded-byte limit.
3. Encode PNG off the UI thread.
4. Resolve and create `<project>/zd-images` without traversing symlinks outside the root.
5. Install a uniquely named file atomically.
6. Insert the project-relative Markdown link as one undo group.
7. Remove the new image if document insertion fails before commit.

## Architecture B

### Pin and strip an Oride fork

Fork an exact Oride commit rather than depending on a moving Git branch. Retain:

- `oride-core`
- selected portions of `oride-fs`
- `oride-search`
- `oride-syntax`
- `oride-ui`
- the minimal event-loop composition from `oride-app`

Delete from the product surface:

- embedded PTY;
- LSP;
- Git mutation;
- tasks;
- plugins;
- dynamic grammars;
- localization;
- SCM panels and IDE menus.

Then make these replacements before calling it a zd prototype:

- Replace Oride’s raw `read_dir` tree with one `ignore`-backed workspace policy shared by tree and search.
- Remove recursive delete and other out-of-scope mutation paths.
- Replace scalar-only cursor movement with grapheme-aware movement and explicit terminal-cell mapping.
- Replace buffered `Command::output` project search with cancellable streaming search.
- Rework watcher handling to debounce and rescan; never infer truth solely from event kinds or mtimes.
- Add Markdown source mapping, comments, agent handoff, and clipboard-image ingestion.
- Put all product commands through one typed `Action`/effect boundary and preserve Oride’s headless conformance concept.
- Pin Oride’s existing Ratatui 0.29/Crossterm 0.28 initially. Upgrade only after the stripped slice passes, because doing both simultaneously obscures regressions.

This is the faster route to visible editor behavior, but not the smaller long-term system. The subtraction and correctness work touches almost every retained crate.

## Decision matrix

Scores: 5 is best for zd.

| Option | Product fit | Minimality | Editor foundation | Testability | License | Dependency/upstream risk |
|---|---:|---:|---:|---:|---:|---:|
| Architecture A: focused Ratatui/Crossterm | 5 | 5 | 3 | 5 | 5 | 4 |
| Architecture B: stripped Oride fork | 4 | 2 | 3 | 4 | 5 | 2 |
| Fork `mdt` | 3 | 3 | 2 | 4 | 5 | 3 |
| Reuse Fresh | 4 | 1 | 5 | 5 | 1 | 2 |
| Cursive + custom editor | 2 | 3 | 2 | 4 | 5 | 3 |
| Ratatui + Termwiz backend | 4 | 3 | 3 | 4 | 5 | 3 |

Ratatui/Crossterm wins because zd needs cell-level rendering, explicit hit regions, and complete ownership of document/source mapping. Cursive’s view/callback model saves little once the editor and Markdown view are custom. Termwiz’s pixel mouse and capability model are attractive, but they do not eliminate document/workspace complexity and increase backend surface. Keep terminal input/output behind one narrow adapter so a later Termwiz experiment is possible without changing the core.

## Recommendation

Choose **Architecture A**.

The engineering-skill gut check is: build the focused application because the differentiated problem—one truthful source model shared by editing, readable Markdown, comments, and handoff—does not exist as a reusable dependency in the inspected candidates. Oride would change this recommendation if it stabilizes the Rust implementation as its primary product, fixes grapheme/search/watch behavior, and publishes supported crate APIs.

For v1.0.1:

- Use Ropey 1.6.1, not its 2.0 alpha and not a home-grown rope.
- Use Syntect rather than Tree-sitter initially. Syntax color is not the differentiated feature, and Tree-sitter requires grammar/version/query management plus precise edit bookkeeping. Preserve only an internal `highlight(viewport)` boundary, not a public abstraction hierarchy.
- Use `ignore` plus the ripgrep library crates in-process. Do not require an installed `rg`.
- Use `notify` only as an invalidation signal.
- Use Arboard only for local OS clipboard image reads. Report “image clipboard unavailable in this environment” without modifying the document when unavailable.
- Port the behavior and security tests from the existing v0 tree/watch/image code, but do not make the new root crate depend on archived `v0`.

Proposed performance constraints—not upstream claims:

- Render work is proportional to visible terminal cells/rows, not document or workspace size.
- Keystrokes, cursor movement, and mouse drag perform no filesystem I/O and dispatch no unbounded work.
- All search, traversal, syntax warm-up, Markdown projection for large files, watcher reconciliation, and PNG encoding occur off the UI thread.
- Bound open editable files at 10 MiB for v1.0.1; show a read-only/truncated explanation above that limit.
- Bound one tree snapshot at 50,000 entries and one search at 10,000 hits; expose truncation.
- Use a 100–200 ms watch debounce and generation-based coalescing.
- Set an acceptance target of p95 below 25 ms from synthetic input dispatch to completed `TestBackend` frame on the reference machine.
- On a checked-in deterministic 20,000-file fixture, require first visible tree rows within 250 ms and first 100 literal-search results within 500 ms on the reference CI runner. Record the runner specification with results; do not call these portable guarantees.
- Maintain bounded channels and at most one active generation each for tree scan, project search, and document projection.

## Test matrix

| Gate | Driver/fixture | Required assertion |
|---|---|---|
| CLI launch | Spawn binary in a PTY with a temporary project | Enters raw/alternate screen, draws selected file/tree, accepts input, exits zero |
| Terminal restoration | Normal quit, error return, panic hook, termination signal where supported | Raw mode, mouse capture, bracketed paste, cursor and alternate screen are restored |
| Tree mechanics | Nested fixture with `.gitignore`, hidden files, symlink loop, unreadable directory, >limit entries | Directories sort before files; expand/collapse/parent navigation works; ignored paths agree with search; no symlink escape; truncation is visible |
| Collapsed navigation | Ratatui `TestBackend` at wide and narrow sizes | File tree can disappear completely; open file receives freed width; focus and cursor remain stable |
| Open/edit/save | Scripted actions against a real temporary file | Insert/delete/newline/save/reopen round-trips exact bytes and dirty state |
| Unicode editing | Combining marks, emoji ZWJ sequences, CJK wide cells, tabs, CRLF | Left/right/backspace operate on defined grapheme units; screen-to-source mapping is stable; save preserves configured line ending |
| Mouse selection | Constructed Crossterm press/drag/release events over wrapped lines | Hit mapping selects the intended source range; dragging outside viewport scrolls in bounded steps |
| Undo/redo | Typing, paste, replace-all, image insertion | Each semantic operation is one expected undo group; redo restores exact content and selection |
| Find/replace | Literal and regex fixture with Unicode and zero-width-match cases | Next/previous wrap correctly; replace-one/all terminate; match counts and cursor placement are correct |
| Workspace search | Multi-directory fixture with ignored, hidden, binary, oversized and invalid-UTF-8 files | Results stream in stable order, contain byte/source locations, honor policy, truncate visibly, and never emit terminal control data |
| Search cancellation | Start slow query, immediately issue another | Old generation cannot mutate results or status after replacement query begins |
| Markdown projection | Golden source containing headings, nested lists, tables, links, fenced code, long wraps | Rendered rows and every selectable span map back to the exact source byte range |
| Comment anchoring | Select text, add comment, edit before/inside/through anchor, reopen | Anchors shift deterministically; ambiguous/deleted anchors become visibly orphaned rather than silently moving |
| Agent handoff | Fake executable captures argv/stdin/environment | Exact selected bytes and bounded metadata arrive on stdin; metacharacters are not shell-evaluated; non-zero exit is reported |
| Image insertion | Fake clipboard RGBA plus real temp workspace | PNG is valid, stored under `zd-images`, link is relative, collision-safe, one undo group; failure leaves neither partial file nor partial Markdown |
| Clipboard unavailable | Adapter returns unsupported/occupied/remote error | Specific notice; no file or document mutation |
| Watch reconciliation | Real temp directory: atomic save, rename, create/delete burst; dirty open buffer | Tree converges after debounce; clean file reloads; dirty file raises conflict and is never overwritten |
| Renderer snapshots | Ratatui `TestBackend` at 40×12, 80×24, 160×50 | Deterministic text/style/cursor snapshots; no panic at zero/tiny areas |
| State-machine fuzz/property | Random action sequences over small Unicode buffers | Cursor/selection remain valid; undo round-trip restores original bytes; render never indexes outside viewport |
| Performance | Fixed 10 MiB document and 20,000-file fixture in release mode | Meets the explicit reference-machine budgets above; memory and queue depth remain bounded |
| Ghostty smoke | Real Ghostty, with and without Herdr/tmux/Zellij as applicable | Keyboard modifiers, bracketed paste, wheel, drag selection, resize, text clipboard, cleanup |
| Image compatibility | Real macOS clipboard; Linux X11 and supported Wayland when available | Image paste succeeds locally; remote/multiplexer cases report capability accurately |
| Packaging | Clean checkout on supported targets | Locked build, tests, license inventory, `cargo audit`, and installed binary smoke pass |

The first eighteen rows are automated release gates except platform-specific signal cases. The last three are release smoke gates because a fake backend cannot prove emulator, multiplexer, or host clipboard behavior.

## Risks

- Ratatui is a renderer, not an editor architecture. Allowing widgets to own product state would recreate shallow, coupled modules.
- Grapheme indices, UTF-8 byte offsets, terminal cells, and parser rows are four different coordinate systems. All conversion must be centralized in `Document`.
- `ratatui-textarea` would accelerate a demo but make comment and syntax anchors dependent on reconstructing edits from snapshots.
- Syntect’s pure-Rust backend may miss the proposed frame budget. Measure release builds before switching to native Oniguruma or Tree-sitter.
- Tree-sitter grammar and runtime versions must stay compatible. Adding many grammars materially increases build time, binary size, and update work.
- The ripgrep component crates remain pre-1.0. Pin exact compatible versions and wrap them inside `Workspace`.
- Watcher events are lossy and platform-specific. Treating them as direct mutations will eventually desynchronize the tree.
- Arboard can fail in headless, SSH, sandboxed, pure-Wayland, or occupied-clipboard environments. Image paste is a capability, not a universal terminal guarantee.
- A clipboard image is decoded untrusted input. Check dimension multiplication, decoded byte count, output path, symlinks, and filename collision before writing.
- OSC 52 copies text outward; it is not a portable image-read mechanism.
- Fresh reuse introduces GPL distribution obligations and a very large product surface.
- Oride has the closest modular shape, but its ongoing Go-port evidence, repository move, 0.2 status, and concrete correctness gaps make a fork a product-maintenance bet.
- `mdt` demonstrates the desired Markdown feel, but importing its private binary modules would couple zd to its `Vec<String>` editor and Markdown-only tree assumptions.

## Gaps

- No candidate repository was built or executed because this research was explicitly read-only. Candidate build health remains **unverified**.
- Herdr’s exact command/pane handoff contract belongs to research line 3 and is not defined here.
- The authoritative persisted comment format and Markdown source-mapping rules belong to research line 4.
- Host image clipboard access through Ghostty plus each multiplexer remains **unverified on real hardware**.
- Reference CI hardware and final supported OS matrix have not been selected, so proposed timing thresholds are not yet calibrated.
- Binary/non-UTF-8 editing policy is unresolved. For v1.0.1, the safest default is to reject editing with a clear message rather than perform lossy decoding.
- Conflict policy for externally changed dirty buffers needs an explicit product decision; the safe prototype behavior is retain local content and require reload/overwrite choice.
