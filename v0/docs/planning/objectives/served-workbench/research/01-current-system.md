# Current system and migration boundary

This document answers research questions 1 and 2: what exists today, what is actually duplicated,
and where a served backend can enter without rewriting the workbench. The raw evidence is in
[the architecture return](subagent_outputs/00-current-architecture.txt).

## Established

There is only one production filesystem, Git, and terminal backend today. It is the Rust code
reached through Tauri. The production browser adapter reports those capabilities as unavailable in
[`platform.ts`](../../../../../packages/app/src/platform.ts); the fuller browser implementations are
deterministic test fixtures in
[`fixture.ts`](../../../../../packages/app/src/workbench/fixture.ts). The change prevents a second
production backend rather than deleting one that already exists.

The existing platform boundary is unusually favorable:

- [`platform.ts`](../../../../../packages/app/src/platform.ts) is the only production frontend file
  that imports Tauri APIs.
- Workbench boot receives a `Platform` value instead of constructing native dependencies inside
  features.
- Files, Git, terminals, projects, and notifications already consume narrower adapters below that
  boundary.
- Grant, path, file-tree, Git, worktree, PTY, and diagnostic logic is mostly ordinary Rust below
  thin Tauri command or event wrappers.

The obstacle is ownership, not reusable algorithms. Most Rust modules are private inside the Tauri
crate, and integration tests source-import them rather than exercising a public host service. The
current broad `Platform` also combines two different locations of authority:

| Host capability | Client-shell capability |
| --- | --- |
| Project/worktree grants and persistence | Window focus, close, and quick access |
| Files, Git, worktrees, and watchers | Global shortcuts and native notification presentation |
| PTYs and host process cleanup | Opening external links on the viewing computer |
| Host diagnostics and validated theme files | A local picker when client and host are the same computer |

The host column must work identically for browser and Tauri clients. The shell column cannot be sent
blindly to a remote host: it would focus a window or open a URL on the wrong computer.

Current runtime semantics assume one consumer. A new watcher replaces the prior watcher for the
same project/worktree scope, and terminal reads drain one shared output queue. Project, worktree,
terminal, and watcher IDs are process-local identifiers; they are not authentication credentials.

The frontend also stores preferences, settings, drafts, and review comments in origin-scoped
`localStorage`. A free port changes the browser origin on each server launch. Without a storage
change, a restart can make unsaved drafts appear lost, which conflicts with
[`DESIGN.md`](../../../../DESIGN.md)'s recovery contract.

## Claimed

The owner wants `zd serve .` to run the authoritative backend on the project computer, allow a
browser to connect, and make Tauri a literal wrapper around that same backend. “Everything runs
through the backend” is understood here as host authority. It does not move DOM rendering or the
single frontend `WorkbenchState` owner into Rust.

## Inferred

The target frontend boundary should be composed from two interfaces:

```text
Workbench features
        │
        ▼
Platform = WorkbenchHost + ClientShell
             │              │
             │              ├── browser shell
             │              └── Tauri shell
             ▼
       served host client
             │
             ▼
      one Rust host service
```

The Rust migration should first create a public, transport-neutral host service. WebSocket handlers
and any temporary Tauri adapters must be thin callers of that service. Copying each current Tauri
command into a route before this service exists would preserve two orchestration paths and two sets
of validation.

The first implementation should admit one controlling client. Multi-client fan-out is not a small
transport enhancement; it changes watcher ownership, terminal output retention, conflict policy,
and workbench state semantics.

## Gaps

- There is no public Rust host-service API or Cargo workspace boundary yet.
- Browser reload cannot rediscover and reattach live PTYs.
- Stable workbench persistence across changing origins is not designed.
- Absolute host roots currently cross the frontend boundary and may be disclosed to an authenticated
  remote client.
- The existing filesystem validation is path-based. It does not close every check-then-use race with
  another local process.
- No test runs the real TypeScript client against real Rust file or PTY operations.

These gaps require later work packets. They do not block a read-only, single-project walking
skeleton that has no PTY and no durable browser state.
