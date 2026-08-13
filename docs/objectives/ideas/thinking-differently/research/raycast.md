# Raycast as a ZD integration surface

Research date: 2026-08-11

Official developer documentation: [Raycast API](https://developers.raycast.com/)

## What it could do for ZD

Raycast could be a fast command launcher in front of ZD: open a recent project, show a todo list,
capture a task, invoke a CLI command, focus/move the ZD window, or present a compact Markdown detail
view. Raycast extensions are TypeScript/React commands running in Raycast's managed runtime, with
view, no-view, and menu-bar modes.

Raycast should not be mistaken for a host for the full ZD workspace. Its UI is built from Raycast's
components and lifecycle, not an arbitrary long-lived CodeMirror editor, terminal emulator, or
browser workspace.

## Relevant capabilities

- Commands can have user-assigned hotkeys and be launched from Raycast.
- View commands can render lists, forms, grids, and Markdown detail views; no-view commands can
  invoke external behavior.
- Extensions can launch commands, open applications/files/URLs, run subprocesses through Node, and
  store preferences and small local state.
- The Window Management API can discover and reposition windows and desktops, but currently
  requires Raycast Pro access and is not available on Windows.
- Raycast local storage is encrypted and isolated per extension, but official guidance says it is
  not intended for large data; ordinary files remain a better ZD source of truth.
- Extensions have their own V8 isolate and managed Node runtime, but are not generally sandboxed
  from file I/O or networking.

Sources:

- [Raycast manifest and command modes](https://developers.raycast.com/information/manifest)
- [Command API](https://developers.raycast.com/api-reference/command)
- [Window Management API](https://developers.raycast.com/api-reference/window-management)
- [Storage API](https://developers.raycast.com/api-reference/storage)
- [Raycast extension security model](https://developers.raycast.com/information/security)

## Pros

- Excellent already-polished global launcher and shortcut discovery.
- A small extension could expose ZD project switching and task capture quickly.
- TypeScript matches the current frontend skill set.
- Raycast supplies preferences, updates, store distribution, command search, and a large extension
  ecosystem.
- It can orchestrate the ZD CLI without duplicating ZD's file formats or business logic.
- Good secondary surface for actions that finish quickly and do not need a persistent workspace.

## Cons

- Cannot host ZD's custom CodeMirror editing experience.
- Not an integrated PTY/terminal surface.
- Raycast owns window shape, navigation, component set, and lifecycle.
- Window management is a Pro-gated capability and currently Mac-only.
- Creates a required proprietary host dependency if made the primary entry point.
- Extension permissions flow through the Raycast parent process, widening the trust boundary.
- Raycast state would become a second state store unless the extension remains a thin CLI client.
- Does not satisfy the desired `Command-1`/`Command-2` persistent project workspaces.

## Verdict

Build a Raycast extension only after ZD has stable CLI commands for “list recent projects,” “open
project,” “list/capture todo,” and “summon.” It is a valuable remote control and capture surface,
not the architecture of ZD itself. The extension should remain stateless apart from preferences and
delegate all durable behavior to ZD.

## Evidence gaps

- The exact UX of invoking and dismissing an already-running ZD panel from a Raycast command needs a
  prototype.
- Current Raycast plan/pricing details should be checked immediately before depending on a Pro API.
- There is no stable ZD command surface for all proposed actions yet.
