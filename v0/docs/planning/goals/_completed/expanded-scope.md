# Expanded Scope Completion Summary

Completed: **2026-08-22**  
Source plan: [Expanded Scope Execution Plan](../expanded-scope/goal.md)

## Outcome

The expanded-scope goal replaced the retired `zd md`/growing-miniapp model with one native `zd`
agent workbench. The resulting application has one shared state and platform boundary for projects,
worktrees, files, terminals, threads, Git navigation, attention, themes, shortcuts, diagnostics,
and window lifecycle.

## Delivered

- A responsive workbench with persistent Projects/Threads, active file or terminal content, and
  Files/Changes regions.
- Native-approved multi-project and worktree authority, guarded context transitions, recovery, and
  stable identities.
- One CodeMirror owner for Markdown and code, bounded file reads, recoverable unsaved drafts,
  Find/Replace, save reconciliation, and read-only diffs.
- Compact virtualized file navigation plus scoped Git status, history, comparison, and diff views.
- Native PTY-backed terminals and project-nested threads with bounded event-driven output,
  restoration, lifecycle detection, and cleanup.
- One versioned busy-to-waiting attention event feeding in-app state, optional sound, and native
  notification routing without polling.
- Opt-in local diagnostics with redaction and retention boundaries, shared commands/preferences,
  light and dark themes, global window behavior, and migrated public/contributor documentation.

## Integration Record

All nine component goals—Documentation, Reorganization, Projects, Instrumentation, Editor,
Terminal, File Tree, Threads, and Notifications—passed their sequential integration gates. The
recorded final checkpoint included 745 unit/contract tests, 347 normal browser tests, 3 release
browser tests, 194 native all-target tests, production app and website builds, formatting, Clippy
with warnings denied, version synchronization, generated-asset checks, and bounded performance
measurements for attention, Changes, and terminal throughput.

The full acceptance criteria, dependency gates, performance figures, platform qualification, and
goal-by-goal evidence remain in the source plan. This summary closes the planning initiative; the
current [VISION](../../../VISION.md) and [DESIGN](../../../DESIGN.md) are authoritative for ongoing
product work.
