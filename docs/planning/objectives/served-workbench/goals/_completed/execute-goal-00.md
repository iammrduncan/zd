# Execute goal 00: Open a real project read-only through a served zd host

## Prerequisites

- [ADR 0008](../../../../../adr/suite/0008-serve-one-host-backend-to-browser-and-desktop-clients_H.md),
  [`VISION.md`](../../../../../VISION.md), and [`DESIGN.md`](../../../../../DESIGN.md) are the authority for
  one host backend and separate client-shell behavior.
- The current Rust grant, bounded file-read, and file-tree tests must be green before extraction.
- This goal owns the shared platform boundary, Rust host/server composition, root build metadata, and
  real-host browser harness. Do not execute another transport, Cargo-layout, or `platform.ts` goal at
  the same time.
- The owner may review and merge this goal independently. It is a read-only walking skeleton and is
  not a released remote-workbench claim.

### Needed from the owner before starting

Nothing. This goal can start as written. The owner has already selected one served backend, browser
access, and a Tauri wrapper as the destination; later mutation, terminal, wrapper, and packaging
decisions are outside this goal.

## `/goal` objective

This goal delivers work packet 0 from
[`02-DELIVERY-PLAN.md:7-25`](../../02-DELIVERY-PLAN.md#work-packet-0-read-only-served-host-walking-skeleton).

Produce the smallest real end-to-end proof that the current TypeScript workbench can use a
Tauri-free Rust host through a secure loopback protocol. A person must be able to approve one folder
from the developer command, unlock the served page, browse its real file tree, and open one bounded
text file. Later file mutation, Git, PTY, persistence, Tauri cutover, and release work depend on the
host and protocol boundaries proved here.

## Required outcome

When the work is complete, the repository must have:

1. a public Tauri-free Rust host library under `packages/host/` that owns startup grant approval,
   grant-scoped file-tree snapshots, and bounded text reads, extracted from the current native logic
   without a second implementation;
2. a development served-host entry point under `packages/server/`, runnable as
   `npm run app:serve -- <folder>`, which builds/serves the current `packages/app` output, binds
   `127.0.0.1:0`, retains the bound listener, and prints the URL and process secret separately only
   after routes are ready;
3. one versioned WebSocket protocol with closed authentication, request, response, and error
   envelopes for session description, startup grant listing, file-tree snapshot, and bounded file
   read—no browser-supplied arbitrary path, root, command, executable, argv, or environment field;
   the session description advertises a closed read-only capability manifest;
4. a frontend `WorkbenchHost` and `ClientShell` composition below
   `packages/app/src/platform.ts`, plus a served-host adapter that boots the existing workbench with
   the startup grant, forces every successful served text result to `writable: false`, and reports
   every non-read-only capability as unavailable;
5. one controller unlock flow that authenticates in the first WebSocket frame, keeps the accepted
   process secret out of cookies, URLs, `localStorage`, diagnostics, and ordinary application logs,
   and sends no project state before success;
6. protocol timing that returns the same request ID with bounded host queue/handler durations while
   the client records its own round trip; and
7. a real browser-to-Rust test target that uses a temporary approved root, renders its file tree,
   opens a known UTF-8 file, and does not use the in-memory workbench fixture for host behavior.

## In scope

- **Rust host extraction.** Owns new `packages/host/` files and the corresponding grant, file-tree,
  and bounded-read code currently under `packages/tauri/src/`. The current Tauri handlers for these
  operations must call the extracted host library; copying code into the new crate is not complete.
- **Served-host adapter.** Owns new `packages/server/` files, required Cargo workspace/build metadata,
  `package.json`/lock changes, and an `app:serve` developer script. HTTP may serve only the built
  application and a state-free readiness response. Project files are never HTTP assets.
- **Protocol contract.** Owns a versioned schema and cross-language contract fixtures. The initial
  method set is exactly session description, startup grant list, file-tree snapshot, and bounded
  file read. Session description declares the read-only capabilities; the browser cannot infer or
  request more. Use one authenticated WebSocket, one active controller, bounded
  frames/messages/pending requests, numeric-loopback Host and exact same-authority Origin checks,
  ignored forwarding headers, no CORS permission, and a restrictive application CSP.
  For this developer-only slice, an authenticated grant response may preserve the current canonical
  root needed by the workbench. Requests still use IDs and relative paths, and the root must never
  appear before authentication, in diagnostics, or in ordinary logs. Remote path presentation
  remains a later privacy decision.
- **Frontend boundary.** Owns `packages/app/src/platform.ts` and narrowly named modules under
  `packages/app/src/platform/` if extraction is needed. Separate host operations from browser/Tauri
  shell operations without changing feature-owned adapters or creating another workbench state
  owner.
- **Evidence.** Owns focused Rust tests, frontend unit/contract tests, and a Playwright configuration
  or project that starts the real served host against a generated temporary project. Test setup must
  receive the secret through a private process channel or test-only in-memory handle, not a URL.
- **Documentation.** Update developer-facing architecture/how-to documentation only enough to run
  the experimental developer target. Do not edit released user documentation or claim the final
  `zd serve` command is packaged.

## Required tests and evidence

At minimum, prove:

- an existing directory is canonicalized and approved before the server begins accepting privileged
  messages; a missing file, non-directory root, parent traversal, absolute target, symlink escape,
  or mismatched project ID is refused by the shared host boundary;
- binding port zero returns the still-owned listener's actual loopback port, and no probe-then-bind
  sequence exists;
- a WebSocket upgrade with a missing Origin, `null` Origin, foreign Origin, non-loopback or malformed
  Host, or spoofed forwarding header, plus a socket with a wrong secret, an operation before
  authentication, an oversized frame/message, an unknown field, an unknown method, or a second
  controller, all fail with bounded behavior and disclose no grant or path;
- a matching numeric-loopback Host and Origin remain valid when their request port differs from the
  listener's bound port, which proves the SSH-forwarding authority rule without requiring SSH in the
  protocol test;
- a workspace file named like an application asset cannot be fetched through HTTP, executable
  workspace HTML/SVG/JavaScript is never served at the application origin, and responses include the
  specified CSP plus correct cache/MIME behavior;
- a request ID is unchanged across request/response, host queue and handler durations are
  non-negative bounded integers, and client code never subtracts client and host wall clocks;
- the real-host browser test displays a file from the temporary root in a non-editable buffer, does
  not create a local draft, and visibly refuses save, Git, watcher, terminal, picker,
  recent-workspace, and arbitrary-root operations;
- current Tauri launch, grant, file-tree, and bounded-read tests still pass through the shared Rust
  implementation;
- `npm run check`, the focused real-host Playwright target, all host/server/Tauri Cargo tests,
  `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `git diff --check` are green;
  and
- committed evidence records the exact developer command, browser URL shape without a credential,
  test counts, and any selected resource-limit constants.

## Explicit non-goals

- Do not write, create, rename, move, trash, or watch project files.
- Do not expose Git, worktrees, terminals, diagnostics storage, custom themes, workspaces, pickers, or
  recent-project recovery through the socket.
- Do not modify the default Tauri launch path, navigate its webview to the served host, or remove
  Tauri commands in this goal.
- Do not add or migrate durable drafts, reviews, preferences, workbench snapshots, credentials, or
  sessions. Existing origin-scoped preferences remain experimental and do not satisfy recovery.
- Do not implement reconnect replay, PTY reattachment, multi-client access, controller takeover, or
  collaboration.
- Do not add `--host`, `0.0.0.0`, LAN/public listening, TLS certificates, proxy headers, Tailscale
  identity, CORS allowlists, or product-managed SSH.
- Do not add HTTP mutation/RPC routes, cookies, query/fragment credentials, or one route per existing
  Tauri command.
- Do not promise Vite HMR, an installed `zd serve` command, Windows/Linux packaging, or released
  remote-workbench behavior.
- Do not weaken existing grant/path tests to make extraction easier, and do not keep copied Tauri and
  host implementations after the change.

## Engineering constraints

- Follow the repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../../GOOD_ENGINEERING_H.md),
  and [`DESIGN.md`](../../../../../DESIGN.md). Add tests with every code change and write a failing
  regression test before fixing any error discovered during execution.
- Keep `packages/app/src/platform.ts` as the only production Tauri import boundary. Product modules
  must not import WebSocket, server URLs, or Tauri APIs directly.
- Keep the host service Tauri-free. Do not make a network handler the owner of grants or filesystem
  validation.
- Treat message schemas, secrets, limits, and CSP as security boundaries. Use reviewed random and
  constant-time comparison facilities; do not invent cryptography.
- Keep diagnostics content-free. Stable method IDs, request IDs, outcomes, durations, and byte-count
  buckets are sufficient.
- Preserve unrelated worktree changes. Make short one-line commits for independently green slices
  and do not add coauthor tags.
- Do not add standalone temporary tests or checked-in runtime fixtures; extend the repository's unit,
  integration, and Playwright suites.

## Completion definition

The goal is complete only when one developer command starts a loopback-only, authenticated,
read-only host for a supplied temporary project; a real browser unlocks it and opens a real bounded
text file; both sides expose correlated timing; security and path-negative tests pass; existing
Tauri behavior still uses the extracted Rust core without regression; all required checks are green;
and no write, terminal, persistence, Tauri-wrapper, or release claim entered the change.

If the work cannot boot the real workbench without adding mutation, durable random-origin state,
non-loopback access, a generic command/root field, duplicated Rust authority, or a default Tauri
cutover, stop and report the exact conflict. Do not pull a later work packet into this goal to make a
demo appear complete. Packets 1–4 depend on this being a narrow, trustworthy boundary rather than a
partial remote product.
