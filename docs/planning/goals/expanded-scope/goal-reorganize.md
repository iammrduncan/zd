# Workbench Reorganization Goal

## Outcome

ZenSuite's `zd` is one fast, beautiful agent workbench. The `zd md` command and growing-miniapp
model are replaced by one application shell that coordinates projects, threads, the current file,
the file tree, Git changes, and terminal sessions without duplicating their state.

## Visual References

- [Approved overlap workbench](assets/workbench-light-overlap-v2.png) defines the default region
  placement and single-centre-surface composition.
- [Approved side-by-side workbench](assets/workbench-light-side-by-side-v2.png) defines the expanded
  centre composition without moving the persistent Threads or Files/Changes regions.
- [Current reader](../../../user-facing-docs/assets/zd-reader.jpeg) and
  [current comments view](../../../user-facing-docs/assets/zd-comments.png) are the actual light-theme
  and editor-character baseline to retain through the shell migration.

Apply the authority and interpretation rules in the execution plan's Visual Reference Contract.

## Product Decisions

- ZenSuite is the product-family and repository identity; the application, workbench, and command
  are named `zd`.
- `zd` has no spelled-out product expansion.
- There is no separately launched `zd md` miniapp.
- Markdown keeps the current rendered and directly editable CodeMirror surface.
- Code files use the same CodeMirror engine in a code presentation.
- Terminal agents are current scope. ACP agents are future scope. A first-party `zd` agent is not
  current scope.
- The workbench supports multiple projects, project-scoped threads, Files and Changes views,
  installable themes, and a global summon shortcut.
- Low startup time, low memory use, low idle CPU, and responsive interaction are product behavior.

## Acceptance Criteria

1. `zd`, `zd <folder>`, and `zd <file>` enter the one workbench. Product code, tests, help, and
   packaging no longer require a miniapp name to launch the Markdown surface.
2. One versioned workbench state owns stable project, workspace/worktree, thread, and open-file
   identities. A region may observe or request a state transition, but it may not keep a competing
   active-project or active-file value.
3. The shell exposes explicit regions for Threads, the current file, Files/Changes, and terminal
   content. Responsive collapse, keyboard focus ownership, and restored geometry are specified
   before feature UI is attached.
4. Switching project or thread changes the complete workbench context atomically. Dirty documents,
   running terminals, and unavailable paths receive an explicit preserve, refuse, or recovery path;
   switching never destroys them as an incidental remount.
5. Native file authority supports an explicit set of user-approved project and worktree grants.
   The frontend cannot widen those grants, and adding or removing a project cannot expose the rest
   of the filesystem.
6. Theme files use one versioned, validated `<name>.theme.config` schema under the `zd` config
   directory. Invalid or unsupported files fail safely without preventing launch. The application
   ships the current theme, a dark theme, and a Dracula-style theme through the same loader.
7. A platform global shortcut summons and focuses the existing workbench. Clicking away hides it
   without destroying projects, documents, threads, or terminals. Shortcut registration failure is
   reported without preventing ordinary launch.
8. One command registry owns application shortcuts and their displayed labels. The Focus, Find,
   project-switching, terminal-focus, and global shortcuts have one meaning on each platform and do
   not silently shadow text-editing or operating-system behavior.
9. The old suite and miniapp boot paths are removed after their callers migrate. CodeMirror,
   platform authority, atomic saving, untrusted-Markdown handling, and other still-valid deep
   modules are retained rather than rewritten for naming alone.
10. Unit, browser, and native tests cover launch migration, state transitions, authority grants,
    theme validation/fallback, global summon/hide, focus restoration, and preservation of dirty or
    running work.

## Terminal Condition

The one workbench launches without a miniapp selector, owns one coherent context, can be summoned
and hidden without losing work, loads all three built-in themes through the external-theme schema,
and provides stable interfaces on which the remaining expanded-scope goals can build.

## Dependencies

- The authority and product-contract phase of the Documentation Goal must replace conflicting
  suite-era rules before workbench UI implementation begins.
- This goal is the runtime prerequisite for every other expanded-scope feature goal.

## Exclusions

- ACP transport or an ACP agent implementation.
- A first-party `zd` agent.
- Feature-complete Projects, Threads, Terminal, File Tree, Changes, or Notifications behavior;
  those belong to their own goals.
- A plugin framework for arbitrary runtime code. Theme files are validated data, not executable
  plugins.
