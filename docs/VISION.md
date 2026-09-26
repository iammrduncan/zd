# Product vision

Status: **canonical**

`zd` is a focused workbench inside the user's existing terminal and agent workflow. A person can
open a project, understand its shape, edit source, read Markdown calmly, attach review comments,
and hand an exact selection to an already-running agent without changing applications.

## v1.0.1 promise

- A collapsible, ignore-aware file tree and bounded project search.
- Keyboard and mouse editing with selection, undo/redo, save, and find/replace.
- Read and Edit modes over one Markdown source document.
- Comments and agent handoff anchored to truthful source ranges.
- Explicit local clipboard-image insertion into a document-local `zd-images/` directory.
- A native foreground terminal process that restores the terminal on every exit path.

## Boundaries

`zd` does not serve a web UI, embed a browser, host a shell, own a PTY, create agent sessions, or
replace the user's terminal multiplexer. It may discover and address agents through a narrow tested
adapter, beginning with Herdr. Unsupported environments receive a prepared prompt for manual use.

The prototype does not promise an IDE platform, LSP, completion, plugins, split panes, arbitrary
remote clipboard transfer, or inline terminal graphics.
