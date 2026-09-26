# Native terminal workbench design

Status: **canonical and binding**

Applies to: `zd` v1

## Product shape

`zd [PATH]` opens one project in the current terminal. The left region is a collapsible project tree
or project-search result list. The remaining width belongs to the active document. Markdown offers
Read and Edit modes over the same source buffer. Narrow terminals replace persistent regions with
focused overlays instead of truncating commands or source state.

The interface is quiet: text and spacing carry hierarchy, borders are sparse, status is local, and
commands remain fully available from the keyboard. Mouse input activates tree rows, places the
caret, and extends a selection; it does not create another selection model.

## One state path

```text
terminal event -> semantic command -> App -> deep module -> new state
                                            |
                                            +-> pure Ratatui projection
```

`App` owns focus, active file, mode, overlays, and command dispatch. `Document` owns source text,
cursor, selection, revisions, edit history, find/replace, and dirty/save state. `Workspace` owns the
canonical project root, traversal policy, visible tree state, and project search. Widgets retain no
competing copy of those values.

## Source coordinates

Stored document and review ranges use half-open UTF-8 byte offsets. One document boundary converts
among bytes, Unicode scalar values, grapheme clusters, logical rows and columns, and terminal cells.
Editing and caret movement operate on grapheme boundaries. Rendering may wrap into terminal cells,
but a hit is actionable only when it maps back to an exact source range.

Markdown Read mode is a projection of the source buffer. Parser offsets attach source ranges to
rendered spans. Synthetic markers are non-selectable; constructs without exact inline mapping use an
explicit whole-node range or remain non-selectable. Switching modes preserves source selection.

## Deep modules

- `document`: text, coordinates, selection, transactions, history, find/replace, atomic save.
- `workspace`: project scope, ignore-aware tree, expansion, and bounded text search.
- `markdown`: safe parse, wrapping, styling, and source-to-cell mapping.
- `review`: versioned sidecar, anchors, deterministic re-anchoring, and detached comments.
- `handoff`: bounded prompt construction plus explicit external-agent discovery and submission.
- `image`: clipboard adapter, decoded-image validation, safe PNG install, and link transaction.
- `terminal`: setup, event translation, teardown, and panic restoration.
- `app` and `ui`: semantic state transitions and pure terminal projection.

Dependency-specific types stay behind these boundaries.

## Filesystem and bounds

The project root is canonical. Traversal never follows symlinks and uses one ignore policy for tree
and search. Directories sort before files with stable lexical ordering. The initial caps are 50,000
visible tree entries, 10,000 search matches, and 10 MiB per editable text file. Reaching a cap is a
visible result, never silent truncation.

Writes use a same-directory temporary file and atomic replacement. Dirty state clears only after
replacement succeeds. Invalid UTF-8 and binary files are visible but not editable.

## Review, handoff, and images

Comments live in `.zd/review-v1.json`. Each anchor records project-relative path, document revision,
byte range, selected text, and bounded prefix/suffix context. Re-anchoring tries same revision,
shifted exact range, unique context, then unique exact text. Missing or ambiguous matches detach.

Handoff uses the active exact source selection. Herdr discovery and prompt submission use separated
process arguments, an explicit target, and a confirmation preview. `zd` never invokes a shell or
starts, stops, attaches, or guesses an agent session. Other multiplexers receive a prepared prompt.

Image paste is an explicit command. On supported local graphical sessions, validated RGBA pixels are
encoded as a content-hashed PNG in the active Markdown document's `zd-images/` sibling directory.
The directory must stay inside the project and must not be a symlink. The image is installed before
one undoable relative-link edit. Ordinary text paste is never intercepted.

## Terminal compatibility and safety

Crossterm supplies the portable baseline: alternate screen, raw mode, bracketed paste, focus/resize,
and SGR cell mouse input. Enhanced Kitty keys are optional. Images render as safe alt/path text; no
terminal graphics protocol is required. Raw HTML and remote Markdown images remain inert.

Every successful terminal setup step has a reverse step. Normal quit, input errors, returned errors,
and panics all restore mouse capture, bracketed paste, cursor visibility, alternate screen, and raw
mode. Tests exercise teardown through a pseudo-terminal.
