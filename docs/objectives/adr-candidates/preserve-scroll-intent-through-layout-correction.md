# Candidate: Preserve scroll intent through layout correction

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: zd md.

## Context

CodeMirror estimates off-screen geometry and corrects scroll position after measuring content.
The session log records focus journeys that stopped, hopped, or juddered when those corrections
competed with application-owned easing. Repeated Enter and vertical-arrow input also restarted
small animations until they fell behind and jumped a full row.

The browser-layout ADR accepts incremental parsing and viewport behavior. It does not define how
the application distinguishes a layout correction from direct reader input or coordinates
Typewriter Mode, focus jumps, and edge returns.

## Decision

The proposed decision is to centralize document scrolling in one intent-based motion module with
one active animation per document surface.

Motion requests will name product intent, such as an immediate placement, focal journey, small
nudge, key-repeat follow, or edge return. A wheel, touch, or pointer action will cancel
application-owned motion immediately.

An unexplained scroll offset during an active focal journey will be treated as editor layout
correction. The controller will translate the journey's origin and destination by that correction
so the remaining distance and easing continue in the refined document coordinate system.

Key-repeat following will update one moving target instead of restarting an animation for every
event. Reduced-motion preference will replace optional eased travel with immediate placement.

## Consequences

- Programmatic focus motion survives CodeMirror's off-screen height correction.
- Direct reader input always takes control without snap-back.
- Typewriter following and focus journeys share one scroll owner instead of issuing competing
  writes.
- New motion behavior must express intent through the shared module.
- The controller depends on measured layout and needs browser-level regression tests.

## Evidence and ADR overlap

- Session evidence: typewriter and focus-motion handoffs from 2026-08-01 03:14 through 06:52,
  especially `Keep focus jumps easing through reflow`.
- Current evidence: `packages/app/src/miniapps/md/scroll.ts` owns motion intents, direct-input
  cancellation, layout-correction translation, and repeat following.
- Related accepted ADR: md 0001 chooses CodeMirror and browser layout. This candidate records the
  coordination rule required by that choice.
