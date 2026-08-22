# Wrap-up goals

Status: **superseded on 2026-08-22** by the
[expanded-scope execution plan](../../goals/expanded-scope/goal.md).

This index is retained as a historical planning snapshot derived from
[`docs/planning/objectives/todo.txt`](../todo.txt) on 2026-08-12. Its goals and coverage ledger do
not direct current implementation.

These goals reorganize the remaining prototype work into bounded outcomes. They do not replace or
complete the source todo lines. The internal todo remains the execution record until each line is
implemented, verified, and closed through the normal session workflow.

Each goal contains more than one source todo, explicit acceptance criteria, a terminal condition,
and exclusions. A goal is complete only when every acceptance criterion and every mapped source
todo is closed with evidence.

## Goals

| Goal | Outcome | Source todos |
| --- | --- | ---: |
| [01: Make verification trustworthy](01-trustworthy-verification/goal.md) | Browser and unit tests fail for the behavior they claim to guard. | 7 |
| [02: Restore repository guardrails](02-repository-guardrails/goal.md) | Product definitions, work records, and push checks have one reliable owner. | 5 |
| [03: Complete the workspace daily driver](03-workspace-daily-driver/goal.md) | A user can enter, browse, filter, and reopen a workspace without leaving the app. | 9 |
| [04: Complete reading navigation](04-reading-navigation/goal.md) | A reader can orient, find, follow, and retrace destinations safely. | 8 |
| [05: Make reading preferences durable](05-durable-reading-preferences/goal.md) | Reading layout and appearance can be configured, understood, and restored. | 7 |
| [06: Make rendered tables directly editable](06-editable-rendered-tables/goal.md) | Tables stay rendered while supporting complete structural editing. | 2 |
| [07: Prove desktop release readiness](07-desktop-release-readiness/goal.md) | Performance, window isolation, and the Windows package are measured and verified. | 5 |

Total: **43 actionable todos**, each assigned to exactly one goal.

## Coverage ledger

The identifiers below are local to this wrap-up plan. Subjects preserve the actionable part of the
source todo so coverage can be checked without copying its long evidence trail.

| ID | Source todo | Goal |
| --- | --- | --- |
| WU-001 | Show reading progress and remaining distance. | 04 |
| WU-002 | Activate rendered links on the editor surface. | 04 |
| WU-003 | Make `/` load the styled app in end-to-end runs. | 01 |
| WU-004 | Make editor specs identify and assert the intended construct. | 01 |
| WU-005 | Remove the dev fixture's duplicate command list. | 02 |
| WU-006 | Teach the scroll-container padding rule in the way of working. | 02 |
| WU-007 | Reuse the exported function that already identifies a construct. | 02 |
| WU-008 | Restore trusted checks on push when the prototype is ready. | 02 |
| WU-009 | Resolve the two-day task-date offset and guard chronology. | 02 |
| WU-010 | Stop editor specs from querying bare tags that match CodeMirror buffers. | 01 |
| WU-011 | Scroll and wait for virtualized constructs before asserting them. | 01 |
| WU-012 | Justify or narrow specs that iterate the complete document. | 01 |
| WU-013 | Replace frame-counting focus tests with assertion-based settling. | 01 |
| WU-014 | Fix the unit-test localStorage harness. | 01 |
| WU-015 | Finish the collapsible, movable, monospace sidebar tree. | 03 |
| WU-016 | Draw nesting guides for expanded folders. | 03 |
| WU-017 | Default to Markdown files with an all-files toggle. | 03 |
| WU-018 | Add keyboard-driven fuzzy Quick Open. | 03 |
| WU-019 | Keep Quick Open on one stable plane while typing. | 03 |
| WU-020 | Navigate relative workspace links in the document window. | 04 |
| WU-021 | Send only genuine HTTP links to the approved external destination. | 04 |
| WU-022 | Add back and forward history for document navigation. | 04 |
| WU-023 | Add a Home screen with persistent recent folders and files. | 03 |
| WU-024 | Add folder/file pickers and create-file from Home. | 03 |
| WU-025 | Add keyboard-controlled column splits. | 05 |
| WU-026 | Re-clamp and restore column count as font size changes. | 05 |
| WU-027 | Settle shortcut choices and render the compact shortcut reference. | 05 |
| WU-028 | Add settings for theme, warmth, dimming, granularity, and sizes. | 05 |
| WU-029 | Make reading measure configurable. | 05 |
| WU-030 | Persist settings across restarts through one store. | 05 |
| WU-031 | Move review comments and shared app state to SQLite after the base app. | 05 |
| WU-032 | Add optional Git status decoration to the sidebar. | 03 |
| WU-033 | Extract the file navigator as a reusable suite component after the base app. | 03 |
| WU-034 | Add a keyboard-reachable document outline. | 04 |
| WU-035 | Add find-in-document. | 04 |
| WU-036 | Edit table cells, rows, columns, and ordering in rendered form. | 06 |
| WU-037 | Decide whether Notion becomes a stated design inspiration. | 06 |
| WU-038 | Profile multi-megabyte agent logs and virtualize only if needed. | 07 |
| WU-039 | Measure and hold cold launch near 300 ms. | 07 |
| WU-040 | Confirm idle CPU stays near zero. | 07 |
| WU-041 | Support isolated state across multiple document windows. | 07 |
| WU-042 | Verify the Windows build with a short native checklist. | 07 |
| WU-043 | Resolve and bound the proposed external-link browser miniapp. | 04 |

## Controls that are not goal work

The four open `CHECKPOINT` lines remain in the internal todo. They stop execution for human use
and review; they are not acceptance criteria or implementation tasks.

The open `RECURRING` feedback-triage line applies before work on every goal. It remains a standing
operating rule rather than belonging to one goal, because a recurring obligation has no terminal
condition and would make a bounded goal permanently incomplete.

## Suggested order

1. Complete goals 01 and 02 far enough to trust the suite and restore push checks.
2. Complete goals 03 and 04, then use the app through the daily-driver checkpoint.
3. Complete goals 05 and 06, then stop for the final product checkpoint.
4. Complete goal 07 only after the daily-driver behavior is stable.
