# Native Zed-core feasibility

- Research date: 2026-08-14
- Upstream inspected: Zed `0ad5441b5370428eaa353a36f63c50c5448eead5`

## Finding

Zed core already contains many of the low-level mechanisms needed for a native ZD Markdown
presentation layer. They are internal Rust/GPUI facilities, not extension APIs. Focus dimming and
typewriter scrolling look like bounded editor features. A fully editable, rendered Markdown surface
with ZD's mixed typography is a much deeper text-layout project.

The best native architecture would retain Zed's normal `Editor` and text buffer as the authority,
then add source-mapped presentation through existing highlight, fold, crease, and block mechanisms.
Replacing the editor with the existing preview would discard too much of what makes the Zed
integration valuable.

## Existing primitives

### Editor events and viewport state

Zed's internal `EditorEvent` stream covers selection changes, edits, scroll changes, focus, and
other state a focus controller needs. The editor also owns scroll positioning and exposes internal
methods used by typewriter-like behaviors elsewhere in the product.

Reference:

- [pinned editor source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/editor/src/editor.rs)

### Composable text fading

`DisplayMap::highlight_text` accepts highlight styles, and `HighlightStyle` includes `fade_out`.
Because the display map combines presentation with source ranges, a native focus controller could
dim text outside the target while retaining the buffer, selection, syntax colors, and normal edit
commands.

Reference:

- [pinned display-map source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/editor/src/display_map.rs)

### Inline folds and creases

The fold map supports custom `FoldPlaceholder` render elements. `Crease::Inline` attaches a source
range and a renderer to an inline fold. This is a plausible basis for hiding Markdown punctuation
when the caret is outside a construct while preserving an exact mapping back to source.

References:

- [pinned fold-map source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/editor/src/display_map/fold_map.rs)
- [pinned crease-map source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/editor/src/display_map/crease_map.rs)

### Block replacements

The block map supports custom GPUI block renderers, including `BlockPlacement::Replace`. The editor
can insert and remove blocks keyed to source positions. These mechanisms could host an image,
rendered table, callout, fenced-code result, or other block presentation while the underlying text
remains in the buffer.

Reference:

- [pinned block-map source](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/editor/src/display_map/block_map.rs)

### Native Markdown renderer

Zed's `markdown` crate already parses and renders headings, links, images, code, tables, lists, and
other constructs with source mappings and separate prose/code fonts. Its `MarkdownPreviewView` is a
serializable workspace item that follows a source editor and supports navigation, search, links,
images, and synchronized position. It is a strong source of reusable presentation code, but it is
not an editable document view.

References:

- [pinned Markdown crate](https://github.com/zed-industries/zed/tree/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown)
- [pinned Markdown preview view](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/markdown_preview/src/markdown_preview_view.rs)

## Proposed native pipeline

If smaller experiments justify native work, use this shape:

```text
Markdown buffer + syntax tree
            │
            ├── focus controller ──> fade highlights outside active range
            │                        + viewport anchor policy
            │
            ├── inline presenter ──> reversible typed folds for punctuation
            │                        and compact inline constructs
            │
            └── block presenter ───> source-anchored replacement blocks
                                     for images, tables, and rich fences

All edits, selections, undo, collaboration, Git, and persistence
continue to operate on the normal Zed buffer.
```

The controller should parse incrementally, keep a source-to-presentation map, and invalidate only
constructs touched by an edit. Moving the caret into a rendered construct should reveal a local raw
editing state without reflowing unrelated blocks. A global raw command should remove all
presentation layers instantly.

## Feature feasibility

| ZD behavior | Likely Zed-core mechanism | Difficulty | Main risk |
| --- | --- | --- | --- |
| Line/paragraph/section focus | syntax-aware ranges + `highlight_text` fading | Medium | correct range updates and style composition |
| One-third reading anchor | viewport geometry + scroll event controller | Medium | fighting user scroll and preserving intent |
| Typewriter caret position | selection events + controlled scroll adjustment | Medium | jitter during wrapped-line reflow |
| Raw/rendered toggle | add/remove presentation layers | Medium | exact selection and viewport restoration |
| Hide Markdown punctuation | typed inline folds/creases | Medium–high | cursor navigation and edit-boundary behavior |
| Render images and simple blocks | replacement blocks | Medium–high | height changes, loading, accessibility |
| Editable rendered links/checklists | source-linked inline elements | High | focus, hit testing, undo, IME, multi-cursor |
| Rendered tables | custom block with source mapping | High | cell editing, column sizing, keyboard model |
| Quattro prose + monospaced code | variable-metric text shaping within one editor | Very high | wrapping, hit testing, selection, cursor geometry |
| Enlarged editable headings | per-range font metrics and dynamic line height | Very high | display-map invariants and vertical layout |
| ZD-style columns/layout blocks | multi-region document layout | Very high | outside the editor's line-oriented geometry |

## The typography boundary

The ordinary Zed editor shapes and wraps text from one base `EditorStyle.text` font, size, and line
height. Syntax and semantic highlights can change color, weight, italic, underline, and similar
paint properties, but they do not establish independent metrics for arbitrary spans.

This matters because ZD's hierarchy is structural:

- prose and code have different typefaces;
- headings change size and vertical rhythm;
- rendered constructs may replace punctuation and occupy different geometry;
- focus transitions should not destabilize the page.

Supporting those metrics inside one editable buffer affects shaping, wrapping, line measurement,
hit testing, selection painting, cursor geometry, scrolling, IME composition, multi-cursor edits,
inlays, collaboration indicators, and screen-reader output. Creating many embedded mini-editors for
individual spans would fragment selections, commands, undo, language features, and accessibility.

The first native version should therefore keep uniform editable text metrics. It can still prove
focus, measure, calm styling, and carefully chosen block presentations. Mixed-metric inline editing
should be a separately approved Zed editor project, not a hidden requirement of the first patch.

## Editing contract for rendered constructs

Every rendered construct needs an explicit state machine:

1. **Presented** — punctuation may be folded and a source-linked render is visible.
2. **Targeted** — hover, keyboard navigation, or selection exposes affordances without rewriting
   source.
3. **Editing** — entering the source range reveals raw syntax locally and places the real editor
   selection in the buffer.
4. **Committed** — leaving the range reparses and restores presentation if the source is valid.
5. **Fallback** — invalid or unsupported Markdown remains ordinary editable source.

Required invariants:

- no presentation action silently changes Markdown;
- undo/redo describes source edits, not cosmetic transitions;
- copy, paste, find, replace, multi-cursor, and collaboration address source text;
- selection and scroll position survive local reveal and global raw-mode changes;
- unsupported syntax degrades visibly and safely;
- keyboard-only and assistive-technology users can reach the same content and actions.

## Why a webview is not a shortcut

Zed has no shipped extension webview host. Adding one solely to mount the existing web editor would
require cross-platform embedding, focus and input routing, clipboard and drag/drop, GPU/compositor
integration, accessibility, process isolation, permissions, navigation policy, CSP, lifecycle, and
serialization. It would also place a second editor stack inside Zed, weakening native commands,
collaboration, diagnostics, selection semantics, and performance.

If ZD wants a web-native editor, the existing Tauri app is the simpler and more controlled host.
A Zed implementation should earn its cost by being genuinely native to Zed's buffer and workspace.

## Upstream contribution versus fork

Small general features are plausible upstream candidates:

- editor-level focus dimming with line/paragraph/syntax scopes;
- a configurable typewriter scroll anchor;
- better Markdown preview/editor position synchronization;
- narrowly reusable presentation primitives.

A ZD-specific rendered Markdown mode is a much larger product decision and may not match Zed's
priorities. A fork provides control but creates recurring costs:

- tracking fast-moving editor, GPUI, protocol, and workspace changes;
- platform builds, signing, updates, crash reporting, and security response;
- regression testing across editing, collaboration, language tools, and accessibility;
- conflict resolution if the patch touches central display-map and layout code;
- documentation and support for behavior that differs from upstream Zed.

Zed's editor, Markdown, and application crates are licensed GPL-3.0-or-later; GPUI is available
under Apache-2.0. Distributing a modified Zed application requires a conscious GPL compliance and
source-distribution plan. Legal review belongs before distribution, not after a prototype becomes
popular.

References:

- [Zed license](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/LICENSE-GPL)
- [GPUI license](https://github.com/zed-industries/zed/blob/0ad5441b5370428eaa353a36f63c50c5448eead5/crates/gpui/LICENSE-APACHE)

## Conclusion

A native ZD experience is technically possible in Zed core, but “possible” spans two very
different projects. Focus and viewport behavior can be explored as contained editor features.
Mixed-typography, always-editable rendered Markdown changes the editor's layout model and carries
far more risk. Validate them separately and do not let the second silently become acceptance
criteria for the first.
