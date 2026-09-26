# Markdown, review, and image findings

Date: 2026-09-26

This document chooses the source model for Markdown reading, selection comments, agent handoff, and
clipboard images.

## Established

- `pulldown-cmark` 0.13 exposes parser events with source byte ranges. It is the narrowest mature
  parser API found for a render plan tied to source text.
- Renderers such as `tui-markdown` and `termimad` do not preserve enough public mapping for exact
  review selections. Parser ranges must be combined with wrapping and terminal-cell hit maps.
- Richer AST alternatives do not remove the mapping problem. Comrak documents inline source-position
  correctness problems; `markdown-rs` adds mutation machinery the prototype does not need.
- Position-only comments are brittle after edits. The W3C annotation model pairs positions with
  exact text and bounded prefix/suffix context so a moved selection can be re-anchored honestly.
- Crossterm paste events carry text. OSC 52 has no MIME negotiation. Neither is a portable image
  clipboard interface.
- Arboard can read decoded RGBA clipboard images on macOS, Windows, X11, and some Wayland
  compositors. It cannot guarantee access in headless, remote, sandboxed, occupied, or unsupported
  Wayland environments.

Sources and alternatives are preserved in
[`subagent_outputs/03-markdown-workflow.md`](subagent_outputs/03-markdown-workflow.md).

## Claimed, not observed

- `markdown-reader` demonstrates a hybrid rendered/raw-block interaction, but not exact source
  selection mapping.
- `mdcat` demonstrates terminal Markdown and image protocols, but the inspected original repository
  is archived and may fetch remote images unless configured not to.
- No clipboard implementation was executed in the user's exact Ghostty/Herdr environment.

## Inferred

One UTF-8 source buffer is canonical. Read mode and Edit mode are two projections over it:

- Markdown opens in a calm rendered Read mode.
- Edit reveals literal source without replacing the buffer or losing the semantic position.
- Code and unknown text open directly in Edit.
- Read-mode rows contain selectable spans mapped to half-open UTF-8 byte ranges. Synthetic bullets,
  borders, and spacing are either tied to their source marker or non-selectable.
- When a precise cell mapping is impossible, selection expands to the source node or refuses the
  endpoint. It never guesses.

Comments and agent handoff consume the same structured selection:

```text
project-relative path
document revision hash
start_byte / end_byte
exact source
bounded prefix / suffix
```

Comments live in a versioned `.zd/review-v1.json` sidecar. Re-anchoring first tries the same
revision/range, then the existing exact range, then a unique context+exact match, then a unique exact
match. Anything ambiguous becomes detached. The application does not add the sidecar to
`.gitignore`; the project owner may commit or ignore review state.

Image paste is a named Markdown-edit command, never an override of ordinary paste. It reads a
same-host clipboard image, validates dimensions and decoded size, normalizes to PNG, hashes the
content, and writes without overwrite under a literal `zd-images/` directory beside the active
Markdown file. Only after the write succeeds does it insert a document-relative Markdown link as
one undoable edit. Failure leaves the buffer unchanged. A symlinked image directory, project escape,
unsupported clipboard, or remote-only session produces a specific refusal.

Raw HTML remains source text, remote images are never fetched, and local image paths escaping the
project render as unavailable.

## Gaps

- Arboard cannot bound malicious clipboard allocation before decode; v1 can validate only after the
  API returns.
- Source-to-cell goldens are still needed for entities, tabs, bidi text, emoji sequences, wide
  glyphs, tables, and wrapping.
- Inline graphics remain optional until the nested terminal smoke matrix is run.
- File rename behavior for review sidecars is deferred; unmatched records remain visible and
  detached.

