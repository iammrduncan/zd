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
| P0 | Responsive suppression removes navigation instead of adapting it. | At 760 px the shell still reports `threadsVisibility="full"` while CSS forces the pane to 56 px. `PROJECTS` and project names have zero visible width, project monograms remain `display: none`, and rows read as clipped chevrons plus “No threads.” At 920 px Files is always `display: none`; `[f]` only flips persisted visible/hidden state and cannot present the region. The responsive browser test checks widths and visibility, not usable content or command recovery. | Responsive state has one semantic owner. The 56 px state renders the real labelled-icon rail, and the Files command opens a usable temporary Files/Changes replacement plane while width suppression applies. Widening restores the exact persisted presentation and context. |
| P0 | Ordinary transients can coexist in contradictory visible and keyboard states. | Opening Settings and then `[h]` leaves both `.zd-settings-plane` and `.zd-reference` mounted. Settings is at z-index 20, Reference at 1, focus remains on the chrome `[h]` button, and the first Escape dismisses the hidden Reference rather than the visible Settings. Command List, Settings, and Reference each keep independent module-local open state despite DESIGN §14 requiring exactly one ordinary transient. | One workbench transient coordinator owns open, replace, dismiss, focus return, and safety-confirmation priority. A requested ordinary plane visibly replaces the prior one; one Escape always dismisses exactly the plane the person can see. |
| P1 | Settings presents a diagnostics panel as if it were the complete application Settings surface. | The rendered sheet contains only Local diagnostics and Attention. `settings.ts` mounts only `mountDiagnosticSettings`; preferences are separate storage keys rather than the versioned Settings owner named by DESIGN §15. Theme choices exist only as palette commands, while warmth, prose/code size, heading scale, Focus configuration, Typewriter, wrap, pane presentation, centre mode, and region sizes have no complete Settings UI. | Implement the Appearance, Reading, Workbench, Attention, and Diagnostics groups from the current contract, with immediate durable application and local failure text. Keep Shortcuts exclusively in `[h]`. |
| P1 | Thread actions are split between a hover-only symbol strip and an incomplete menu. | `row-actions.ts` paints `✎` and `×`; secondary-click opens a different menu containing only the three second-line choices. The result has two action vocabularies, hidden destructive reachability, and no words for the row's primary maintenance actions, contrary to DESIGN §§10 and 18. | One secondary-click/keyboard menu contains Rename, the Second line radio group, and the single lifecycle-aware Remove action. Inline rename remains the editor, but entry is from the semantic menu/command rather than a persistent glyph strip. |
| P1 | Project disclosure visibly and accessibly promises an operation that does not exist. | Every project row paints `▾` and hard-codes `aria-expanded="true"`; primary activation only changes the active project. There is no per-project expansion state, no Left/Right disclosure, and no test for persistence across pane or project round trips. | Either implement truthful per-project disclosure or remove the chevron and expanded state. The preferred hierarchy behavior is disclosure that preserves active project, selection, thread sessions, and pane state. |
| P2 | The compact Shortcut Reference is still a scan-inefficient registry dump. | The populated workbench renders 30 consecutive rows with no group labels or filter. Unavailable project slots and mode-specific commands interrupt the primary scan, and every non-global row reserves a Reset control even when disabled. Editing and type scale are fixed; information architecture is not. | Add stable command categories and a small filter to the same live registry-backed table. Keep all commands discoverable, separate unavailable results quietly, and show Reset only for an overridden binding. |
| P2 | Menu keyboard behavior depends on which feature happened to build the menu. | Files implements Arrow Up/Down and Home/End locally; Projects and Threads implement only first-item focus, pointer-away dismissal, and Escape. Three independent owners repeat placement and one-open-menu mechanics. | Share only the earned menu mechanics—placement, one-open coordination, roving focus, Arrow/Home/End, Escape, outside dismissal, and focus return—while each feature continues to own its actions and safety. |

The two P0 findings are navigation and state-truth failures. They land before expanding Settings or
refining information architecture.

## Interaction decisions

### Responsive regions

Responsive presentation is temporary and must not rewrite durable preference state.

- At and below the Files suppression threshold, Files/Changes is absent from the persistent grid,
  but `[f]` and `files.toggleVisibility` open it as a full-height replacement plane over the centre.
  The plane keeps the existing FILES/CHANGES tabs and their mounted feature state; it is not a new
  explorer or a cloned tree.
- Invoking `[f]` again or Escape closes that temporary plane. Selecting a file or comparison may
  close it only when the centre has successfully adopted the target; failure stays local and leaves
  the plane available.
- The temporary plane preserves tab, selection, expansion, filter, horizontal/vertical scroll,
  active file, drafts, and logical tree window. It must not change the persisted visible/hidden
  preference merely because media geometry changes.
- At and below the Projects-collapse threshold, the actual region mode becomes responsive-collapsed
  for presentation. It shows project monograms and labelled thread type/status icons as DESIGN §10
  specifies; names appear on hover or keyboard focus without widening the entire region.
- At the lower hide threshold, focus leaves Projects before it disappears. Widening restores the
  person's last durable full/collapsed choice, width, scroll, selection, and live sessions.
- Media queries may express geometry, but they must not be the second owner of semantic visibility
  or collapsed content.

### Transient ownership

Introduce one small workbench-level coordinator for Command List, Settings, Quick Open, Outline,
Shortcut Reference, and confirmations as each surface joins it.

- `open(id, mount, returnFocus)` replaces any ordinary transient through its normal cleanup before
  mounting the requested plane. Ordinary planes never stack and never exist invisibly behind one
  another.
- A safety confirmation may displace an ordinary plane and blocks another ordinary plane until the
  safety decision is resolved. It names and preserves the owning operation.
- The coordinator is the single high-priority `workbench.escape` target. One press closes the one
  visible top plane; feature-local Escape behavior resumes on the next press.
- Focus enters the requested surface, is trapped only while its modal semantics require it, and
  returns to the last connected non-inert origin on dismissal. Top chrome must not retain focus
  behind an `aria-modal` plane.
- Each transient still owns its content and feature commands. The coordinator owns only lifecycle,
  ordering, focus return, and safety priority.

### Settings

Settings remains one calm typographic plane with these groups in order:

1. **Appearance:** theme/system behavior, warmth, prose size, code size, heading scale.
2. **Reading:** Focus on/off, dim level, granularity, Typewriter Mode, Word Wrap.
3. **Workbench:** Projects full/collapsed/hidden, Files visible/hidden, overlap/side by side, pane
   widths, and centre split.
4. **Attention:** the existing desktop and sound choices.
5. **Diagnostics:** opt-in state, storage/retention truth, and Reveal.

Use inline words for choices, explicit `on`/`off`, and text values beside continuous tracks. Every
change applies to the live state owner immediately and persists through a versioned preference
schema with validated migration/defaults. There is no Apply/Cancel state. Unsupported or clamped
choices remain visible and explain why beside the relevant row.

The `[h]` Shortcut Reference is the only shortcut editor. Settings may link to it with a text action
if useful, but must not mount or copy its rows.

### Hierarchy actions and menus

The thread menu order is:

1. `Rename`
2. `Second line` heading with App/status, Current directory, and Branch/worktree radio items
3. `Remove Thread…`, or `Terminate and Remove Thread…` for a live process

Rename opens the existing inline field, commits with Enter, cancels with Escape, and restores row
focus. Removal keeps the existing one-transaction lifecycle and failure recovery. The hover symbol
strip is removed; selection geometry does not change when a menu opens.

Project disclosure is separate from activation. The chevron, primary disclosure target, Enter,
Space, Left, and Right update one per-project expanded state and truthful `aria-expanded`. Activating
the name changes project context without inferring collapse. Collapsing a group hides only its
thread rows and never terminates or recreates sessions.

Shared menu mechanics remain deliberately small. They do not own command labels, availability,
filesystem operations, thread lifecycle, project removal, confirmation content, or error recovery.

### Shortcut scan path

Extend the current compact table rather than replacing it:

- Add category metadata to the production command registry: Workbench, Projects/Threads, Files,
  Editor/Reading, Appearance, and Help/System.
- Put a single filter row above the fixed columns. Search matches independent words across action,
  command id, category, and displayed chord.
- Within each category show available commands first, then an explicitly labelled unavailable
  subsection. Do not remove unavailable commands from the complete Reference.
- Preserve the 20–24 px row rhythm and one type size. Show `Reset` only when a durable override
  exists and `System managed` for global bindings.
- Shortcut capture, conflict refusal, immediate dispatch, persistence, toggle-close, prior focus,
  and prior scroll behavior remain as currently fixed.

## Implementation sequence

### Phase 0 — Pin the reproduced failures and reconcile the contract

1. Add browser tests that fail on the 760 px clipped Projects rail, the 920 px unreachable Files
   plane, and Settings-plus-Reference hidden transient stack.
2. Add focused DOM/unit tests for Settings group composition, thread/project menu semantics, and
   truthful project disclosure before their production changes.
3. Update DESIGN to state that `[h]` is the one shortcut editor and Settings may only link to it.
   Preserve the existing direct folder-row and one-thread-removal decisions.

### Phase 1 — Make responsive navigation truthful

1. Model responsive Files suppression and Projects responsive-collapse as explicit presentation
   state derived beside the root region owner, not as CSS-only semantic state.
2. Reuse the mounted Files/Changes feature in one temporary replacement plane.
3. Render the real collapsed Projects vocabulary and restore durable context on widening.

### Phase 2 — Give transients one lifecycle owner

1. Add the narrow coordinator and migrate Command List, Settings, and Shortcut Reference first.
2. Route Escape, open/replace, focus entry, and focus return through it.
3. Migrate existing confirmations and remaining ordinary planes incrementally without changing
   their feature semantics.

### Phase 3 — Complete Settings without duplicating Shortcuts

1. Introduce a versioned workbench-preference schema around existing durable values.
2. Add Appearance, Reading, and Workbench controls; reuse Attention and Diagnostics.
3. Prove live application, persistence, migration/default handling, unavailable explanations, and
   failure locality.

### Phase 4 — Unify hierarchy actions

1. Move thread Rename and the existing one removal command into the thread context menu.
2. Add truthful project disclosure with durable per-project state.
3. Extract and adopt the small shared menu mechanics in Files, Projects, and Threads.

### Phase 5 — Improve Shortcut information architecture and audit the whole flow

1. Add registry categories, filtering, unavailable grouping, and conditional Reset presentation.
2. Run the focused and integrated verification below at wide and compact geometries.

## Acceptance evidence

### Automated

- At 760 px, browser tests prove the Projects pane exposes project monograms and labelled
  thread/status icons—not clipped full-mode text—and that pointer, Tab, and arrow navigation reach
  every logical row. At 600 px it releases focus before hiding; widening restores the exact prior
  presentation and selection.
- At 920 px, `[f]`, its registered chord, and Command List action each open the same usable
  Files/Changes replacement plane. Three open/close and narrow/wide round trips preserve tab,
  expansion set, selection, active file, filter, both scroll axes, and logical/visible row counts.
- Tests open every pair of ordinary transients in both orders and prove only one plane is mounted,
  visible, and modal. One Escape closes that plane, does not alter the surface beneath, and restores
  focus to a connected non-inert origin. Safety confirmation tests prove ordinary commands cannot
  displace it.
- Settings tests cover every required group, immediate live updates, reload persistence, schema
  migration/fallback, clamping, and local errors. They also prove no Shortcut table is mounted in
  Settings and the `[h]` editor remains complete.
- Thread tests prove menu order, keyboard invocation, inline rename commit/cancel, live and stopped
  removal labels, failure recovery, and absence of the hover action strip.
- Project tests prove real `aria-expanded`, pointer and Left/Right/Enter/Space parity, persistence
  through activation and pane round trips, and no session/process change on collapse.
- Menu tests prove Arrow Up/Down, Home/End, Escape, pointer-away dismissal, viewport bounding, focus
  return, and only one open context menu across Files, Projects, and Threads.
- Shortcut tests prove category order, independent-word filtering, available/unavailable grouping,
  conditional Reset, registry completeness, and all existing capture/conflict/dispatch behavior.
- Run the complete unit, browser, type, lint, and formatting checks without regressing file safety,
  draft recovery, virtualization, terminal lifecycle, editor semantics, or idle work.

### Manual application checks

- In the packaged macOS application, resize slowly across every threshold with Files and Projects
  focused in turn. Confirm there is never clipped pseudo-content, unreachable navigation, retained
  hidden focus, a blank centre, or a change to the saved layout choice.
- Open Settings, Reference, Command List, a context menu, and a destructive confirmation in varied
  orders using mouse and keyboard. At every step visible focus and Escape must agree on the top
  owner.
- Change every Settings value, restart, and check Current Light, Dark, Dracula, the warmest setting,
  125%, 150%, and 175% scaling. Controls remain calm text-led rows with no reflow-induced loss of
  editor, terminal, tree, or scroll context.
- Review the shortcut table and hierarchy menus using pointer only, keyboard only, and mixed input.
  The common actions should be learnable from words without memorizing hover symbols.

## Performance and safety limits

- No polling, duplicate feature tree, duplicate shortcut inventory, or second persistent state
  owner is added.
- Responsive presentation reuses existing mounted features or their explicit state snapshots; it
  does not remount large trees on every resize event.
- Transient replacement performs one cleanup and one mount. Hidden ordinary planes do not remain
  alive, retain focus, or run background layout work.
- Preference migration is bounded, versioned, and local. Invalid data falls back to a usable value
  and cannot weaken native grants or file/thread safety.
- Menu unification cannot widen native filesystem authority or merge project, thread, and file
  destructive semantics.

## Non-goals

- Tabs, breadcrumbs, minimap, language servers, autocomplete, editor diagnostics/gutters,
  refactoring, debugger, or other general IDE chrome.
- New Git mutation workflows, terminal transcript redesign, Markdown typography changes, or quick
  access redesign.
- A generic overlay framework, component library, explorer framework, plugin settings system, or
  new filesystem IPC.
- Returning Shortcut configuration to Settings, inventing a second command registry, or assigning
  default chords to palette-only commands.
- Bulk file operations, drag-to-move, system-file-manager reveal, arbitrary shell actions, or any
  expansion of the completed bounded file-operation set.

## Terminal condition

This goal is complete when narrow windows retain usable Projects and Files navigation; exactly one
visible transient owns focus and Escape; Settings exposes the contracted appearance, reading,
workbench, attention, and diagnostics choices without duplicating Shortcuts; thread and project
actions are word-led, keyboard-complete, and truthful; the Shortcut Reference is fast to scan; and
all focused plus integrated checks pass without regressions to current file safety, drafts, active
context, live terminal sessions, accessibility, themes, or idle performance.
