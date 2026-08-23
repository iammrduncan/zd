# Workbench UX Cohesion Goal

Status: **proposed — reviewed 2026-08-23**

## Outcome

Make the current `zd` workbench behave like a dependable editor without turning it into a busy
general-purpose IDE. A person should be able to navigate the file tree, perform ordinary file and
thread operations, and inspect or change shortcuts without guessing which pixels are interactive or
whether a view change will lose context.

This goal is deliberately bounded to the interaction gaps proven by the current implementation and
owner feedback. It does not redesign the editor, add tabs, language-server features, source control
mutations, or a broad explorer framework.

## Authority and evidence

Human feedback is authoritative where it changes an earlier interaction decision. In particular,
the requested folder behavior supersedes the sentence in [DESIGN.md](../../../DESIGN.md) that limits
pointer disclosure to the chevron. The retained intent is that *incidental state changes* must not
collapse folders; a direct primary click on a folder row is now deliberate disclosure intent.

This review used:

- [VISION.md](../../../VISION.md) and [DESIGN.md](../../../DESIGN.md), especially the commitments to
  one state owner, stable context, text-led controls, local authority, keyboard parity, and quiet
  workbench chrome;
- the current Projects, Threads, Files, Settings, Shortcut Reference, shell, and native platform
  source under [`packages/app/src`](../../../../packages/app/src/README.md);
- the current unit and browser interaction suites under
  [`packages/app/tests`](../../../../packages/app/tests/);
- the approved light workbench references in
  [`expanded-scope/assets`](../expanded-scope/assets/) and the IDE/thread references
  [`zed-threads.png`](../../../screenshots/zed-threads.png),
  [`workbench-1-x.png`](../../../screenshots/workbench-1-x.png), and
  [`herdr.png`](../../../screenshots/herdr.png); and
- the reported captures for
  [thread alignment](../../../screenshots/screenshot-1787507039488225000.png),
  [folder selection](../../../screenshots/screenshot-1787507072574307000.png),
  [shortcut density](../../../screenshots/screenshot-1787507187754572000.png),
  [the native file-tree menu](../../../screenshots/screenshot-1787507236542125000.png),
  [the populated tree](../../../screenshots/screenshot-1787507457655360000.png),
  [the incomplete restored tree](../../../screenshots/screenshot-1787507488085537000.png), and
  [ambiguous thread actions](../../../screenshots/screenshot-1787507542075062000.png).

## Prioritized review findings

| Priority | Finding | Concrete evidence | Required outcome |
| --- | --- | --- | --- |
| P0 | Hiding and restoring Files can leave a stale virtualized window, making valid rows appear missing until another tree update. | The before/after captures show the same expanded hierarchy with fewer mounted descendants after restore. `files/view.ts` renders on controller publication, scroll, and window resize, but not when a `display: none` region regains geometry. | Showing Files immediately renders the correct window while preserving logical expansion, selection, active file, filter, and both scroll axes. |
| P0 | The file tree is a viewer, not yet a working editor explorer. | The custom menu is installed only for non-directory rows and contains only two copy-path actions; directory secondary-click falls through to the operating-system webview menu. The platform seam has no bounded create, rename, or trash operation. | Files, folders, and root whitespace have coherent, keyboard-accessible menus for a deliberately limited set of safe file operations. |
| P0 | Thread termination has two indistinguishable destructive controls. | Hover reveals `×` and `−`; one closes a backing session while retaining the record and the other removes the record, while a live remove delegates back to close. The screenshot cannot explain that lifecycle distinction. | Expose one user-facing removal action. If the process is live, the one confirmed action terminates it and removes the durable thread; if it is stopped, it removes the record. |
| P1 | Folder selection violates the learned direct-manipulation behavior of editor trees. | A folder-name click currently selects without disclosure while Enter toggles. The latest owner direction expects a primary row click to expand and the next primary row click to collapse. | Primary click and Enter/Space toggle a folder. Right-click, refresh, selection restoration, watcher updates, and panel visibility changes never toggle it. |
| P1 | The Shortcut Reference reads like a raw registry dump rather than a compact reference surface. | The capture is a long ungrouped two-column stream, including many context-unavailable commands, with no heading hierarchy or editing affordance. Editing exists separately in Settings, creating two presentations of the same bindings. | One compact registry-backed table supports scanning, capture, conflict feedback, and reset from the `[h]` surface and is reused by Settings. |
| P1 | Thread rows and row actions lack one coherent visual and interaction model. | The terminal glyph is optically displaced from the title in the capture. Rename, close, and remove are hover-only glyphs while secondary-click opens a menu containing only second-line settings. | Align state dot, type glyph, and title; put rename, secondary-line choice, and the single removal action in one menu with complete keyboard behavior. |
| P2 | The project disclosure indicator claims behavior the row does not own. | Project rows hard-code `aria-expanded="true"` and paint a disclosure chevron, but activation does not change child visibility. | Make the disclosure truthful and preserve per-project expansion without changing active context or live sessions. |
| P2 | Context menus are separately hand-built and omit standard menu navigation. | Projects, Threads, and Files each implement independent open/bound/dismiss logic; focus begins on one item, but Arrow, Home, End, and type-ahead behavior are not shared or guaranteed. | Share a small menu interaction owner while keeping feature actions in their feature modules. |

The first three findings are trust failures: visible content or running work may not match what the
person believes the interface is doing. They must land before visual refinement.

## Interaction decisions

### Files tree

Direct intent is distinct from incidental selection:

- Primary-clicking any visible part of a directory row selects and toggles it. A second primary
  click toggles it back.
- `Enter` and `Space` perform the same select-and-toggle action. `Right` expands or enters the first
  child; `Left` collapses or selects the parent.
- Secondary-click selects the target and opens its menu without toggling it. `Shift+F10` and the
  Context Menu key do the same.
- Refresh, watcher reconciliation, Files hide/show, project round trips, filter dismissal, and
  programmatic restoration may update or restore selection but never infer disclosure intent.
- A directory with no known children remains selectable and may receive new children through its
  context menu; it must not pretend to expand before content exists.

The file-operation menu is intentionally limited:

| Target | Actions, in order |
| --- | --- |
| File | Open, Rename, Copy Relative Path, Copy Full Path, Move to Trash… |
| Directory | New File…, New Folder…, Rename, Copy Relative Path, Copy Full Path, Move to Trash… |
| Empty/root area | New File…, New Folder… |

`Duplicate`, Cut/Copy/Paste of file contents, drag-to-move, Reveal in Finder/Explorer, archive
operations, and Git actions are not part of this goal.

New and renamed names are edited inline at the affected tree position. `Enter` commits and `Escape`
cancels without changing selection or expansion. Invalid names, collisions, unavailable grants, and
filesystem failures remain in the row as specific text; they do not dismiss the edit or optimistically
rewrite the tree.

Deletion means the operating system's recoverable Trash/Recycle Bin when supported. The confirmation
names the exact project-relative target and whether it contains children. A dirty or pending-write
file cannot be removed through a generic confirmation: the current-file owner must present its
existing save/discard safety before the native operation can run. The worktree root and protected
repository metadata cannot be renamed or removed.

Every mutation crosses a narrow native request containing approved project/worktree identities and
validated relative paths. Native code validates the existing parent, rejects parent and symbolic-link
escape, refuses collisions, and returns a structured outcome. The webview does not receive generic
filesystem authority. Successful rename/create/delete transitions update open-file and draft
identities through the root state owner, then reconcile the watcher snapshot without collapsing or
reordering unrelated rows.

### Threads

The row exposes one secondary-click/keyboard menu:

1. `Rename`
2. a `Second line` radio group: App/status, Current directory, Branch/worktree
3. `Remove Thread…`, or `Terminate and Remove Thread…` while its process is live

Remove is one workbench transaction, even if native termination and durable-state removal require
ordered internal steps. A failed termination leaves the thread record visible with a specific local
recovery action. Removal never deletes a project, worktree, file, draft, or terminal transcript from
outside the owned session. `closeThread` may remain an internal lifecycle operation, but it is not a
separate user-facing command or glyph.

Remove the three-symbol hover strip. Inline rename remains the editor for the name, but it is entered
from the menu or command registry. The selected row's wash, focus hairline, and width do not change
when the menu opens.

The state dot and type glyph share the title line's optical centre. Use the real bundled font metrics
and row geometry rather than matching the glyph's CSS box alone. The second line must begin below the
glyph and remain readable in Current Light, Dark, and Dracula.

### Shortcuts

`[h]`, `Cmd+.` / `Ctrl+.`, and the Settings Shortcuts group use one reusable registry-backed table.
The transient remains a quiet replacement plane and uses this compact structure:

```text
SHORTCUTS                         Filter shortcuts
Command                                  Shortcut
Workbench
Command List                              ⇧⌘P
Show or hide Files and Changes            ⇧⌘B
Editor
Find in the current file                    ⌘F
```

Requirements:

- Use visible `Command` and `Shortcut` column headings, stable category groups, a 20–24 px row
  rhythm, and aligned shortcut notation. The table remains within the sanctioned transient measure.
- Keep every production command discoverable, but order available commands first within their
  group and move unavailable commands into a clearly labelled quiet subsection rather than appending
  a long availability sentence to the primary scan path.
- Selecting a non-global binding cell starts capture in place. Escape cancels capture before it can
  dismiss the surface. A second Escape dismisses the surface.
- Conflicts identify the existing command and do not alter either binding. Successful capture
  applies immediately, persists locally, and updates command dispatch, Command List labels, the
  Shortcut table, and Settings from the same registry state.
- A text `Reset` action appears only for an overridden binding. Unassigned commands are assignable.
  Native global shortcuts say `System managed` and are not presented as editable.
- Repeated `[h]` or its chord closes the surface and restores the exact prior focus and scroll state.

### Project hierarchy and menus

The project chevron toggles only that project's thread children. Clicking the project name activates
the project without collapsing it. Keyboard `Left`/`Right` provide the same disclosure behavior and
`aria-expanded` reports the real state. Expansion persists per project across activation and panel
hide/show; collapsing a project never stops its threads.

Introduce one small shared context-menu behavior module only after the Files menu requirements prove
the common cut point. It owns viewport placement, one-open-menu coordination, roving focus, Arrow
Up/Down, Home/End, optional first-letter movement, Escape, pointer-away dismissal, and focus return.
Projects, Threads, and Files continue to own labels, availability, confirmations, and operations.

## Approaches considered

1. **Patch each current menu and view independently.** This minimizes the first diff but repeats
   focus, placement, and dismissal bugs as file operations expand.
2. **Build a generic explorer/action framework.** This could model every future operation, but it
   adds a broad abstraction before the product has earned it.
3. **Chosen: share interaction mechanics, keep semantics deep and local.** Add one small menu
   behavior module and one shortcut-table renderer. Keep tree state in Files, lifecycle in Threads,
   context in the workbench owner, and filesystem authority in narrow native operations.

This middle path improves consistency without inventing a new application framework.

## Implementation sequence

### Phase 0 — Lock regressions and update the contract

1. For each reported defect, add the smallest failing unit or browser test and record the red result
   before changing production code.
2. Update `DESIGN.md` to distinguish direct directory-row disclosure from incidental selection and
   to specify the one thread removal action and editable compact Shortcut table.
3. Preserve current state-owner, grant, draft, watcher, command-registry, and theme boundaries.

### Phase 1 — Restore trust in file navigation

1. Re-render the virtual window when Files regains measurable geometry, using a bounded resize or
   explicit visibility signal rather than polling.
2. Implement direct folder-row toggle while ensuring secondary-click and restoration do not toggle.
3. Make project disclosure state truthful and durable.
4. Prove repeated panel and project round trips preserve logical tree state.

### Phase 2 — Add bounded file operations

1. Define structured native create-directory, create-file, rename, and move-to-trash requests and
   their validation/failure results.
2. Add root/file/directory menu composition and the shared keyboard menu mechanics.
3. Add inline create/rename and one safety-confirmation path for removal.
4. Reconcile active files, drafts, selection, expansion, and watcher results after success.

### Phase 3 — Simplify thread actions

1. Replace Close/Remove UI with one safe Remove transaction and one context menu.
2. Retain inline rename and second-line configuration within that menu.
3. Correct optical alignment and validate all lifecycle/attention states.

### Phase 4 — Make shortcuts compact and editable

1. Add command categories as registry metadata and build the shared compact table from live entries.
2. Move capture, conflict, reset, and global-state presentation into the shared table.
3. Reuse it in the Shortcut Reference and Settings without creating another shortcut inventory.

### Phase 5 — Integrated interaction audit

Run the complete keyboard, theme, scaling, state-restoration, native-safety, and performance checks
below. Update user documentation only after the corresponding behavior is proven.

## Acceptance evidence

### Automated

- A full-workbench browser test expands a hierarchy larger than one viewport, selects and scrolls to
  a nested file, toggles `[f]` off/on at least three times, and proves the same expansion set,
  selection, active file, scroll position, total logical row count, and correct visible row window
  immediately after every restore without clicking the tree.
- Unit and browser tests prove folder primary-click/Enter/Space toggle, while right-click, watcher
  refresh, filter dismissal, project switching, and Files visibility changes preserve expansion.
- File-operation tests cover file, directory, and root menus; keyboard invocation/navigation; inline
  commit/cancel; collision and invalid-name refusal; dirty-file safety; watcher reconciliation; and
  exact selection/open-file/draft state after create, rename, and trash.
- Native tests prove grant ownership, parent traversal refusal, symbolic-link escape refusal,
  worktree-root protection, collision refusal, recoverable deletion behavior, and no mutation on
  failed validation.
- Thread tests expose one destructive UI action and prove stopped removal, confirmed live
  termination-plus-removal, failed termination recovery, focus restoration, and no worktree/file
  side effects.
- Shortcut tests prove compact grouping, live registry completeness, in-place capture, conflict
  refusal, reset, unassigned assignment, global read-only state, one-Escape-per-layer behavior, and
  immediate dispatch/label persistence.
- Project/menu tests prove truthful `aria-expanded`, persistent disclosure, Arrow/Home/End menu
  movement, keyboard context invocation, Escape focus return, and only one open menu.
- Browser geometry tests measure thread dot/icon/title relationships and prevent overlap with the
  secondary line. Capture deterministic visual evidence in all three built-in themes at 1× and at
  one fractional scale.

### Manual application checks

- On macOS, verify native secondary-click no longer appears over file or directory rows and Trash
  contains a removed test item. On Windows, verify the corresponding Recycle Bin behavior when a
  native runtime is available; otherwise retain native automated coverage without claiming a manual
  run.
- Navigate and mutate a real small Git repository with mouse only, keyboard only, and mixed input.
  Confirm no unexpected folder collapse, centre-surface switch, terminal termination, or draft loss.
- Review Current Light, Dark, Dracula, the warmest setting, 125%, 150%, and 175% scaling. Menus and
  the shortcut table must remain readable, bounded to the viewport, and geometrically stable.
- Compare the Projects/Threads rhythm with the approved workbench and thread references. Match their
  information hierarchy and calm density, not their branding, colours, or decorative chrome.

## Performance and safety limits

- No polling is added. Hidden regions do no continuous layout or filesystem work.
- One operation produces at most one explicit refresh plus coalesced watcher reconciliation.
- Large-tree virtualization remains bounded; context-menu and inline-edit state do not require
  rendering the entire logical tree.
- Diagnostics contain operation kind and stable IDs, never full paths, filenames, document content,
  or terminal output.
- Destructive confirmation is scoped to the exact file or thread and cannot widen into project or
  worktree deletion.

## Non-goals

- Editor tabs, split-file editing, breadcrumbs, minimap, language servers, diagnostics, autocomplete,
  refactoring, debugger, or general IDE chrome.
- Git staging, commit, branch, merge, fetch, push, or conflict-resolution operations.
- File content clipboard operations, drag-to-move, bulk selection, bulk rename, duplicate, archive,
  reveal-in-system-file-manager, or arbitrary shell commands.
- A new state owner, generic filesystem IPC, executable extension system, or replacement design
  system.
- Redesigning Markdown typography, terminal output, quick access, themes, notifications, or Changes.

## Terminal condition

This goal is complete when the Files pane always restores a truthful virtualized view; direct folder
intent is predictable and incidental events preserve disclosure; the bounded file operations work
from pointer and keyboard through safe native authority; Threads exposes one understandable removal
model; the Shortcut Reference is a compact editable view of the live registry; project disclosure
and all context menus report and operate their real state; thread geometry is visually verified; and
the focused plus integrated checks above pass without regressions to drafts, active context, live
terminal sessions, accessibility, themes, or idle performance.
