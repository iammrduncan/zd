# Architecture

`zd` is a TypeScript product surface inside a thin Tauri shell. That split keeps fast-changing
reading and editing behavior close together while trapping operating-system authority behind one
narrow boundary.

## One workbench, shared owners

The native executable is `zd`; every supported launch enters the same root workbench. Workbench code
owns boot, versioned state, preferences, shortcut dispatch, the Shortcut Reference, and region
composition. The retained Markdown implementation supplies the current-file surface while its deep
CodeMirror behavior migrates behind editor contracts.

This is why shared application behavior lives in `src/workbench/`, while Markdown continuation and
focus remain temporarily under `src/miniapps/md/`.

## A deep native boundary

The frontend knows the native world only through `packages/app/src/platform.ts`. The Tauri side
resolves launch arguments, owns the permitted filesystem scope, performs whole-file reads and
atomic writes, handles external URLs, and mediates window close requests.

That boundary absorbs security-sensitive details instead of asking every editor feature to reason
about paths or permissions. A document launched from one folder cannot name an arbitrary file
outside its native scope. A queued Finder open moves both launch state and scope only after the
current document agrees it can switch without losing work.

## The rendered source is the editor

There is no reader component synchronized with a separate editor. CodeMirror holds the one source
buffer while decorations shape Markdown as a reading surface. The caret, focus target, save state,
and rendered notation therefore cannot drift between two modes or two copies of the document.

This decision trades some decoration complexity for a much simpler product model: the thing being
read is exactly the thing being edited and saved.

## Tests follow the boundaries

- Unit and contract tests cover pure document behavior, repository invariants, release scripts,
  and native launch/filesystem rules.
- Playwright covers the browser-visible reading and editing paths at their assembled cut point.
- Rust tests cover authority and path behavior without requiring a webview.
- Packaging checks inspect the real application bundle and disk image where metadata or signatures
  cannot be proven in the browser.

The result is one simple rule for product code: document behavior stays in the portable frontend,
and operating-system authority stays behind the native platform boundary.
