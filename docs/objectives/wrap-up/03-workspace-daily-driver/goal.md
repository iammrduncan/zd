# Goal 03: Complete the workspace daily driver

## Outcome

A user can start from Home, select or create a document, browse a calm file tree, filter and search
the workspace, see optional Git state, and reopen recent work without leaving `zd md`.

## Source todos

- **WU-015:** Finish the collapsible, movable, monospace sidebar tree.
- **WU-016:** Draw nesting guides for expanded folders.
- **WU-017:** Default to Markdown files with an all-files toggle.
- **WU-018:** Add keyboard-driven fuzzy Quick Open.
- **WU-019:** Keep Quick Open on one stable plane while typing.
- **WU-023:** Add a Home screen with persistent recent folders and files.
- **WU-024:** Add folder/file pickers and create-file from Home.
- **WU-032:** Add optional Git status decoration to the sidebar.
- **WU-033:** Extract the file navigator as a reusable suite component after the base app.

## Acceptance criteria

1. The sidebar renders a monospace workspace tree, starts in the specified collapsed state, toggles
   folders, can collapse completely, and can move to either side without losing selection.
2. Expanded folders draw a quiet nesting guide through their visible descendants without changing
   row geometry or obscuring focus.
3. The tree initially shows Markdown files. One explicit toggle reveals all supported workspace
   entries and preserves the current document when the filter changes.
4. `Cmd+K` opens Quick Open, applies deterministic fuzzy ranking as the user types, supports full
   keyboard navigation, and opens the selected file.
5. Quick Open retains one mounted plane, query focus, and results region with no blank intermediate
   frame during progressive discovery.
6. Bare app launch shows Home with persistent recent folders and files. Folder/file pickers and
   create-file can enter the document workspace through the platform boundary.
7. Git decorations are opt-in, distinguish added/changed/deleted states without relying only on
   color, and do not delay ordinary tree interaction.
8. After the base `zd md` behavior is complete, the navigator is extracted behind a suite-owned
   interface that preserves all behavior and can be mounted by another miniapp without copying the
   Markdown implementation.
9. Browser and native checks cover launch, keyboard navigation, filtering, persistence, and the
   extracted component boundary.

## Terminal condition

All nine source todos are closed, the complete Home-to-document and Quick-Open-to-document paths
pass automated checks, and a native checkpoint confirms a folder can be used as a daily driver.

## Exclusions

- File editing behavior inside the document surface.
- Relative-link and document-history behavior, which belong to Goal 04.
- A full source-control client, staging, commits, branches, or diffs.
- Extracting the navigator before the base app supplies two real consumers or an approved suite
  boundary.
