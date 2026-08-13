# Candidate: Put visual decisions in the suite design system

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: Suite.

## Context

The session log records repeated drift between reader and editor styling. Shared Markdown
constructs first landed in a stylesheet that one surface did not load, and declared design tokens
sometimes had no consumer. Later sessions moved shared presentation rules to a common owner and
added an advisory report for unused tokens.

The accepted Tauri/frontend ADR chooses DOM layout and CSS. It does not say which layer owns visual
decisions. Future miniapps need a stable boundary that prevents private palettes, duplicate type
scales, and construct styling that diverges across rendered fragments and editable source.

## Decision

The proposed decision is to give the suite design system authority over semantic colors,
typography, spacing, measures, and motion tokens.

Miniapps will consume suite tokens instead of defining private visual constants. A miniapp may add
a semantic role only when its content has a meaning the suite does not already represent.

Shared document presentation will live in a common content stylesheet. Shell, workspace, notice,
and dialog layout will remain with the owning miniapp shell. Editor-only CodeMirror mechanics will
remain in the editor stylesheet.

Token validation will prove that every consumed token exists. An unused-token command will remain
an advisory report because a declared suite role can legitimately precede its first product
consumer.

## Consequences

- Theme, typography, and motion changes have one suite-level source.
- Rendered widgets and decorated source use the same semantic presentation rules.
- New miniapps inherit the suite character without copying the Markdown app's CSS.
- Adding a genuinely new semantic role requires suite review.
- Advisory unused-token output requires human judgment and cannot serve as a failing test gate.

## Evidence and ADR overlap

- Session evidence: `Document shared CSS ownership` (2026-08-03 16:03), `List unused design
  tokens` (16:07), the shared renderer work (16:18), and the three-category highlighting decision.
- Current evidence: `packages/app/src/design/tokens.css`, the token-only rule at the top of
  `miniapps/md/styles/md.css`, shared `styles/content.css`, and `npm run tokens:unused`.
- Related accepted ADR: suite 0001 chooses CSS and browser layout. This candidate assigns visual
  authority within that frontend architecture.
