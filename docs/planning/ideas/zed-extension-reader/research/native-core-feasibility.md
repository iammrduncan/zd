# Native Zed-core feasibility

- Research date: 2026-08-14
- Upstream inspected: Zed `0ad5441b5370428eaa353a36f63c50c5448eead5`

## Finding

Zed core already contains two different implementation paths. The preferred first path is to extend
the existing, separate `MarkdownPreviewView`, which already renders rich Markdown and follows a real
source `Editor`. That can deliver most of ZD's reader experience without changing Zed's text-layout
model.

Only direct editing inside rendered content requires the deeper second path: retaining Zed's normal
`Editor` and text buffer as the authority while adding source-mapped presentation through highlight,
fold, crease, and block mechanisms. Those mechanisms are internal Rust/GPUI facilities, not
extension APIs. A fully editable rendered surface with ZD's mixed typography remains a substantial
editor-layout project.

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

## Preferred first pipeline: enhance the preview

The built-in preview already provides the separation ZD needs for a strong reader:

```text
Normal Markdown Editor ── source buffer + events ──> MarkdownPreviewView
       ▲                                                │
       │                                                ├── ZD reader styling
       └──────── precise source navigation ─────────────┼── focus controller
                                                        └── reading anchor
```

The preview can use proportional prose, monospaced code, heading scale, images, tables, and other
variable-height blocks because it is not constrained by the editor's uniform text metrics. It can
compute focus from rendered elements and their source ranges, control its own `ScrollHandle`, and
return to the existing source editor for actual editing.

This path is detailed in [`existing-preview-seam.md`](existing-preview-seam.md). It should be
evaluated before adding any presentation mechanism to the editor display map.

## Advanced pipeline: edit inside rendered content

If real use shows that preview-to-editor handoff is still the dominant problem, use this shape:

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

The following table applies to the advanced direct-editing path. Reader-only versions of focus,
anchors, typography, headings, images, tables, and code are materially easier inside the existing
preview.

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

- preview focus dimming with line/paragraph/section scopes;
- a configurable preview reading or typewriter anchor;
- precise Markdown preview/editor position synchronization and source activation;
- editor-level focus dimming if it proves useful beyond the preview;
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

A native ZD reader is technically plausible as a contained enhancement to Zed's existing Markdown
preview. That should be the first source-build experiment. Direct mixed-typography editing inside
the rendered surface changes the editor's input and layout model and carries far more risk. Validate
the reader and its handoff to the normal editor before allowing direct editing to become an
acceptance criterion.
