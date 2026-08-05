# 0001: Use browser layout for Markdown

## Status

Accepted

## Context

The first prototype spent most of its code and defect budget on rich-text layout. Lists, headings,
code, wrapping, columns, and baseline alignment required custom geometry in egui.

The [path-forward record](../../_internal/path-forward.md) identifies document layout as the
product's main technical need.

## Decision

We will use CodeMirror as the document model and viewport renderer. We will use browser layout and
CSS for Markdown typography and geometry.

Lezer will identify editable source constructs. Markdown-it will render safe inline fragments and
table content. Shiki will classify fenced code without controlling the design palette.

Rendering work will stay proportional to the visible editor viewport when possible. Product code
will not implement a general text layout engine.

## Consequences

- Browser layout handles wrapping, baselines, list markers, and document flow.
- CodeMirror supplies mature selection, history, parsing, and viewport behavior.
- Decorations and widgets must preserve source positions and editing behavior.
- Incremental parsing can delay decoration of distant content. Tests must wait for the construct
  they inspect.
- Cross-webview details require browser and native review on supported platforms.
