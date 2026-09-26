# ADR candidates summary

Archive status: consolidated

Disposition: not promoted — review material archived on 2026-08-22

This folder held six architecture candidates mined from the retired session-memory record and
compared against the accepted [`docs/adr/`](../../../adr/README.md) records. None was promoted to
an accepted ADR; the practices they describe largely already live in the code, tests, `DESIGN.md`,
and existing ADRs. If one is ever promoted, a maintainer assigns the next number in its area,
moves it into `docs/adr/`, and marks it Accepted. Full drafts remain in repository history at the
commit that removed `docs/planning/objectives/adr-candidates/`.

## The six candidates

- **Organize packages by runtime ownership** (Repository) — `packages/app/` owns the portable
  frontend, `packages/tauri/` the native shell, `packages/scripts/` automation; tests and assets
  live beside their owner; new packages require a distinct build and runtime boundary. Already the
  implemented repository layout.
- **Put visual decisions in the workbench design system** (Workbench) — the design system owns
  semantic colour, typography, spacing, focus, motion, terminal, and diff roles; features consume
  roles rather than defining private constants; new roles need design-system review; the
  unused-token command stays advisory. Now enforced by `DESIGN.md` and token validation.
- **Resolve document language before constructing the editor** (Editor) — resolve language from
  the path before building the editor; only `.md`/`.markdown` get Markdown behavior; one small
  bundled highlighting inventory (Rust, JS/TS family, HTML) shared by fenced code and whole
  files; unknown languages stay uncolored monospace; growth is a deliberate inventory edit.
- **Let the current file own dirty-close confirmation** (Workbench) — the platform reports close
  requests, the active document owns the destructive choice: clean closes immediately, dirty shows
  one in-app dialog (Cancel focused, Escape cancels, repeated requests refocus rather than
  consent), and only explicit Close discards and completes the platform close.
- **Preserve scroll intent through layout correction** (Editor) — one intent-based motion module
  with one active animation per surface; direct user input cancels application motion; unexplained
  offsets during a focal journey are treated as CodeMirror layout correction and translated into
  the journey; key-repeat updates one moving target; reduced motion means immediate placement.
- **Use ephemeral comparisons for visual decisions** (Repository) — a visual `@DECIDE` task
  requires a neutral same-state side-by-side comparison artifact first; the loop opens it, waits
  for the human answer, then removes the artifact and its tests so comparisons never become
  permanent inventory.

## Review disposition

The full 1,070-line session log was reviewed once. Everything else durable was already covered:
layout/CodeMirror by md ADRs 0001–0002, safe rendering by md 0004, save truth by md 0003, native
authority by suite 0001–0004, session workflow by repository 0001. Visual rules (insets, scales,
spacing, wrap) belong to `DESIGN.md` and tests, not architecture records; the rest were
implementation or verification outcomes, not decisions.
