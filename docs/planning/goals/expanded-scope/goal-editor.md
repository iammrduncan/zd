# Editor Goal

## Decision

Keep CodeMirror as the single editor engine for `zd`.

CodeMirror is faster and smaller than Monaco for the workbench we are building. Monaco's broader
IDE feature set does not justify its additional size, memory, startup, or integration cost for the
current scope. We will not add Monaco or maintain separate Markdown and code editor engines.

## Product Outcomes

- Markdown files keep the current rendered, directly editable reader/editor and its look and feel.
- Non-Markdown text files open on the same document surface in a code presentation.
- Code files use language-appropriate syntax highlighting when `zd` supports the language.
- Unknown text formats remain editable as honest monospaced plain text.
- The current file supports find, find next/previous, replace, and replace all.
- File-tree filtering and workspace search remain separate from current-file find.
- Focus Mode is off by default and remains available as a toggle.

## Constraints

- Keep editor work proportional to the visible viewport rather than total file size.
- Load only the editor features and language packages that the product uses.
- Preserve low idle CPU, low memory use, fast startup, responsive typing, and smooth scrolling.
- Apply installed themes through shared semantic roles rather than editor-specific theme forks.
- Keep Markdown first: code editing must not turn the Markdown reader into a conventional IDE
  surface.

## Shortcut Follow-Up

The proposed Focus Mode shortcut (`cmd+f` on macOS and `win+f` on Windows) overlaps the shortcut
space needed by find and platform behavior. Assign the final Focus and find bindings together so
one chord never has two meanings.
