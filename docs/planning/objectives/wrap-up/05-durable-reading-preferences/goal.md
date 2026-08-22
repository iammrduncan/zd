# Goal 05: Make reading preferences durable

Status: **superseded on 2026-08-22** by the [expanded-scope execution plan](../../../goals/expanded-scope/goal.md).
This file is retained as a historical planning snapshot and does not direct current implementation.

## Outcome

Reading layout and appearance can be configured through one settings surface, explained by the
real command registry, and restored through one durable application-state owner.

## Source todos

- **WU-025:** Add keyboard-controlled column splits.
- **WU-026:** Re-clamp and restore column count as font size changes.
- **WU-027:** Settle shortcut choices and render the compact shortcut reference.
- **WU-028:** Add settings for theme, warmth, dimming, granularity, and sizes.
- **WU-029:** Make reading measure configurable.
- **WU-030:** Persist settings across restarts through one store.
- **WU-031:** Move review comments and shared app state to SQLite after the base app.

## Acceptance criteria

1. The approved column shortcuts increase and decrease CSS column count within viewport and design
   limits while preserving the current reading position.
2. Font-size or measure changes clamp the active column count when it no longer fits and restore
   the user's requested count when it fits again.
3. A human reviews the complete shortcut set, answers the open chord choices, and the Shortcut
   Reference renders the same registry as a compact two-column Markdown table.
4. One keyboard-reachable settings surface controls theme, warmth, focus dim amount, focus
   granularity, prose size, code size, heading scale, reading measure, and Typewriter Mode where
   applicable. Unsupported settings are visibly unavailable rather than silently ignored.
5. Reading measure becomes a bounded suite preference whose value updates the document geometry
   without hard-coded miniapp constants.
6. Every setting has one named accessor and persists across restart. A denied or unavailable
   durable store falls back safely for the current session.
7. A human resolves the storage transition. After the base app is complete, SQLite replaces rather
   than runs beside the localStorage-backed preference owner and also owns review comments and
   genuinely shared app state.
8. Migration and restart tests prove existing preferences survive the selected transition and no
   setting has two competing values.

## Terminal condition

All seven source todos and both human decisions are closed; a native restart restores every
supported setting, column behavior responds correctly to size changes, and one storage owner holds
preferences, review comments, and shared app state.

## Dependencies

- SQLite migration follows completion of the base settings and review-comment behavior.
- Shortcut decisions must precede the final reference and native checklist.

## Exclusions

- Cloud sync, accounts, roaming preferences, or multi-device conflict resolution.
- Plugin-defined settings or a general settings schema.
- A second persistence store retained for convenience after SQLite becomes authoritative.

after finishing this goal write a goal-summary.md in this folder explaining how you completed the goal.
