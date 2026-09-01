# Execute goal 03: Keep watches and terminals coherent through reconnect

## Prerequisites

- [Execute goal 02](execute-goal-02.md) is complete. This goal needs the full non-streaming host
  authority, stable identities, durable state, bounded socket, and real read/write browser harness.
- The owner may not release this goal independently as the desktop cutover. Tauri still uses its
  temporary adapter until goal 04.
- This goal is serialized with goals 01–02 and 04–05 because it owns host runtime state, socket
  dispatch/events, frontend platform composition, Tauri migration wrappers, and lifecycle tests.

### Needed from the owner before starting

Nothing. This goal can start as written. The accepted architecture already selects one controller,
one event socket, structured project-scoped shells, explicit reconnect, and descendant cleanup.

## `/goal` objective

This goal delivers work packet 2 from
[`02-DELIVERY-PLAN.md:43-56`](../02-DELIVERY-PLAN.md#work-packet-2-watchers-ptys-and-reconnect).

Move filesystem watch signals and the complete PTY lifecycle behind `HostService` and the existing
authenticated WebSocket. A transient network/socket loss must have an observable result: reconnect
reattaches within the bounded grace period or reports that the terminal was lost. Event gaps trigger
an authoritative resnapshot; no reconnect path silently starts a duplicate process.

## Required outcome

When the work is complete, the repository must have:

1. Tauri-free host runtime owners for approved-scope file watchers and structured terminal sessions,
   extracted from `packages/tauri/src/file_tree_watch.rs`, `terminal/`, and `terminal_runtime.rs`,
   with temporary Tauri wrappers delegating to the same owners;
2. one versioned event envelope containing protocol version, session epoch, monotonically increasing
   sequence, closed event name, and closed payload for `fileTree.changed`, `fileTree.unavailable`,
   `terminal.outputReady`, `terminal.exited`, and `session.resyncRequired`;
3. exact request methods `session.snapshot`, `session.resume`, `session.heartbeat`,
   `fileTree.watch.start`, `fileTree.watch.stop`, `terminal.start`, `terminal.write`,
   `terminal.resize`, `terminal.read`, `terminal.pollExit`, `terminal.terminate`, and
   `terminal.dispose`, with no executable, argv, cwd, root, environment, or arbitrary subscription
   field;
4. an authoritative session snapshot that returns the current epoch/sequence, active watch scopes,
   terminal handles, bounded output offsets, and exit/availability state without returning terminal
   contents, environment, canonical roots, or diagnostic data;
5. a bounded replay journal retaining at most 1,024 events and 1 MiB of serialized event metadata;
   `session.resume` replays a contiguous retained suffix or returns `resync-required` with the current
   snapshot, never an incomplete sequence presented as complete;
6. socket heartbeat and liveness handling that sends a protocol heartbeat every 10 seconds, treats
   30 seconds without a valid response as disconnected, and records round trip separately from host
   operation time without comparing wall clocks;
7. a 30-second controller-disconnect grace period during which watchers and PTYs remain owned by the
   host; a reauthenticated controller with the same process secret may resume, while expiry stops
   watchers, terminates/reaps PTY descendants, records explicit loss, and releases all buffered
   output;
8. a served client that reconnects with its in-memory credential after an abnormal socket loss,
   resumes by epoch/sequence, performs full state/tree/Git/terminal reconciliation on an epoch change
   or replay gap, and requires unlock again after a page reload because the secret is not durable;
9. enforcement of at most 32 watchers and 32 terminal sessions per host, one watcher per
   project/worktree scope, the existing 150 ms watch debounce, 4 MiB default/16 MiB maximum output
   buffer per terminal, 64 KiB input per write, and a bounded outbound event queue that degrades to
   one resync-required marker instead of growing; and
10. real interruption/reload evidence on Unix plus platform-gated Windows process-containment tests
    proving reattach/no-duplicate behavior, explicit post-grace loss, sequence-gap recovery, and
    complete descendant cleanup at host shutdown.

## In scope

- **Watch ownership.** Owns extraction of `packages/tauri/src/file_tree_watch.rs`, notify
  dependencies, host service composition, and watch tests. Events remain path-free scope signals;
  clients request a fresh bounded tree/Git snapshot.
- **Terminal ownership.** Owns extraction of `packages/tauri/src/terminal/` and
  `terminal_runtime.rs`, portable-PTY/process-tree behavior, output signaling, and cleanup tests.
  `HostService` resolves the approved worktree before constructing a terminal scope.
- **Protocol runtime.** Owns event multiplexing, replay journal, heartbeat, controller lease/grace,
  shutdown hooks, and `packages/server/` tests. Requests and events stay on the one socket.
- **Frontend reconnect.** Owns `packages/app/src/platform/served-client.ts`, `served.ts`, terminal and
  file-tree adapter glue, state reconciliation call sites, and focused unit/Playwright evidence.
- **Migration wrappers.** Tauri event/command wrappers may remain only if they delegate to the host
  runtime and pass the same lifecycle tests. Goal 04 removes the retired authority surface.
- **Evidence.** Extends the real served fixture with controllable network/socket interruption and
  process probes; time-based unit tests use paused/fake clocks rather than wall-time sleeps.
- **Serialization.** Goal 04 waits because wrapper reload and shutdown depend on these exact
  reconnect and cleanup semantics.

## Required tests and evidence

At minimum, prove:

- a watcher request resolves one active grant, replaces only the same scope's prior watcher, ignores
  `.git` internals except linked/current HEAD changes, emits no path, and refuses invalid IDs,
  unapproved scopes, excess watchers, symlinks, and post-shutdown callbacks;
- terminal start resolves one approved worktree and starts only the configured user shell with fixed
  `TERM`, `COLORTERM`, and `TERM_PROGRAM`; deserialization cannot supply an executable, args, cwd,
  root, or environment;
- terminal input, viewport, session identity, output, and session count bounds fail before allocation
  or OS work; slow/no client consumption caps retained bytes and reports exact dropped offsets;
- every emitted event has the current epoch and a strictly increasing sequence; concurrent watcher/
  PTY callbacks serialize through one journal, and the journal never exceeds either configured bound;
- resume after the last retained sequence replays each event once and in order; a duplicate/ahead/
  old epoch or evicted sequence returns a snapshot plus `resync-required`, after which the frontend
  replaces tree/Git/runtime knowledge instead of applying a partial delta;
- an abnormal disconnect retains the same PTY process and output within 30 seconds, and reconnecting
  never invokes `terminal.start`; page reload plus a new unlock reattaches the recorded handle;
- after grace expires, every terminal and descendant is terminated and reaped, watchers are dropped,
  the next connection receives an explicit missing/exited result, and no stale output-ready event is
  attributed to a new epoch or handle;
- heartbeat round trip is separately visible in client timing, three missed 10-second intervals
  trigger the same disconnect path, and a background or slow client cannot create an unbounded timer,
  task, message, or reconnect loop;
- graceful server shutdown stops acceptance, flushes durable state/diagnostics, closes watchers,
  terminates/reaps all PTYs, drains/join readers, closes the listener, and returns within a tested
  deadline; a cleanup error does not strand other sessions;
- Unix process-group evidence proves a shell child and grandchild exit; Windows tests prove the job/
  process-tree containment path and no surviving descendant, without making a skipped Windows test
  count as evidence on Unix;
- the real browser receives a real watcher refresh, runs a shell probe, sees output, survives an
  injected socket interruption without a duplicate process, then receives an explicit lost state in
  the post-grace case;
- the process secret remains only in memory, terminal bytes/commands never enter logs/diagnostics/
  durable state, and pre-authentication/event-gap errors reveal no grant, path, process, or output;
- all goal 00–02 path, persistence, editing, Git, and security evidence stays green; and
- `npm run check`, normal and served Playwright targets, `cargo test --workspace`, platform-specific
  terminal tests, `cargo fmt --all -- --check`,
  `cargo clippy --workspace --all-targets -- -D warnings`, and `git diff --check` pass with exact
  counts and runtime limits recorded.

## Explicit non-goals

- Do not add simultaneous controllers, collaboration, controller takeover, multi-client watcher
  fan-out, or multiple readers competing for one PTY output queue.
- Do not persist terminal output, commands, environment, OS process IDs, PTY handles, or a promise to
  reattach after host-process restart. A new session epoch makes prior runtime resources explicitly
  unavailable.
- Do not silently restart a lost terminal, create a duplicate after reconnect, or treat a replay gap
  as a normal next event.
- Do not use polling as the steady-state watcher or terminal-output mechanism. Heartbeat and explicit
  exit probes are lifecycle checks, not content polling.
- Do not add a second WebSocket, HTTP terminal routes, one HTTP request per keystroke, WebRTC, or a
  generic streaming channel.
- Do not change Tauri process topology, package artifacts, or release documentation; goals 04–05 own
  those changes.

## Engineering constraints

- Follow repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md),
  [`DESIGN.md`](../../../../DESIGN.md), and ADR 0009. Reproduce every discovered lifecycle failure in
  a deterministic test before fixing it.
- Keep concurrency simple: one runtime owner, bounded queues, one serialized event journal, and
  explicit shutdown. Do not hold the grant/runtime mutex while blocking on process I/O, callbacks,
  socket writes, or thread joins.
- Install cleanup ownership before starting callbacks/processes. Every early-return path after spawn
  must terminate and reap what it created.
- Use monotonic clocks for grace, heartbeat, and timing. Paused-time tests must prove boundaries
  without sleeps; real process tests may use bounded deadlines only around observable OS behavior.
- Keep errors and diagnostics content-free. Stable IDs, event sequence, byte counts, outcome, and
  duration are sufficient.
- Preserve unrelated changes, use `apply_patch`, short one-line commits, and no coauthor tags.

## Completion definition

The goal is complete only when watchers and PTYs run inside the Tauri-free host, one authenticated
socket carries their bounded events and operations, transient interruption reattaches without
duplication, replay gaps and process restart resnapshot explicitly, grace expiry and host shutdown
terminate/reap every descendant, real Unix/browser evidence and Windows containment tests pass, and
all prior capability/security gates remain green.

If reconnect requires durable secrets, terminal serialization, generic process authority, a second
event transport, unbounded replay/output, concurrent controllers, or a platform that cannot prove
descendant cleanup, stop and report the exact conflict. Do not hide a missing platform result behind
conditional compilation or a skipped test; goal 04 depends on honest reload and shutdown behavior.
