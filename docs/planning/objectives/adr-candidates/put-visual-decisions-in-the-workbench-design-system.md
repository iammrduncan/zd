# Candidate: Put visual decisions in the workbench design system

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: Workbench.

## Context

Earlier editor surfaces drifted when shared Markdown constructs and declared design tokens did not
have one loaded owner. The current workbench now adds Projects, Threads, terminals, Files, Changes,
diffs, settings, and notifications, which makes a single visual authority more important.

The accepted Tauri/frontend ADR chooses DOM layout and CSS. It does not say which layer owns visual
decisions or prevent a feature from creating a private palette, type scale, or focus treatment.

## Decision

The proposed decision is to give the workbench design system authority over semantic colours,
typography, spacing, measures, focus, motion, terminal, and diff roles.

Features consume semantic roles instead of defining private visual constants. A feature may add a
role only when its content has a meaning the workbench does not already represent. Shared content
presentation stays with the design system; feature layout and editor mechanics stay with their
owning modules.

Token validation proves that every consumed token exists. The unused-token command remains advisory
because a declared workbench role can legitimately precede its first consumer.

## Consequences

- Theme, typography, focus, and motion changes have one workbench-level source.
- Rendered widgets, terminals, diffs, and decorated source share semantic presentation rules.
- New features inherit the same character without copying another feature's CSS.
- Adding a genuinely new semantic role requires design-system review.
- Advisory unused-token output requires human judgment and is not a failing test gate.

## Evidence and ADR overlap

- Session evidence: `Document shared CSS ownership` (2026-08-03 16:03), `List unused design
  tokens` (16:07), the shared renderer work (16:18), and the highlighting decision.
- Current evidence: `packages/app/src/design/`, validated theme configuration, feature-owned CSS,
  and `npm run tokens:unused`.
- Related accepted ADR: suite 0001 chooses CSS and browser layout. This candidate assigns visual
  authority within that frontend architecture.
