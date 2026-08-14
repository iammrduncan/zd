# Extend Zed's existing Markdown preview

- Research date: 2026-08-14
- Upstream inspected: Zed `0ad5441b5370428eaa353a36f63c50c5448eead5`

## Idea

ZD does not need to begin by creating a custom editor inside Zed. Zed already ships a native,
separate Markdown preview screen. The smallest faithful native experiment is to extend that screen
with ZD's reader behavior while leaving Zed's ordinary Markdown editor responsible for editing.

```text
Zed Markdown editor              Existing MarkdownPreviewView
-------------------              ----------------------------
authoritative source buffer ───> native Markdown renderer
selection and edit events   ───> source-position synchronization
undo, Git, collaboration         ZD typography and measure
language tooling                 ZD focus and reading anchor
                                 direct return/jump to source
```

This is an **enhanced preview**, not a replacement editor and not initially an editable projection
inside the editor buffer.

## What Zed already provides

`MarkdownPreviewView` is a compiled-in Rust/GPUI workspace item. It implements Zed's `Item` and
`SerializableItem` interfaces and is registered during application initialization with
`workspace::register_serializable_item`.

The inspected implementation already has most of the bridge ZD would otherwise need to build:

- an `EditorState` containing the real source `Editor`;
- an `EditorEvent` subscription and a debounced preview refresh;
- a source-linked `Markdown` render entity;
- the active rendered source index;
- its own scroll handle and image cache;
- normal and **Follow** modes, including an action that follows the active editor;
- opening beside the editor or in the current pane;
- source-position mapping for navigation and synchronized selection;
- direct source mutation for interactive task-list checkboxes;
- search, links, images, workspace serialization, and restoration;
- separate Markdown prose and code font configuration.

Primary references:

- [preview registration](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown_preview/src/markdown_preview.rs)
- [`MarkdownPreviewView` implementation](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown_preview/src/markdown_preview_view.rs)
- [native Markdown renderer](https://github.com/zed-industries/zed/tree/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown)

The important consequence is that parsing, document rendering, image loading, most typography,
source ownership, and editor synchronization are reuse opportunities. The first prototype is not a
new Markdown engine.

## What remains custom

An initial ZD reader patch would add:

- ZD's bounded measure, spacing, colors, prose/code fonts, and heading hierarchy;
- line, paragraph, or section focus over rendered source ranges;
- the one-third reading anchor and manual-scroll suspension rules;
- typewriter-like movement when selection changes originate in the source editor;
- explicit commands for focus scope, follow mode, and returning to source;
- click or keyboard activation that opens the source editor at the mapped Markdown range;
- settings that allow the experiment to remain generic enough for upstream Zed.

Those behaviors live naturally in the preview because it already owns rendered block geometry,
source mappings, scroll state, and a reference to the editor.

## Two scopes that must not be conflated

### Scope A: enhanced separate preview

The preview remains a reader. Editing happens in the normal Zed editor, either beside it or after a
source jump. The preview follows changes and maintains position.

This scope can deliver most of ZD's custom reader:

- complete rendered typography;
- images, tables, links, lists, code, and task items;
- focus modes based on rendered/source ranges;
- reading and typewriter anchors;
- low-chrome reader presentation;
- predictable handoff to the native editor.

It avoids implementing text input, cursor painting, selection geometry, IME, multi-cursor editing,
undo, collaboration, and language tooling inside the preview. This should be the first core spike.

### Scope B: direct editing inside the preview

Clicking rendered prose places an editable caret directly in the rendered screen. This is closer to
ZD's single-surface editor, but the existing preview does not provide text-editor semantics merely
because it retains source mappings.

It would still need a design for:

- caret and selection behavior across independently rendered Markdown elements;
- keyboard movement, word boundaries, copy/paste, drag selection, and context menus;
- IME composition, bidirectional text, screen readers, and platform input behavior;
- undo grouping and collaborative edits in the authoritative source buffer;
- locally revealing Markdown punctuation and invalid syntax;
- geometry changes while a rendered construct enters and leaves edit state;
- multi-cursor, find/replace, diagnostics, completions, and editor commands.

Source mappings make this possible to investigate; they do not make it a small addition. Scope B
must be a later decision based on evidence that the preview/editor handoff is the remaining problem.

## The actual extension limitation

The obstacle is not an absence of screens inside Zed. Zed core creates many custom workspace items,
including this preview. The obstacle is that third-party extensions cannot register an equivalent
item or customize the built-in one.

The public WebAssembly `Extension` trait has no hooks for:

- `Item` or `SerializableItem` registration;
- workspace panes, panels, tabs, or arbitrary screens;
- GPUI render functions or custom elements;
- webviews or custom editors;
- access to the preview's editor, source mappings, or scroll state;
- preview-specific commands and event subscriptions.

This is materially narrower than VS Code's contribution model. A theme can style supported fields,
but cannot inject ZD behavior into `MarkdownPreviewView`. A language server can affect the source
editor indirectly, but cannot control the preview screen.

Primary references:

- [official extension development documentation](https://zed.dev/docs/extensions/developing-extensions)
- [public extension trait](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/extension_api/src/extension_api.rs)
- [Webview via Extensions request](https://github.com/zed-industries/zed/issues/21208)
- [visual UI API proposal](https://github.com/zed-industries/zed/discussions/53403)

## Smallest viable source-build patch

The first implementation should modify the existing preview rather than create a parallel item:

1. Add a preview focus controller using the renderer's source ranges.
2. Add reader-anchor state to the existing scroll handle.
3. Add settings and actions for focus scope, anchor behavior, and ZD-style reader presentation.
4. Improve activation of rendered elements so prose and blocks can jump to the precise source range.
5. Exercise normal, side-by-side, and Follow preview modes against the ZD corpus.
6. Preserve existing preview behavior when every new setting is disabled.

Initial acceptance criteria:

- no changes to Markdown source unless the user activates an existing interactive control;
- no new parser or duplicate source buffer;
- preview updates stay within the current refresh/performance envelope;
- focus and anchor state survive ordinary source edits without jumping unpredictably;
- source jumps preserve the expected preview position when returning;
- existing Markdown preview tests continue to pass, with focused coverage for each new behavior;
- the patch can be described in generic Zed terms rather than requiring ZD-specific branding.

## Distribution paths

There are three honest outcomes:

1. **Upstream feature:** contribute focus, reader anchors, and source navigation as options in Zed's
   native Markdown preview.
2. **Narrow future extension seam:** propose a Markdown-preview customization interface after the
   core prototype reveals the exact hooks required. This is much smaller than designing a general
   custom-editor platform, though Zed would still need to expose safe rendering/settings/event
   contracts.
3. **ZD-maintained patch or fork:** carry the preview changes privately, accepting Zed release,
   testing, packaging, and GPL compliance ownership.

The source-build prototype should precede an API proposal. It will show which behavior belongs in
Zed itself and which parts genuinely need third-party customization.

## Decision

Make the existing `MarkdownPreviewView` the primary native integration seam for the ZD reader.
Treat direct editing inside the preview as a separate, later project. Keep the language-server focus
experiment only as a supported-extension comparison, not as the preferred implementation of reader
focus.
