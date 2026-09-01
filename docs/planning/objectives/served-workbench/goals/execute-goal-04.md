# Execute goal 04: Make Tauri a supervised client shell for `zd serve`

## Prerequisites

- [Execute goal 03](execute-goal-03.md) is complete. This goal needs the full host/protocol,
  durable restart behavior, reconnect/reattach semantics, and deterministic host cleanup before the
  desktop can delegate its lifecycle to a child.
- Goals 00–02 established the exact executable server contract, stable identity/state path, and
  complete non-shell capability surface this wrapper must reuse.
- The owner may not release this goal until goal 05 packages and tests the platform-specific console
  and desktop artifact layout.
- This goal is serialized with every other served-workbench goal because it removes old Tauri
  authority and changes shared CLI, platform, server, and build composition.

### Needed from the owner before starting

Nothing. The owner explicitly selected a literal Tauri wrapper around the same `zd serve` process.
The accepted architecture defines which behaviors remain client-local.

## `/goal` objective

This goal delivers work packet 3 from
[`02-DELIVERY-PLAN.md:58-79`](../02-DELIVERY-PLAN.md#work-packet-3-stable-cli-dispatch-and-tauri-client-shell).

Make `zd serve` a stable foreground dispatch mode, then turn the Tauri application into a real
supervisor and viewing-computer shell for that same executable. The webview must use the socket for
all host work. Tauri retains only window/focus/close, global summon, local notifications/sound,
external links, and trusted same-machine picker/file-open inputs.

## Required outcome

When the work is complete, the repository must have:

1. one tested top-level CLI dispatcher in the shipped Rust executable: `zd`, `zd <folder>`, and
   `zd <file>` enter the desktop path; `zd serve [<folder>] [--bind <ip>] [--port <port>]` enters the
   foreground host, defaults a missing folder to the invocation directory, and rejects unknown
   options or extra positionals before either runtime starts;
2. direct `zd serve` behavior equivalent to the proven developer server: approve before listen,
   all IPv4 interfaces by default, an optional numeric bind restriction, port zero by default,
   separate connection/secret output after readiness, SIGINT/SIGTERM cleanup, and no Tauri
   initialization or GUI requirement;
3. a wrapper-child mode of that same executable using inherited private input/output channels for
   one bounded versioned readiness record and lifecycle controls; the record contains application/
   protocol versions, literal loopback origin, session epoch, and secret, while credentials never
   enter argv, environment, URL, logs, browser persistence, or ordinary child output;
4. a Tauri supervisor that starts exactly one child, continuously drains all child pipes, enforces a
   10-second startup deadline, rejects malformed/oversized/mismatched/non-loopback readiness, reports
   early exit, and navigates the `main` webview only after validation;
5. private desktop credential bootstrap into the new webview's memory so it connects without an
   unlock form and without exposing the secret as a page-global, DOM attribute, query/fragment,
   cookie, storage value, diagnostic field, or reusable Tauri command result;
6. one primary-instance owner: webview reload reuses its child, a secondary desktop launch forwards
   its trusted folder/file intent to the primary instance, and neither path creates another server,
   listener, controller, or host state owner;
7. a narrow `TauriShell` implementing only native open/picker/recovery input, window presentation and
   focus, safe close, global summon, native notifications/sound, and external links; each command
   verifies the `main` webview is currently at the supervisor's exact child origin before acting;
8. trusted picker/file-association operations that keep absolute paths inside the wrapper/control
   channel, ask the child host to approve or recover them, and return only typed grants/launch intents
   to the frontend; ordinary served browser input still cannot supply a root;
9. removal from Tauri registration/capabilities of filesystem, file-tree, Git, worktree, watcher,
   host-diagnostic, persistence, and terminal authority; deleting the WebSocket host must make those
   features unavailable rather than silently falling back to invoke;
10. explicit disconnect and shutdown presentation: a ready child exit leaves current in-memory UI
    visible with an accessible disconnected state and does not auto-restart; safe desktop close asks
    the child to shut down, waits 5 seconds, force-terminates after the deadline, reaps on every path,
    and closes the window only after cleanup; and
11. native smoke evidence that desktop launch, reload, secondary launch, trusted open, quick access,
    notification return, child failure, and close all exercise one server child and the same
    browser-proven host protocol.

## In scope

- **CLI dispatch.** Owns executable entry points, shared CLI parsing, root Cargo targets, and focused
  parser/process tests. A hidden wrapper-child switch is internal and must not widen the public help
  contract.
- **Private child protocol.** Owns readiness/control record types, bounded pipe framing, child
  startup/shutdown modes, parent-loss signaling where supported, and fake-child plus real-child
  tests. The public WebSocket remains the only workbench host protocol.
- **Tauri supervision.** Owns `packages/tauri/src/main.rs`, `lib.rs`, new cohesive supervisor/shell
  modules, Tauri plugins/capabilities/config, and native tests. Install cleanup before entering the
  application event loop.
- **Client-shell composition.** Owns the relevant `packages/app/src/platform.ts`, composition/boot
  code, shell bridge types, and tests. Feature modules continue to receive `WorkbenchHost` and
  `ClientShell`, not a wrapper-child API.
- **Authority retirement.** Owns deletion or de-registration of migrated Tauri commands/modules and
  associated test relocation. Keep only genuine viewing-computer implementation under Tauri.
- **Evidence.** Owns a native smoke harness with injectable child, process, and window interfaces plus platform
  runs. A mock that only asserts supplied values is not sufficient; at least one test launches the
  real executable and reaches `/healthz`/WebSocket readiness.
- **Serialization.** Goal 05 waits because packaging must encode this final executable and child
  topology, not an intermediate one.

## Required tests and evidence

At minimum, prove:

- the CLI distinguishes a path named `serve` only according to the documented subcommand grammar,
  resolves relative paths against the invocation directory, accepts `--bind` and `--port` only in
  serve mode, defaults serve root/bind/port correctly, and rejects missing option values, repeated
  roots, unknown flags, hostnames, invalid IPs/ports, and extra arguments without initializing Tauri
  or binding;
- direct serve prints credential-free connection information and one separate secret only after
  health/socket routes accept traffic, while wrapper-child mode prints neither to ordinary stdout/
  stderr and sends one readiness frame only on its inherited private channel;
- the supervisor rejects timeout, EOF, early exit, partial/multiple/oversized frames, invalid JSON,
  wrong app/protocol version, hostname `localhost`, non-loopback/wildcard origin, URL credentials,
  and a readiness secret of the wrong shape; every failure drains and reaps the child;
- stdout/stderr bursts larger than OS pipe capacity cannot deadlock startup or shutdown and are
  retained only as bounded redacted diagnostic metadata, never raw secrets, source, paths, or
  terminal content;
- the desktop webview never navigates before validated readiness, receives its secret only in a
  one-use initialization path, connects as the one controller, and leaves URLs, DOM, cookies,
  local/session storage, console, and diagnostics free of the secret;
- reload creates zero additional child processes and reconnects to the same session epoch; a second
  application launch forwards one trusted open intent and exits without binding or showing a second
  workbench; repeated file events preserve the existing guarded frontend transition semantics;
- every Tauri shell command rejects a non-main window, a local bootstrap page after cutover, a
  foreign/changed loopback origin, malformed payload, and a call after child exit; only the exact
  active child origin receives the minimal shell behavior;
- a compromised served page cannot invoke a retired file/Git/watch/terminal/persistence/diagnostic
  command because it is absent from both handler registration and capability permission, not because
  a handler returns an error;
- picker/recovery/open paths never cross the webview boundary, and the child accepts them only over
  the authenticated private wrapper control path as typed approval intents; a normal browser socket
  still rejects the same root-shaped message;
- safe close with a responsive child performs host cleanup then reaps and exits; an unresponsive or
  crashed child is force-terminated/reaped after 5 seconds; quick-access hide, focus loss, and window
  reload do not stop the child; parent-loss tests leave no child, listener, watcher, or PTY descendant;
- a ready child crash shows an accessible disconnected notice while preserving the last workbench
  DOM/state, performs no automatic restart, and an explicit later retry cannot launch until the old
  generation is conclusively reaped;
- macOS, Windows, and Linux-gated native tests cover process creation/reaping and window shell
  behavior that is platform-specific; conditional tests report which platform evidence was actually
  run;
- the direct-browser served target and every goal 00–03 security/reconnect test stay green; and
- `npm run check`, browser and served Playwright targets, `cargo test --workspace`, native smoke
  targets, `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and
  `git diff --check` pass with exact process/deadline evidence recorded.

## Explicit non-goals

- Do not embed a Tauri-only in-process server, localhost plugin backend, alternate filesystem/Git/
  terminal invoke fallback, or a second frontend asset build.
- Do not pass credentials through argv, environment, URL, cookies, storage, global JavaScript,
  ordinary stdout/stderr, or a generally callable Tauri command.
- Do not permit arbitrary remote URLs or every loopback page to use shell commands. Runtime exact-
  origin checks remain mandatory even if Tauri's static capability pattern must name loopback ports.
- Do not automatically restart a ready child, hide a crash by remounting fixture state, or launch a
  new generation before the old process and descendants are reaped.
- Do not let Tauri own workbench state transitions or bypass dirty-buffer/terminal guards for native
  open events.
- Do not solve Windows console/GUI naming, macOS CLI linking, Linux installers, signing, or release
  publishing here; goal 05 owns artifact topology.
- Do not add product-managed SSH, public-Internet transport, TLS/proxy identity, multiple
  controllers, or collaboration.

## Engineering constraints

- Follow repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md),
  [`DESIGN.md`](../../../../DESIGN.md), ADR 0009, and the shutdown order in
  [`01-TARGET-ARCHITECTURE.md:100-123`](../01-TARGET-ARCHITECTURE.md#desktop-process-topology).
- Model child supervision as one explicit state machine with one owner. Do not spread generation,
  readiness, reaping, and shutdown booleans across event callbacks.
- Continuously drain pipes from process start. Never wait for a child while holding the state lock or
  on the UI event loop; every child handle has exactly one reaping owner.
- Keep shell commands shallow and origin-guarded. Host approval happens in the child; frontend
  transitions remain in the TypeScript state owner.
- Use fake processes/clocks only for deterministic branches and one real child for the integration
  boundary. A fake cannot prove OS reaping, inherited-channel closure, listener cleanup, or actual
  navigation readiness.
- Preserve unrelated changes, use `apply_patch`, short one-line commits, and no coauthor tags.

## Completion definition

The goal is complete only when the stable `zd serve` mode and desktop wrapper launch the same
executable/server contract; Tauri supervises exactly one child, privately bootstraps one webview,
retains only exact-origin client-shell authority, has no registered host-operation fallback, handles
reload/secondary launch/crash/close without duplication or orphans, and all direct-browser, native,
and repository gates are green.

If exact executable parity cannot coexist with bounded private readiness, cross-platform reaping,
dynamic-origin shell scoping, or current trusted-open behavior, stop and report. Do not substitute an
in-process server or leave old invoke authority enabled to make the wrapper demo pass; goal 05 must
package a literal wrapper rather than a second backend.
