# Wrap-up goals summary

Archive status: consolidated

Disposition: partially executed, then superseded on 2026-08-22 by the
[one-workbench execution plan](../../goals/expanded-scope/goal.md)

The wrap-up plan (drafted 2026-08-12 from the internal todo) reorganized the remaining `zd md`
prototype work into seven bounded goals covering 43 actionable todos (WU-001 through WU-043), each
with acceptance criteria, a terminal condition, and exclusions. The suggested order was: trust the
suite and restore push checks (01–02), finish the daily driver and reading navigation (03–04),
finish preferences and tables (05–06), then prove release readiness (07).

## The seven goals

1. **Make verification trustworthy** (7 todos) — **completed.** Root-route browser coverage proves
   the styled app boots; editor specs materialize and assert exact virtualized constructs; focus
   and motion tests settle on asserted state instead of counting frames; the unit storage harness
   was fixed. Evidence: 256 browser tests and stress diagnostics green, `npm run check` passing
   three consecutive runs, plus repository guards against ambiguous selectors and fixed timing.
   Commits `f25a8eb`–`bff21ab`.
2. **Restore repository guardrails** (5 todos) — one command-registry owner shared by product and
   dev fixtures, the scroll-container padding rule taught in the way of working, reuse of the
   exported construct classifier, task-date chronology guarded, and trusted push checks restored.
3. **Complete the workspace daily driver** (9 todos) — collapsible movable monospace sidebar tree,
   nesting guides, Markdown-first file filter, fuzzy Quick Open on one stable plane, a Home screen
   with recents and pickers, optional Git status decoration, and a reusable navigator component.
4. **Complete reading navigation** (8 todos) — reading progress indicator, activatable rendered
   links, relative workspace links, trusted external HTTP links only, back/forward history, a
   keyboard-reachable outline, find-in-document, and bounding the external-link browser idea.
5. **Make reading preferences durable** (7 todos) — keyboard column splits with re-clamping,
   settled shortcuts rendered from the real registry, settings for theme/warmth/dimming/
   granularity/sizes/measure, persistence through one store, and SQLite for shared state later.
6. **Make rendered tables directly editable** (2 todos) — cell, row, column, and ordering edits on
   the rendered surface backed by the one CodeMirror document, plus a human decision on whether
   Notion becomes a stated design inspiration.
7. **Prove desktop release readiness** (5 todos) — profile multi-megabyte logs before virtualizing,
   ~300 ms cold launch, near-zero idle CPU, isolated multi-window state, and a Windows-build
   native checklist.

## Why it stopped

After Goal 01 landed, the expanded-scope plan replaced the `zd md` prototype frame with the full
`zd` workbench, and that plan completed on 2026-08-22. The remaining goals were not executed as
written; their substance was either absorbed by workbench goals (navigation regions, settings,
themes, Git, terminal) or remains future feature work (editable rendered tables, column splits,
release-readiness measurement). The 43-todo coverage ledger, the per-goal acceptance contracts,
and the Goal 01 completion record remain available in repository history at the commit that
removed `docs/planning/objectives/wrap-up/`.
