## Sources

Primary upstream sources inspected on 2026-09-26:

- [pulldown-cmark repository and source-map API](https://github.com/pulldown-cmark/pulldown-cmark)
- [pulldown-cmark `OffsetIter`](https://docs.rs/pulldown-cmark/latest/pulldown_cmark/struct.OffsetIter.html)
- [Comrak `Sourcepos`](https://docs.rs/comrak/latest/comrak/nodes/struct.Sourcepos.html)
- [Comrak changelog, including inline-source-position warning](https://github.com/kivikakk/comrak/blob/main/CHANGELOG.md)
- [markdown-rs `Position`](https://docs.rs/markdown/latest/markdown/unist/struct.Position.html)
- [Tree-sitter incremental parsing](https://tree-sitter.github.io/tree-sitter/using-parsers/3-advanced-parsing.html)
- [syntect parsing and cache behavior](https://docs.rs/syntect/latest/syntect/parsing/struct.ParseState.html)
- [tui-markdown 0.3.9 API](https://docs.rs/tui-markdown/latest/tui_markdown/)
- [termimad upstream repository](https://github.com/Canop/termimad)
- [mdcat manual](https://github.com/swsnr/mdcat/blob/main/mdcat.1.adoc)
- [rutui-markdown `SourceMap` implementation](https://docs.rs/rutui-markdown/latest/src/rutui_markdown/source_map.rs.html)
- [markdown-reader hybrid editing model](https://github.com/leboiko/markdown-reader)
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- [Crossterm event API](https://docs.rs/crossterm/0.29.0/crossterm/event/enum.Event.html)
- [arboard clipboard repository](https://github.com/1Password/arboard)
- [arboard image API](https://docs.rs/arboard/latest/arboard/struct.Clipboard.html)
- [cap-std capability model](https://github.com/bytecodealliance/cap-std/blob/main/README.md)
- [Rust `OpenOptions::create_new`](https://doc.rust-lang.org/std/fs/struct.OpenOptions.html#method.create_new)
- [Unicode segmentation](https://docs.rs/unicode-segmentation/latest/unicode_segmentation/)
- [Ratatui terminal-cell width model](https://docs.rs/ratatui/latest/ratatui/buffer/trait.CellWidth.html)
- [xterm OSC 52 specification](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)

## Established facts

- The current repository model is not suitable unchanged. It stores review comments as file path, start/end line, selected text, and comment, then emits `zd-feedback.txt`. It has no revision hash, byte range, context quote, or deterministic re-anchoring. The current image contract writes to `docs/screenshots`; the new owner direction explicitly requires project `./zd-images`.

- `pulldown-cmark` 0.13.4 exposes `(Event, Range<usize>)` through `into_offset_iter()`. Its repository explicitly describes these ranges as source-map information. This is the narrowest mature Rust API found that directly supports a render plan tied to source offsets.

- Comrak exposes AST `Sourcepos` values as line/column pairs, but its own changelog states that inline source positions have correctness problems and are not reliable. That makes Comrak a poor authority for exact selection anchoring despite its richer GFM AST.

- `markdown-rs` 1.0.0 provides an owned mdast and node positions with start/end offsets. It is credible when AST mutation is required, but an AST is more machinery than the prototype renderer needs.

- Tree-sitter supports incremental concrete syntax trees and byte ranges after edits. It is appropriate for editor syntax work, but using a second Markdown parser for reading semantics would create two potentially disagreeing definitions of Markdown.

- `tui-markdown` 0.3.9 converts Markdown into Ratatui `Text`; its documented result contains terminal text and styles only. Its public output does not retain source-selection metadata.

- `rutui-markdown` 0.1.0 publishes a rendered-byte-to-source-byte `SourceMap`, but its implementation requires mapped source and rendered segments to have equal byte lengths. Its source also says the current Ratatui path retains only line-level mapping. That cannot represent hidden delimiters, entity decoding, synthetic bullets, wrapping, or wide terminal cells precisely.

- W3C Web Annotation defines complementary position and quote selectors. It explicitly calls position selectors brittle after edits and recommends quote context (`exact`, `prefix`, `suffix`) for disambiguation. W3C positions count Unicode code points, not UTF-8 bytes; a byte-based internal model can borrow the strategy but must not claim wire compatibility.

- Crossterm bracketed paste yields `Event::Paste(String)`: terminal paste is text. It does not deliver a typed clipboard image.

- `arboard` 3.6.1 can read images on macOS, Windows, and Linux, but returns already-decoded RGBA pixels, not the original PNG/JPEG/GIF/WebP bytes or MIME type. Linux defaults to X11/XWayland; native Wayland needs its optional data-control backend, which is unavailable on compositors lacking the relevant protocol.

- OSC 52 carries base64 selection data but has no MIME-type field. Treating it as a portable image clipboard protocol would be an inference unsupported by the protocol.

- `cap-std` confines relative filesystem operations beneath an opened directory capability, including preventing symlink traversal outside the capability root. Rust’s `create_new(true)` atomically refuses existing files, including dangling symlinks.

## Upstream claims

- `termimad` claims strong wrapping, table fitting, scrolling, and Unicode/wide-character handling, but explicitly says it is neither a TUI framework nor a complete generic Markdown renderer.

- `mdcat` demonstrates attractive ANSI Markdown, fenced-code highlighting, OSC 8 links, and terminal-specific inline images. Its original repository was archived on 2026-06-19, and its default behavior can fetch remote images unless `--local` is supplied. It is a visual/protocol reference, not a suitable editor core.

- `markdown-reader` claims the closest existing interaction model: rendered blocks remain visible while the active block reveals raw Markdown for editing, with source-line jumps and an `edtui` editor. This is valuable UX evidence, but not evidence of selection-accurate source mapping.

- `tui-markdown` calls itself an experimental proof of concept. Its current API is useful as a rendering reference or spike, not as the owner of review anchors.

## Inferences

- Parser ranges alone are insufficient. Wrapping and terminal layout must add a second map from screen row/cell to rendered grapheme and then to source bytes.

- The canonical document must remain source text, not an AST or rendered lines. Parser events, rendered rows, selections, comments, and search results should all be derived views over that one buffer.

- Direct WYSIWYM editing with concealed Markdown is the highest-risk design. Hidden delimiters change cursor geometry, incomplete syntax changes structure while typing, and terminal cells do not provide browser-like inline widgets.

- A read/edit presentation switch over one buffer is truthful and small: reading mode is derived and selectable; edit mode exposes literal source. It avoids maintaining two document states while admitting that the two layouts differ.

- The image operation must be an explicit application command. Ordinary terminal paste must remain text paste. The application can inspect the host OS clipboard only when the TUI process is running on that same desktop session.

## Interaction alternatives

| Model | Strength | Cost/failure mode |
| --- | --- | --- |
| Read mode + source edit mode over one buffer | Clear source truth, simple undo/save, calm full-width reading | Mode transition needs semantic-position restoration |
| Hybrid active-block editing | Good reading context; demonstrated by `markdown-reader` | Block height changes, cross-block selection, comments, and cursor mapping are substantially harder |
| Split source and preview | Easiest to reason about and debug | Consumes terminal width and conflicts with the desired single-file focus |
| Concealed in-place WYSIWYM | Closest to current browser behavior | Highest mapping and incomplete-syntax complexity; unsuitable for v1.0.1 |

## Recommendation

Build the first prototype with one canonical UTF-8 editor buffer and two presentations: rendered Read and literal Edit. The engineering gut-check changed the recommendation away from recreating browser-style direct rendered editing; the decisive reason is that comments and agent handoff require exact source truth, while current renderer crates discard the required mapping.

Use `pulldown-cmark` with explicit GFM options for the read renderer. Generate a width-dependent `RenderPlan`:

```text
RenderPlan
├── source_revision
├── styled_rows
├── blocks: rendered block ↔ source range
└── hit_rows
    └── cell interval ↔ source byte range | synthetic
```

All canonical ranges should be half-open UTF-8 byte ranges. Derive lines, columns, grapheme boundaries, and screen cells when needed. Use the same grapheme segmentation and width function as rendering. Synthetic bullets and table borders should either map to their source marker or be non-selectable. If a construct cannot map honestly—such as a truncated table cell—select the whole source node or refuse that endpoint; never guess.

Prototype behavior:

- Markdown opens in Read mode.
- `Enter`/an Edit command opens literal source at the source anchor under the reading cursor; leaving Edit returns to the corresponding semantic block.
- Mouse drag and keyboard selection in Read mode use the application’s screen map.
- Copy may emit rendered text, but Comment and Agent Handoff always carry project-relative path, revision hash, raw source range, and exact raw source.
- Find in Read searches visible rendered runs and returns real source ranges. Edit-mode Find/Replace searches literal source. Replace is one source-buffer transaction.
- Raw HTML remains inert; remote images are never fetched; unsupported local images render as labelled links/placeholders.
- Fenced code may use `syntect`, with a long-line cutoff and bounded visible work.

Persist comments in a versioned project sidecar such as `.zd/review-v1.json`, not inline Markdown. An anchor should contain:

```text
project-relative path
document revision hash
start_byte / end_byte
exact raw source
bounded prefix / suffix
comment, status, id
```

Re-anchor in this order:

1. Same revision and exact range match.
2. Existing range still matches `exact`.
3. Unique `prefix + exact + suffix` match.
4. Unique `exact` match.
5. Otherwise mark detached; never silently attach an ambiguous comment.

In-memory edits can shift anchors before/after an edit. An overlapping edit should mark the anchor for revalidation. Agent handoff should consume the same structured selection object and leave transport to the Herdr/multiplexer integration layer.

For image paste, provide a named `Paste Image` command in editable Markdown:

1. Query the local OS clipboard through a clipboard adapter.
2. Accept decoded RGBA only for v1.0.1 and normalize it to PNG. Animated GIF/WebP preservation is explicitly out of scope.
3. Validate checked `width × height × 4 == bytes.len()`, dimension limits, decoded-byte limit, and final encoded-size limit.
4. Open the approved project root once as a `cap_std::fs::Dir`.
5. Create/open only the literal `zd-images` child; reject it if it is a symlink for predictable ownership.
6. Name the file from a full content hash, for example `image-<blake3>.png`.
7. Use capability-relative `create_new`; if the same hash already exists, verify identical content and reuse it. Never overwrite.
8. Insert a document-relative, URI-safe `![Screenshot](../../zd-images/image-….png)` as one undoable transaction only after the write succeeds.
9. Failure leaves the buffer unchanged and reports a local error.

Keep the originating buffer and insertion anchor pending during the operation. Prevent that buffer from closing until completion, while allowing unrelated UI work.

## Security/portability constraints

- `arboard::get_image()` may allocate and decode before `zd` can enforce its own limits. Post-return validation limits retained memory but does not fully bound peak allocation from a malicious clipboard provider. A hardened implementation needs platform-specific raw MIME acquisition with bounded reads, or a separately contained helper process.

- Image paste is local-session functionality. It cannot reliably acquire the user’s desktop image clipboard over SSH, and OSC 52 is not a portable typed-image solution.

- Pure Wayland support depends on compositor data-control support. Failure must be reported as unavailable, with normal text paste still working.

- Do not accept a clipboard-provided filename or output path. Do not concatenate a path and then “canonicalize to check”; operate through the already-approved directory capability.

- Remote Markdown images must remain blocked. Local image resolution must also stay beneath the approved project root; `../` links that escape it render as unavailable.

- Annotation files and comments are untrusted data: bound record count and byte size, reject invalid UTF-8/path identities, and never treat comment or selection text as shell syntax.

- Agent handoff must use typed IPC/stdin or clipboard bytes. Never interpolate selected text, comments, or paths into a shell command.

- Application mouse capture is required for app-owned selection. Native terminal selection behavior and modifier-to-bypass capture vary by terminal/multiplexer, so mouse and keyboard selection both need real Ghostty/tmux/Zellij verification.

## Gaps

- No cross-platform experiment has yet measured whether `arboard` image reads work inside the exact Ghostty + Herdr + multiplexer combinations.
- A safe pre-decode clipboard byte limit is unresolved with `arboard`.
- The desired project policy for committing or ignoring `.zd/review-v1.json` needs an owner decision.
- File rename handling for sidecar comment identities needs a contract.
- Bidirectional text, ambiguous-width glyphs, emoji sequences, tabs, tables, and transformed entities need golden source-to-cell mapping tests.
- Large-document parse/layout latency and memory have not been measured.
- The maintained mdcat fork was not evaluated; the original upstream is archived.
- Inline terminal graphics should remain optional until the terminal/multiplexer research proves protocol behavior.
