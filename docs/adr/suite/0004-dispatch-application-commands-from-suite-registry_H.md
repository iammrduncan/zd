# 0004: Dispatch application commands from the suite registry

## Status

Accepted

## Context

Human feedback reported that an application shortcut failed when focus was outside the editor. An
editor keymap cannot own commands that apply to the complete window.

The shortcut reference must also stay synchronized with the active command bindings. Separate
lists can describe keys that the application does not handle.

macOS uses Command for application shortcuts and keeps Control for standard text editing. Other
platforms use Control as the application modifier.

## Decision

We will register application commands in one suite-owned command registry.

The suite will dispatch command shortcuts at the window boundary. A mini app will register the
action for its active surface. The editor will expose operations such as save without binding the
application chord itself.

The shortcut reference will render the same registry entries that handle keyboard events.

The logical application modifier will resolve per platform. A foreign physical modifier will not
match the command.

## Consequences

- Application shortcuts work when focus is outside the editor.
- The shortcut reference cannot drift into a second command list.
- macOS Control editing chords remain available to CodeMirror.
- Mini apps need explicit registration and cleanup when their active surface changes.
- Text-entry keymaps can still own commands that are local to the editor.
