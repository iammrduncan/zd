# Architecture

`zd` is a TypeScript product surface inside a thin Tauri shell. That split keeps fast-changing
reading and editing behavior close together while trapping operating-system authority behind one
narrow boundary.

## One suite, several future tools

The native executable is `zd`; `md` is a mini app selected by the launch request. Suite code owns
boot, preferences, design tokens, shortcut dispatch, and overlays that should work above any mini
app. A mini app owns only its working surface. Adding a future `td` tool should mean registering one
new mini app, not cloning a window shell.

This is why the shortcut reference lives in `src/suite/` while Markdown continuation and focus live
under `src/miniapps/md/`.

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

The detailed stack comparison and lessons from the first prototype are in
[the path-forward decision](../path-forward.md). The current behavior target is
[the product vision](../vision.md).
