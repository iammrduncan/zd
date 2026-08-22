# 0007: Dispatch commands from one workbench registry

## Status

Accepted

Supersedes
[0004: Dispatch application commands from the suite registry](0004-dispatch-application-commands-from-suite-registry_H.md).

## Context

The first registry correctly kept application shortcuts active outside the editor and rendered the
same entries in the Shortcut Reference. Its ownership language assumed one mounted miniapp could
register and remove the active commands.

The workbench keeps several regions and processes alive together. Project switching, terminal focus,
Find, Focus, global summon, and notification routing need stable command identities whose meaning does
not depend on mount order.

A native global shortcut also enters below the DOM keyboard dispatcher but must invoke the same
semantic command rather than a second show/hide implementation.

## Decision

One workbench-owned command registry will hold every application command's stable ID, platform
binding, description, availability, and handler.

The workbench state owner will register root commands once. Deep modules will expose operations and
context predicates; they will not install independent application key listeners. Text editors and
terminal emulators may keep input-local keymaps only for behavior that is not an application command.

DOM keyboard dispatch, native menus, command-list activation, notification actions, and the native
global-shortcut adapter will invoke the same command IDs through the registry.

The registry will reject binding collisions. It will resolve Command on macOS and Control on Windows
without claiming the foreign modifier. Unavailable commands remain visible where useful but cannot
run and must explain their state accessibly.

The Command List and Shortcut Reference will render the live registry. No second display-only list
will exist.

## Consequences

- A command has one meaning across keyboard, native, pointer, and notification entry points.
- Global summon can use native registration without creating a second lifecycle path.
- Region remount order cannot add, remove, or silently shadow workbench commands.
- The registry needs tests for collisions, platform labels, availability, routing, and teardown.
- Editor and terminal keymaps must yield only to commands the registry actually handles.
