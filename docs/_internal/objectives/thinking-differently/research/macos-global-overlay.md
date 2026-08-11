# macOS global-overlay feasibility

Research date: 2026-08-11

## Question

Can the current ZD app appear on the active Mac display or Space from a global shortcut, accept
keyboard input, switch projects with `Command-1`/`Command-2`/`Command-3`, and disappear back to the
previous app when the shortcut is pressed again?

## Short answer

Yes. This is a bounded native-shell feature, not evidence that ZD needs a different host.

The ordinary case is already covered by supported Tauri 2 capabilities: register a global
shortcut, show/hide the existing window, keep it above other windows, and make it visible on all
workspaces. The polished macOS case—especially preserving or restoring focus and appearing over
another application's full-screen Space—needs AppKit window behavior. A small `NSPanel` bridge is
the established route.

This should be proved with a throwaway branch or narrow vertical slice before it becomes an
architectural premise. There are enough interactions among Mission Control, Stage Manager,
multiple monitors, full-screen apps, and focus that API availability alone is not proof of good
behavior.

## Relevant platform capabilities

### Global shortcut

Tauri's official global-shortcut plugin supports macOS, Windows, and Linux and registers handlers
for system-wide chords. It explicitly warns that an already-claimed chord will not trigger the
handler. That makes the shortcut user-configurable and conflict-detectable, not a hard-coded
`Command-T` assumption. `Command-T` is especially collision-prone inside applications even if the
system registration succeeds.

Source: [Tauri global-shortcut API](https://tauri.app/reference/javascript/global-shortcut/)

### Window placement and visibility

Tauri 2's window API exposes `alwaysOnTop`, `visibleOnAllWorkspaces`, `skipTaskbar`, monitor lookup,
position, focus, show, and hide. Tauri 2 also added `visibleOnAllWorkspaces` as a first-class window
creation option.

Sources:

- [Tauri window API](https://tauri.app/reference/javascript/api/namespacewindow/)
- [Tauri 2.0 release notes](https://v2.tauri.app/blog/tauri-20/)

### Spaces, full-screen apps, and Stage Manager

Apple's current AppKit documentation describes `canJoinAllApplications` as intended for floating
windows and system overlays that may join other applications in full-screen Spaces and Stage
Manager. Older AppKit behavior uses `canJoinAllSpaces` and `fullScreenAuxiliary` for adjacent parts
of the same problem. An Apple DTS answer from 2026 recommends an accessory activation policy plus
a non-activating `NSPanel` for a true cross-application overlay.

Sources:

- [Apple `canJoinAllApplications` documentation](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/canjoinallapplications)
- [Apple Developer Forums: overlay above all windows](https://developer.apple.com/forums/thread/826308)
- [Apple Developer Forums: window visible on all Spaces](https://developer.apple.com/forums/thread/26677)

The Apple DTS answer uses a very high window level to remain above full-screen content. That is a
specialized behavior with UX implications: ZD should only occupy that level while summoned and
must not become a persistent obstruction.

## Proposed interaction model

1. ZD remains running after its last visible window hides.
2. A configurable global shortcut is registered by the native shell.
3. On first press, the shell records the currently active app/window and active display, moves the
   ZD panel to that display, shows it, and makes its editor or command surface key.
4. `Command-1` through `Command-9` select ZD workspaces only while ZD is key.
5. On a second global-shortcut press, `Escape`, or an explicit dismiss command, ZD hides and focus
   returns to the prior application.
6. Ordinary Dock/Spotlight launches may still open a normal ZD window. The quick panel should be a
   presentation mode, not necessarily the only application window.

Keeping normal-window and quick-panel behavior distinct avoids forcing a full editor, terminal,
and browser into the odd lifecycle rules of a launcher window.

## Pros

- Directly satisfies the highest-frequency interaction in `thoughts.txt` without replacing the
  existing editor or portable frontend.
- Reuses the current Tauri application and its existing filesystem authority.
- Cross-platform global shortcut and basic show/hide behavior are supported; only the last mile is
  macOS-specific.
- The native complexity is trapped behind the project's existing platform boundary.
- A panel can restore the previous context more naturally than launching/focusing an ordinary app
  window.
- A small experiment can validate the risky behavior before broader architecture work.

## Cons

- Full-screen Spaces and focus restoration are AppKit-specific and require native testing, not
  browser tests.
- `NSPanel` is not a universal abstraction. Windows and Linux need their own behavior and may never
  feel identical.
- A non-activating panel does not automatically solve the need to accept editor and terminal
  keyboard input; the panel configuration must allow becoming key at the right time.
- Multiple displays, Stage Manager, full-screen apps, and app switching produce a meaningful test
  matrix.
- An always-running app has lifecycle, update, memory, and tray/menu-bar decisions.
- A system-wide shortcut can conflict with other software; configuration and an error state are
  required.

## Risks to test explicitly

| Case | What must be true |
| --- | --- |
| Ordinary Space | Summons on the Space currently being viewed, not the Space where ZD last lived. |
| Full-screen browser | Appears without ejecting the user from the browser's full-screen Space. |
| Two monitors | Appears on the display containing the pointer or active window, according to an explicit rule. |
| Dismissal | Returns focus to the previously active application and caret when possible. |
| Shortcut conflict | Reports that the chord is unavailable and offers configuration. |
| Cold launch | The first invocation is fast enough and does not show an intermediate ordinary window. |
| Warm launch | Repeated show/hide has no focus flicker or Space animation. |
| Terminal child | Hiding does not kill the PTY; quitting does not leak it. |
| Unsaved document | Hiding is not treated as closing and never triggers a destructive prompt. |

## Verdict

Build and validate this before reconsidering the whole host. It is a deep-module opportunity: a
small `QuickAccessWindow` interface can hide macOS panel mechanics while the rest of ZD remains
ordinary application code. If the experiment fails on the target combinations, that is useful
evidence for a host change. Until then, the lack of a global overlay is a missing feature, not an
architectural dead end.

## Evidence gaps

- Tauri's standard window primitives have not been exercised in this repository for the exact
  desired behavior.
- The AppKit recommendations need validation on the user's current macOS version, monitor setup,
  Stage Manager preference, and full-screen applications.
- It is not yet decided whether the panel follows the pointer, active window, or remembered display.
- `Command-T` has not been tested for global registration conflicts or reconciled with its normal
  “new tab” meaning inside ZD.
