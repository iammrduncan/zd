# Supported-extension boundary

- Research date: 2026-08-14
- Upstream inspected: Zed `0ad5441b5370428eaa353a36f63c50c5448eead5`

## Finding

A normal Zed extension cannot currently enhance or replace Zed's built-in Markdown preview with
ZD's reader and focus behavior. It can deliver a useful static style profile and may support one
narrow source-editor experiment through a Markdown language server. The faithful reader path is a
source-level enhancement to the existing `MarkdownPreviewView`, not a new custom editor.

## Evidence from the public contract

Zed extensions are WebAssembly components. The current public `Extension` trait exposes hooks for:

- language server commands, initialization options, configuration, workspace configuration, and
  installation status;
- completion and symbol labels;
- slash-command completion and execution;
- context-server and MCP-server commands;
- documentation indexing;
- debug adapter and debug-locator behavior.

The manifest can also package languages, grammars, themes, icon themes, snippets, debuggers, and MCP
servers. It does not expose editor buffers, selections, scrolling, windows, workspaces, GPUI, render
callbacks, custom views, arbitrary editor actions, or decoration/widget registration.

Primary references:

- [official extension development documentation](https://zed.dev/docs/extensions/developing-extensions)
- [pinned `Extension` trait source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/extension_api/src/extension_api.rs)
- [pinned extension manifest source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/extension/src/extension_manifest.rs)

The surrounding roadmap reinforces that boundary:

- [Webview via Extensions](https://github.com/zed-industries/zed/issues/21208) is open and remains in
  [roadmap Triage](https://zed.dev/roadmap).
- [Custom document rendering](https://github.com/zed-industries/zed/discussions/37270) is still a
  discussion rather than a shipped extension contract.
- The [visual UI API proposal](https://github.com/zed-industries/zed/discussions/53403) explicitly
  excludes custom editor implementations from its proposed MVP. A Zed maintainer also described the
  work as significant and unlikely in the near future.
- [WYSIWYG Markdown preview](https://github.com/zed-industries/zed/issues/21717),
  [text-buffer/command access](https://github.com/zed-industries/zed/issues/18043), and
  [extension-contributed actions](https://github.com/zed-industries/zed/discussions/39554) remain
  open requests or discussions.

These are signals of interest, not dependencies ZD can plan against.

## Why the built-in preview does not change the public boundary

Zed already has custom screens. Its Markdown preview is a GPUI `MarkdownPreviewView` implementing
the internal workspace `Item` and `SerializableItem` traits. Zed registers it during native
application initialization, and the view directly owns references to editor, workspace, rendering,
scrolling, image, and persistence types.

That is precisely the capability a third-party extension does not receive. The public WebAssembly
trait cannot register an `Item`, add a pane or panel, execute GPUI rendering, or obtain a handle to
the built-in preview. The distinction is therefore:

- **Zed core can add screens:** Markdown preview, settings, terminals, and other compiled-in items.
- **A normal extension cannot add arbitrary screens:** it can contribute only the public manifest
  features and host callbacks.

This differs materially from VS Code's webview and custom-editor contribution model. Reusing the
preview is still the smallest native approach, but it must begin as a Zed-core patch or fork until a
specific extension seam exists.

References:

- [native preview registration](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown_preview/src/markdown_preview.rs)
- [`MarkdownPreviewView` workspace item](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown_preview/src/markdown_preview_view.rs)
- [`existing-preview-seam.md`](existing-preview-seam.md)

## What a theme and settings profile can do

A ZD-flavored profile can make stock Zed meaningfully calmer without an extension host change:

- choose global buffer and UI font families, sizes, weights, and line height;
- set the Markdown preview's prose and code fonts;
- use centered layout and bounded soft wrapping with a preferred line length;
- reduce or hide gutters, minimap, toolbar, tabs, status bar, scrollbars, and other chrome;
- apply warm background, foreground, border, selection, and syntax colors;
- distribute theme values and documented settings as a repeatable recipe.

It cannot express ZD's full typography. Theme syntax styles allow foreground/background color,
italic, underline, strikethrough, weight, and fading behavior in specific built-in cases. They do
not provide per-syntax font family, font size, or line height. Editable Markdown therefore cannot
have Quattro-like prose, monospaced inline code, and enlarged headings in one ordinary Zed buffer.
The separate Markdown preview can use distinct prose/code fonts, but is not the editable surface.

Primary references:

- [Zed settings reference](https://zed.dev/docs/configuring-zed)
- [pinned syntax-theme style source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/syntax_theme/src/syntax_theme.rs)
- [pinned default settings](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/assets/settings/default.json)

## A constrained focus-mode experiment

The public API lacks editor events, but a language server participates in a small number of requests
that are triggered by caret movement. This creates a supported, if unconventional, way to test the
value of focus dimming.

### Route A: unnecessary-diagnostic fading

1. Register a Markdown language server.
2. Use `textDocument/documentHighlight` requests as a caret-position signal.
3. Parse the current document and choose the focused line, paragraph, or section.
4. Publish two `Hint` diagnostics covering the ranges before and after that target.
5. Tag them `Unnecessary` so Zed's existing diagnostic renderer fades those ranges.

Zed core currently applies `HighlightStyle.fade_out` to unnecessary code. Hint-level unnecessary
diagnostics avoid the ordinary warning/error underline path in the inspected implementation. This
preserves the underlying syntax colors better than painting a flat semantic-token foreground over
the document.

This route has important risks:

- diagnostics are semantically the wrong transport and may leak into diagnostics counts, panels,
  status, persistence, telemetry, or agent context;
- caret notifications arrive indirectly and asynchronously;
- whole-document diagnostic updates may flicker or become expensive;
- another Markdown language server may own or conflict with diagnostics;
- focus remains tied to the caret, so it does not reproduce ZD's no-caret reading anchor.

The implementation must prove that Zed's visible UI remains clean. If it cannot, kill the route
rather than adding layers to hide the side effects.

Relevant source:

- [pinned diagnostic rendering and `unnecessary_code_fade`](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/editor/src/editor.rs)

### Route B: semantic-token refresh

The server can remember the latest caret from `documentHighlight`, request
`workspace/semanticTokens/refresh`, and return semantic tokens that distinguish focused and
unfocused context.

This is semantically cleaner than diagnostics, but Zed's semantic token styling has no generic
opacity/fade property. Assigning foreground colors would flatten existing Markdown syntax unless
the server emitted and the theme styled a combinatorial set of token types. It still cannot change
font metrics, scrolling, or document structure.

Relevant references:

- [pinned semantic-token documentation source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/docs/src/semantic-tokens.md)
- [LSP semantic token refresh](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_semanticTokens_refresh)

### What the experiment cannot prove

Neither route can implement or fairly evaluate:

- pre-caret focus based on viewport position;
- the one-third reading anchor;
- typewriter scrolling or viewport stabilization;
- a focus toggle or ZD-specific editor actions;
- raw/rendered mode transitions;
- heading scale, mixed font families, or block geometry;
- interactive links, tables, images, checkboxes, or fenced-block widgets;
- stable layout across rendered and source states.

It can answer only: **Does responsive contextual dimming make writing Markdown in Zed substantially
better?**

### Kill conditions

Stop the focus spike if any of these remain after a short tuning pass:

- visible diagnostic noise anywhere in ordinary use;
- focus lag or flicker that is perceptible during cursor movement or typing;
- repeated whole-document work that stutters on the large corpus fixture;
- conflicts with a user's preferred Markdown language server;
- focus state gets stuck after edits, buffer switches, undo, or reload;
- global theme/settings compromises make non-Markdown editing worse;
- maintenance depends on undocumented source behavior that changes during the spike.

## Why a general visual-extension API is not the next ZD project

Designing Zed's missing UI extension system would expand this product experiment into a platform
project involving component ABI design, state reconciliation, command routing, focus/input,
serialization, permissions, crash isolation, performance, accessibility, and cross-platform
rendering. Even the current public proposal does not aim to host replacement editors.

If ZD eventually needs a supported native extension, the smallest useful contract would include:

- read-only access to buffer snapshots and syntax/source mappings;
- selection, edit, focus, and viewport event subscriptions;
- commands/actions and key-context registration;
- source-range decorations with opacity and style composition;
- inline and block render items anchored to source ranges;
- controlled scroll anchoring;
- reversible folding/replacement semantics;
- workspace-local state and serialization;
- explicit performance budgets and capability permissions.

That list is useful for evaluating future Zed releases. It is not a recommendation to build the
platform before validating the reader.

## Conclusion

Build the theme/settings profile because it is cheap and honest. Make a source-build enhancement of
the existing Markdown preview the primary faithful prototype. Use the language-server focus idea
only as a time-boxed comparison for the source editor; it cannot customize the preview and is not
the architecture for the ZD reader.
