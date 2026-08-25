# Post-fix Workbench UX Cohesion Goal

Status: **proposed — re-reviewed 2026-08-23 after the current feedback fixes**

## Outcome

Finish the current `zd` workbench as a dependable editor shell at every supported desktop width.
Persistent regions, transient planes, Settings, hierarchy controls, and contextual actions must tell
the truth about the state they own and remain reachable by pointer and keyboard. The result should
retain the application's calm writing-first character rather than acquire more permanent chrome.

This is a bounded interaction-cohesion goal. It does not reopen the editor rendering work, add
general IDE features, broaden filesystem authority, or revisit feedback fixes that are now proven.

## Authority and current evidence

This review used:

- [GOOD_ENGINEERING_H.md](../../../GOOD_ENGINEERING_H.md), [VISION.md](../../../VISION.md), and
  [DESIGN.md](../../../DESIGN.md), especially the state-owner, responsive-order, transient,
  Settings, interaction-language, and accessibility contracts;
- the current shell, Settings, command, preference, Projects, Threads, Files, and Shortcut
  Reference source under [`packages/app/src`](../../../../packages/app/src/README.md);
- the current unit and browser suites under [`packages/app/tests`](../../../../packages/app/tests/);
- the populated `/dev/workbench.html` fixture rendered at 1440 × 960, 920 × 800, and 760 × 800,
  plus the empty production entry point; and
- the current Settings, Shortcut Reference, project menu, thread menu, file menu, file tree, editor,
  and terminal states exercised with pointer and keyboard input.

The owner direction that Shortcut editing has one home in `[h]` supersedes DESIGN §15's duplicate
Shortcuts group in Settings. DESIGN should be reconciled accordingly; this goal must not put the
same binding editor back in Settings.

## Baseline retained from the completed feedback work

The previous review helped drive fixes that are now visible in the current implementation. Treat
these as regression constraints, not open findings:

- Files restores its virtualized rows after hide/show.
- File and directory rows have a bounded custom menu for create, rename, path copy, and Trash.
- Primary folder-row activation toggles disclosure without incidental refreshes doing so.
- Threads expose one removal transaction rather than separate Close and Remove meanings.
- Thread glyph/title alignment and checked-out branch labels are corrected.
- Shortcut editing lives in one compact `[h]` Reference with consistent type size and readable
  columns; Settings no longer duplicates it.
- Sidebar header spacing and rendered Markdown table hierarchy are corrected.

The safe native file operations, draft reconciliation, and virtualization tests added for those
fixes remain authoritative. No phase below should replace or generalize those boundaries.

## Prioritized findings

| Priority | Finding | Current evidence | Required outcome |
| --- | --- | --- | --- |
| P0 | Responsive suppression removes navigation instead of adapting it. | At 760 px the shell still reports threadsVisibility="full" while CSS forces the pane to 56 px. PROJECTS and project names have zero visible width, project monograms remain display: none, and rows read as clipped chevrons plus “No threads.” At 920 px Files is always display: none; [f] only flips persisted visible/hidden state and cannot present the region. The responsive browser test checks widths and visibility, not usable content or command recovery. | Responsive state has one semantic owner. The 56 px state renders the real labelled-icon rail, and the Files command opens a usable temporary Files/Changes replacement plane while width suppression applies. Widening restores the exact persisted presentation and context. |
| P0 | Ordinary transients can coexist in contradictory visible and keyboard states. | Opening Settings and then [h] leaves both .zd-settings-plane and .zd-reference mounted. Settings is at z-index 20, Reference at 1, focus remains on the chrome [h] button, and the first Escape dismisses the hidden Reference rather than the visible Ssettings. Command List, Settings, and Reference each keep independent module-local open state despite DESIGN §14 requiring exactly one ordinary transient. | One workbench transient coordinator owns open, replace, dismiss, focus return, and safety-confirmation priority. A requested ordinary plane visibly replaces the prior one; one Escape always dismisses exactly the plane the person can see. |
| P1 | Settings presents a diagnostics panel as if it were the complete application Settings surface. | The rendered sheet contains only Local diagnostics and Attention. `settings.ts` mounts only `mountDiagnosticSettings`; preferences are separate storage keys rather than the versioned Settings owner named by DESIGN §15. Theme choices exist only as palette commands, while warmth, prose/code size, heading scale, Focus configuration, Typewriter, wrap, pane presentation, centre mode, and region sizes have no complete Settings UI. | Implement the Appearance, Reading, Workbench, Attention, and Diagnostics groups from the current contract, with immediate durable application and local failure text. Keep Shortcuts exclusively in `[h]`. |
| P1 | Thread actions are split between a hover-only symbol strip and an incomplete menu. | `row-actions.ts` paints `✎` and `×`; secondary-click opens a different menu containing only the three second-line choices. The result has two action vocabularies, hidden destructive reachability, and no words for the row's primary maintenance actions, contrary to DESIGN §§10 and 18. | One secondary-click/keyboard menu contains Rename, the Second line radio group, and the single lifecycle-aware Remove action. Inline rename remains the editor, but entry is from the semantic menu/command rather than a persistent glyph strip. |
| P1 | Project disclosure visibly and accessibly promises an operation that does not exist. | Every project row paints `▾` and hard-codes `aria-expanded="true"`; primary activation only changes the active project. There is no per-project expansion state, no Left/Right disclosure, and no test for persistence across pane or project round trips. | Either implement truthful per-project disclosure or remove the chevron and expanded state. The preferred hierarchy behavior is disclosure that preserves active project, selection, thread sessions, and pane state. |
| P2 | The compact Shortcut Reference is still a scan-inefficient registry dump. | The populated workbench renders 30 consecutive rows with no group labels or filter. Unavailable project slots and mode-specific commands interrupt the primary scan, and every non-global row reserves a Reset control even when disabled. Editing and type scale are fixed; information architecture is not. | Add stable command categories and a small filter to the same live registry-backed table. Keep all commands discoverable, separate unavailable results quietly, and show Reset only for an overridden binding. |
| P2 | Menu keyboard behavior depends on which feature happened to build the menu. | Files implements Arrow Up/Down and Home/End locally; Projects and Threads implement only first-item focus, pointer-away dismissal, and Escape. Three independent owners repeat placement and one-open-menu mechanics. | Share only the earned menu mechanics—placement, one-open coordination, roving focus, Arrow/Home/End, Escape, outside dismissal, and focus return—while each feature continues to own its actions and safety. |