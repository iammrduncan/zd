# Hammerspoon as a ZD experiment and integration surface

Research date: 2026-08-11

Project and docs: [Hammerspoon](https://www.hammerspoon.org/)

## What it is

Hammerspoon is a macOS automation application configured in Lua. It exposes modules for global
hotkeys, application activation, windows, screens, Spaces-adjacent behavior, events, processes,
URLs, and many other system facilities.

For ZD, its best role is experimental scaffolding: prove the summon/dismiss chord and placement
policy before changing native code, or offer a power-user integration. It is not a cross-platform
host for the editor, terminal, browser, or workflow system.

Official API references:

- [`hs.hotkey`](https://www.hammerspoon.org/docs/hs.hotkey.html)
- [`hs.application`](https://www.hammerspoon.org/docs/hs.application.html)
- [`hs.window`](https://www.hammerspoon.org/docs/hs.window.html)
- [`hs.screen`](https://www.hammerspoon.org/docs/hs.screen.html)

## Pros

- Fastest way to test whether the proposed interaction is actually useful in daily work.
- Can bind a global chord, launch or activate ZD by bundle identifier, and manipulate its window.
- Can test alternative placement rules—active screen, pointer screen, fixed size—without shipping
  those choices in ZD.
- Configuration is local and transparent Lua.
- Avoids prematurely making the hotkey experiment a product commitment.
- Useful optional integration for a single power user.

## Cons

- Requires Hammerspoon to be installed and granted macOS automation/accessibility permissions.
- macOS-only and unsuitable as the product's default behavior.
- Activating and moving an ordinary window is not identical to a properly configured `NSPanel`,
  especially across full-screen Spaces and focus restoration.
- External configuration can drift from ZD behavior and is harder to support.
- A large Lua configuration can become a second application layer.
- Does not provide any of ZD's editing, terminal, browser, project, or agent functionality.

## Verdict

Use Hammerspoon for a one-day interaction experiment if native implementation would otherwise be
blocked on unresolved UX choices. Do not ship it as ZD's global-access architecture. Once the
interaction is validated, implement the minimum supported behavior in ZD's Tauri/AppKit shell.

## Evidence gaps

- Hammerspoon has not been used to test the current ZD bundle and window behavior.
- macOS accessibility prompts and the user's existing automation setup may affect the experiment.
- Ordinary application activation may switch Spaces rather than summon onto the current one; that
  limitation is part of what the experiment should record.
