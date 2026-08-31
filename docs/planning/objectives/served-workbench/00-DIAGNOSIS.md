# Diagnosis: portability stops at an inert browser boundary

This document establishes the problem before selecting a transport or delivery sequence. It is based
on the compiled [current-system research](research/01-current-system.md) and the repository sources
named there.

## What is actually wrong

The TypeScript workbench is portable in composition but not in authority. Product features depend
on one injected `Platform`, yet its browser implementation refuses files, Git, watchers, and
terminals. The only production backend is Rust reached through Tauri.

The proposed change must therefore add the first real browser-to-host path. It must not add a second
implementation of grants, path validation, file operations, Git, or PTYs. The durable result is one
host service with two clients:

- a normal browser, usually connected through an SSH port forward; and
- the Tauri desktop shell, which retains only viewing-computer behavior.

The phrase “Tauri is a wrapper” has a precise limit. Tauri still owns its window, focus, global
shortcut, desktop notifications, and external-link presentation. Files and terminals cannot own
those behaviors because a remote host is the wrong computer on which to perform them.

## Evidence

- [`packages/app/src/platform.ts`](../../../../packages/app/src/platform.ts) is the sole production
  Tauri import boundary and already injects narrower feature adapters.
- Its browser adapter is inert; the richer browser backend is a fixture, not production code.
- Most Rust operations are reusable below Tauri wrappers, but the modules are private and no public
  host service composes them.
- Watchers replace the prior consumer for a scope, and PTY output reads drain one queue. Current
  runtime semantics are not multi-client.
- Preferences, settings, drafts, and reviews use origin-scoped browser storage. A random port changes
  that origin and can hide durable work after restart.
- Current release automation has no Linux server artifact, and the Windows desktop executable uses
  a GUI subsystem that is unsuitable as an unexamined console CLI.

## Failure modes the plan must prevent

1. Copying Tauri command handlers into HTTP routes creates two orchestration and validation paths.
2. Treating grant IDs as secrets exposes predictable process-local identifiers as authentication.
3. Binding a plaintext terminal service to a LAN or public interface exposes host-user shell
   authority.
4. Claiming multi-client support lets clients race for watchers and consume one another's PTY output.
5. Loading a random-port origin without migrating durable storage makes drafts and settings appear
   lost.
6. Sending window, notification, or external-link operations to the server acts on the wrong
   computer.
7. Building Tauri supervision before a real server protocol exists couples two new failure surfaces
   and obscures which one broke.

## Options considered

| Option | Result |
| --- | --- |
| Custom SSH-aware product protocol | Rejected. It couples connection setup and product semantics and does not help browser delivery. |
| Separate TypeScript/Node backend | Rejected. It would duplicate the existing Rust file, Git, grant, and PTY implementation. |
| Mirror every Tauri command as a route | Rejected. It preserves a broad shell-shaped API and two orchestration layers. |
| Extract one Rust host service and serve it | Selected. It reuses the deepest existing code and gives browser and desktop one authority path. |

## Cost and uncertainty

This is not one small implementation change. It crosses Rust crate boundaries, frontend dependency
composition, a privileged network protocol, browser persistence, PTY lifecycle, desktop lifecycle,
and release packaging. The highest-uncertainty surfaces are PTY reconnect semantics and Windows/Linux
artifact topology. The first goal deliberately avoids both.

## Not covered here

This diagnosis does not choose message fields, authentication bootstrap, process topology, or goal
ordering. Those decisions are in the following plan documents.
