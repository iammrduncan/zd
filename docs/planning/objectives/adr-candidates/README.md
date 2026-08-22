# ADR candidates from session memory

This folder records architecture candidates found by comparing the retired session-memory record
with the accepted [`docs/adr/`](../../../adr/README.md) records.

These files are review material. They are not architecture authority. A maintainer must accept a
candidate, assign the next unused number in its area, move it into `docs/adr/`, change its status to
`Accepted`, and add it to the ADR index.

## Candidates

| Candidate | Proposed area | Why it remains uncovered |
| --- | --- | --- |
| [Organize packages by runtime ownership](organize-packages-by-runtime-ownership.md) | Repository | The portable-frontend and platform-boundary ADRs define runtime boundaries, but no ADR preserves their repository ownership. |
| [Put visual decisions in the suite design system](put-visual-decisions-in-the-suite-design-system.md) | Suite | Existing ADRs choose CSS and a portable frontend, but do not assign visual constants and shared presentation rules to one suite owner. |
| [Resolve document language before constructing the editor](resolve-document-language-before-constructing-the-editor.md) | zd md | The one-surface ADR covers Markdown editing, but not how non-Markdown files avoid Markdown parsing or how highlighting support grows. |
| [Let the document own dirty-close confirmation](let-the-document-own-dirty-close-confirmation.md) | zd md | The write-confirmation ADR protects save state, but does not govern destructive window-close requests. |
| [Preserve scroll intent through layout correction](preserve-scroll-intent-through-layout-correction.md) | zd md | The browser-layout ADR accepts incremental layout, but does not define who wins when layout correction, programmatic motion, and direct input compete. |
| [Use ephemeral comparisons for visual decisions](use-ephemeral-comparisons-for-visual-decisions.md) | Repository | The session-loop ADR selects and commits tasks, but does not preserve the human visual-decision gate added later. |

## Review disposition

The full 1,070-line session log was reviewed. The following durable themes did not need another
candidate:

- Browser layout, CodeMirror ownership, viewport-bounded work, and retirement of the separate
  reader are covered by md ADRs 0001 and 0002.
- The shared safe Markdown renderer, blocked remote images, validated protocols, and link trust
  boundaries are covered by md ADR 0004.
- Save serialization, atomic replacement, and truthful dirty state after failed writes are covered
  by md ADR 0003.
- Tauri portability, native authority, scoped file access, and window-level application commands
  are covered by suite ADRs 0001 through 0004.
- Small-session execution, triage, checkpoints, and focused commits are covered by repository ADR
  0001. The later visual-decision gate is separated as a candidate because it adds a distinct
  human-evidence lifecycle.
- Compact insets, heading scales, focus granularity, inline-code weight, later-H1 spacing, list
  marker width, palette-transition timing, window dragging, and word-wrap placement are product
  design rules. They remain in `DESIGN.md` and tests rather than becoming architecture records.
- Autofocus, hints, terminal scrolling, CI-test skips, stale-test repairs, and root-route diagnosis
  are implementation or verification outcomes rather than architecture decisions.
- Rendered-link activation had no new settled architecture in the log. Existing ADRs already
  constrain external protocols, native handoff, and workspace scope; the remaining task was
  repeatedly recorded as blocked.
