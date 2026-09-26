# v1.0.1 acceptance plan

Date: 2026-09-26

This document converts the research test matrix into the evidence required before the owner receives
the prototype.

## Automated release-blocking evidence

| Surface | Required evidence |
| --- | --- |
| Repository cutover | Old product paths exist below `v0/`; root build/release has no v0 dependency; both root and v0 locked checks run from their documented directories. |
| Document | Unicode fixture proves grapheme-safe movement/deletion, multiline selection, undo/redo, find navigation, replace-one/all, dirty state, and exact save round trip. |
| Workspace | Nested fixture proves directories-first order, collapse/expand, `.gitignore` agreement between tree/search, no symlink traversal, stable result paths, and visible caps. |
| Markdown | Golden fixture proves headings, emphasis, lists, quotes, links, images, tables, code fences, wrapping, inert HTML, and exact source ranges for selectable spans. |
| Layout | Ratatui `TestBackend` at 40×12, 80×24, and 160×50 proves tree collapse gives width to the document without losing focus/selection. |
| Mouse | Constructed press/drag/release events prove tree activation, editor caret placement, and source selection over wide characters and Markdown spans. |
| Review | Add/reopen/re-anchor/detach tests prove comments never silently move to an ambiguous match. |
| Handoff | Fake Herdr executable proves exact target and bounded payload, no shell evaluation, preview/submit separation, and reported non-zero failure. |
| Image | Fake RGBA clipboard proves valid PNG, document-local `zd-images`, relative link, collision reuse, one undo group, symlink refusal, and no document mutation on failure. |
| Terminal lifecycle | PTY smoke proves alternate screen, raw mode, mouse capture, paste mode, cursor, and panic/error/quit teardown are restored. |
| Quality | `cargo fmt --check`, locked tests, strict Clippy, documentation link checks, release build, `zd --help`, and `zd --version` pass. |

Every behavior-changing commit adds or updates the smallest test that can fail for that behavior.
A found bug first receives a failing regression test, per root repository instructions.

## Live environment evidence

Before handoff, run the built binary inside the installed Herdr 0.9.1 session and observe:

1. launch from a project path;
2. tree keyboard and mouse navigation;
3. tree collapse and restored focus;
4. code edit, save, undo, find, and replace;
5. Markdown Read/Edit transition and selection;
6. comment persistence;
7. agent discovery and a deliberately approved handoff to a safe target or a fake target;
8. image-paste unavailable behavior in this headless environment; and
9. clean terminal restoration after quit and forced error.

The owner-side Ghostty checklist repeats input, mouse, clipboard image, resizing, and handoff. A
Linux/headless result cannot be presented as macOS Ghostty evidence.

## Prototype acceptance

The prototype is ready for the owner only when all automated gates pass, the live Herdr smoke has a
recorded result, user docs describe exact keys and limitations, and no feature is claimed from a
README or fake backend alone. Ghostty image paste may remain owner-verification-required, but the
unsupported path must already be safe and specific.

## Cost and exclusions

The acceptance harness adds code and fixture maintenance, especially source-to-cell goldens and PTY
teardown. It deliberately excludes performance promises not calibrated on the current runner,
screen-reader claims beyond terminal semantics, signed installers, and publication of a v1.0.1 tag.

