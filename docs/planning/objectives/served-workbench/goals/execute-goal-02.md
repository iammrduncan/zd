# Execute goal 02: Edit files and inspect Git through the one host

## Prerequisites

- [Execute goal 01](_completed/execute-goal-01.md) is complete. This goal needs stable project/worktree IDs,
  scoped durable records, different-port recovery, and green full-repository gates before a served
  client may write.
- [Execute goal 00](_completed/execute-goal-00.md) supplies the closed authenticated request path,
  shared read boundary, timing, and real browser harness. ADR 0009 supersedes that goal's
  loopback-only transport assumption.
- The owner may release this goal only as an experimental served target. Watchers, terminals, Tauri
  wrapper cutover, and packaged artifacts remain unavailable.
- This goal is serialized with goals 01 and 03–05 because it owns the shared host, protocol,
  platform composition, Cargo metadata, and served-browser integration files.

### Needed from the owner before starting

Nothing. This goal can start as written. The existing file, Git, worktree, theme, and diagnostic
contracts define the behavior; the goal changes their authority path rather than inventing another
product surface.

## `/goal` objective

This goal delivers the capability half of work packet 1 from
[`02-DELIVERY-PLAN.md:29-41`](../02-DELIVERY-PLAN.md#work-packet-1-durable-file-and-git-authority).

Move every non-streaming host operation needed by the current workbench below `HostService`, expose
it through the closed socket, and enable the existing browser workbench to edit safely. Tauri may
retain temporary command wrappers, but those wrappers must invoke the same Tauri-free implementation.
Served editing is complete only when drafts/reviews survive a new process and port through goal 01's
store.

## Required outcome

When the work is complete, the repository must have:

1. cohesive Tauri-free host modules for workspace listings, atomic text writes, file stamps,
   validated project-image reads, bounded clipboard-image writes, file-tree create/rename/copy/move/
   trash operations, Git status/history/comparison/diff, structured worktree creation, validated
   theme discovery, and host diagnostics;
2. `HostService` methods that resolve every operation through active project/worktree grants and
   accept only stable IDs, relative paths, closed Git revisions, fixed worktree fields, validated
   theme data, or closed diagnostic records—never an arbitrary root, executable, argument list,
   environment, or Git command;
3. thin Tauri commands for migrated operations that call `zd-host` and retain the existing visible
   behavior while the desktop still uses its temporary in-process adapter;
4. a versioned protocol capability manifest that marks file read/write, file mutation, Git,
   worktrees, durable state, theme files, and host diagnostics accurately, while picker, arbitrary
   roots, file watches, terminals, and client-local shell behavior remain unavailable;
5. exact closed protocol methods `workspaceFiles.list`, `file.writeText`, `file.stamp`,
   `fileTree.mutate`, `image.readProject`, `image.saveClipboard`, `git.status`, `git.history`,
   `git.compare`, `git.diff`, `worktree.create`, `theme.list`, `diagnostics.status`,
   `diagnostics.enable`, `diagnostics.disable`, and `diagnostics.record`, in addition to the methods
   proven by goals 00–01;
6. bounded transfer encoding for text and raster payloads that preserves the existing 8 MiB editable
   text, 16 MiB project image, and 16 MiB clipboard image limits without representing image bytes as
   an unbounded JSON number array; both client and server enforce the selected aggregate message
   bound before allocation;
7. a served `WorkbenchHost` adapter that uses those methods behind the existing feature interfaces,
   returns the real filesystem writability state, enables save/reconcile/drafts/reviews, supplies the
   existing Git/Changes UI, and does not leak WebSocket or method names into feature modules;
8. host-side Git and filesystem work dispatched away from the async socket executor, with the
   existing operation timeouts/output limits, bounded concurrent work, cancellation-safe responses,
   and request timing that separates queue, dispatch/operation, and serialization where observable;
9. authenticated approved-root presentation that is consistent for remote use: approved canonical
   paths may be shown to the one controller where the existing UI requires them, but never appear
   before authentication, in readiness, ordinary logs, diagnostics, or refusal text; and
10. real browser evidence that edits and saves a temporary file, survives a restart with an unsaved
    draft and review, performs representative tree and clipboard-image mutations, renders real Git
    status/history/diff, loads a validated host theme, and exercises diagnostics without a Tauri
    runtime or in-memory host fixture; and
11. direct remote-host behavior where the default listener accepts a browser through a non-loopback
    host address, an optional numeric bind restricts that listener, exact same-authority Host and
    Origin checks still reject cross-origin and forwarded requests, and the client runs no tunnel,
    helper, extension, or native application.

## In scope

- **File authority.** Owns `packages/tauri/src/fs.rs`, `fs/mutations.rs`,
  `clipboard_images.rs`, and corresponding extraction into `packages/host/src/`. Preserve existing
  atomic-save, symlink, `.git`, Trash/Recycle Bin, image-signature, permission, and path tests.
- **Git and worktrees.** Owns `packages/tauri/src/git/`, `git.rs`, `worktrees.rs`, shared process
  helpers, and their host replacements. Keep fixed command construction, `--` path boundaries,
  disabled hooks for worktree creation, output caps, and timeouts.
- **Host configuration.** Owns theme discovery and diagnostics implementation below the host. Native
  reveal/open behavior stays in `ClientShell`; a remote browser may inspect status but does not ask
  the remote host to open a local file manager.
- **Protocol and client.** Owns `packages/server/src/cli.rs`, `server.rs`, `protocol.rs`, listener and
  resource bounds, `packages/app/src/platform/served*.ts`, `composition.ts`, `platform.ts`, and
  closed contract tests.
- **Feature integration.** Owns only the narrow app files needed to remove read-only served refusals
  and connect existing editing, Files/Changes, review, image, theme, and diagnostic behavior. Do not
  fork feature controllers for remote use.
- **Evidence.** Extends existing host/server/Tauri suites and the single real served Playwright
  project. Temporary Git/config/state roots belong to fixtures and are removed after the run.
- **Serialization.** Goals 03–05 wait because they share the same host/protocol/platform integration
  points.

## Required tests and evidence

At minimum, prove:

- every extracted Tauri command and socket method reaches the same host function; deleting or
  breaking that shared function fails both adapter suites, and no duplicate filesystem/Git
  implementation remains under Tauri;
- text saves remain atomic, preserve existing permissions, do not mark a buffer clean before host
  confirmation, refuse stale external stamps through the existing reconciliation flow, and cannot
  traverse, use absolute targets, cross grants, follow a symlink escape, or modify protected `.git`;
- file-tree create, rename, copy, move, and Trash/Recycle Bin retain their current collision and
  dirty-draft guards, update open-file/draft identities only after success, and leave no partial copy
  when a nested symlink or I/O error is encountered;
- image reads accept only signature-matched PNG/JPEG/GIF/WebP below active grants; clipboard writes
  accept the same closed media set, stay below `docs/screenshots`, install one unique file atomically,
  and leave the editor unchanged on refusal;
- Git requests use an active grant and fixed operations, retain the current 50,000-entry status/
  comparison caps, 200-commit page and 10,000-commit traversal bound, full commit validation,
  timeouts, output truncation, rename handling, linked-worktree prefixing, and content-free errors;
- worktree creation accepts only one bounded portable name/branch/base revision, derives its sibling
  destination, disables hooks, refuses collisions/locks/non-repositories, and persists the new
  worktree's stable grant identity before reporting success;
- custom themes are direct bounded `*.theme.config` files from the host configuration directory,
  reject symlinks/nesting/oversize/invalid data, and cannot execute code or widen capabilities;
- diagnostics remain off by default, create no files or sampler while disabled, retain their current
  rotation/size/privacy bounds when enabled, and record request IDs/timing classes without source,
  terminal, preference, path, credential, or raw-error content;
- protocol decoding rejects unknown fields/methods, invalid enums/IDs/revisions, oversized encoded
  payloads, encoding/type mismatches, and requests for watcher/terminal/picker/root authority; an
  expensive operation never blocks the async readiness endpoint or bypasses pending-work bounds;
- a real Chromium session types and saves through Rust, observes the changed disk bytes, creates no
  draft after confirmed save, then restores one deliberately unsaved draft and review after a new
  server process on a different port;
- that same real session sees an actual temporary Git change and bounded diff/history, completes at
  least create/rename and clipboard-image flows, loads one temporary valid theme, and still receives
  `404` when requesting any project file as an HTTP asset;
- local/session browser storage and request/console/cookie logs contain neither durable content nor
  the process secret, and authenticated path display never appears in pre-auth or diagnostic output;
- the default server binds all IPv4 interfaces on one OS-assigned port, a configured numeric bind
  can restrict it to loopback or one host interface, and real Chromium unlocks through a direct
  non-loopback URL without client-side forwarding;
- direct WebSocket access accepts only an exact same-authority HTTP Origin and Host with a port,
  while missing/foreign origins, malformed authorities, proxy forwarding headers, and unauthenticated
  requests remain closed;
- all existing frontend/Tauri behavior and goal 00/01 security/restart evidence remain green; and
- `npm run check`, normal and served Playwright targets, `cargo test --workspace`,
  `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and
  `git diff --check` pass with exact counts and selected transfer/concurrency bounds recorded.

## Explicit non-goals

- Do not add file watchers, WebSocket events, PTYs, heartbeat, reconnect replay, or controller grace;
  goal 03 owns streaming lifecycle.
- Do not change the Tauri webview origin, spawn a server child, retire native commands, or claim that
  Tauri is already a literal wrapper; goal 04 owns that cutover.
- Do not expose arbitrary Git commands, shell commands, roots, paths outside a grant, executable
  project content, generic upload/download endpoints, or a route per Tauri command.
- Do not weaken the 8 MiB text or 16 MiB image product limits merely to fit the transport. Choose a
  bounded encoding and test its worst-case serialized size.
- Do not turn diagnostics reveal, desktop notifications, external-link opening, picker dialogs,
  global shortcuts, or window focus into remote-host actions.
- Do not add background polling to replace watchers or Git events.
- Do not publish released user documentation or package an installed command.
- Do not add public-Internet exposure, TLS certificate management, trusted proxy headers, a hosted
  relay, or network-specific Tailscale integration. The direct listener stays transport-agnostic.

## Engineering constraints

- Follow repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md),
  [`DESIGN.md`](../../../../DESIGN.md), and ADR 0009. Write the failing boundary/regression test
  before moving each implementation and keep every commit independently green.
- Move deep modules with their tests and preserve history where practical. Tauri wrappers may adapt
  framework state, but must not reimplement validation, command construction, or filesystem work.
- Keep `packages/app/src/platform.ts` as the sole production Tauri import boundary and keep transport
  types below `WorkbenchHost`; feature-owned adapters remain product-oriented.
- Keep blocking filesystem/Git work outside Tokio executor threads. Bound jobs, bytes, results, and
  elapsed time; one controller does not justify unbounded memory or process fan-out.
- Treat every new wire type, base64/binary decoder, path, revision, state transition, and capability
  as hostile input. Use established encoders and constant-time secret handling; do not invent
  cryptography.
- Preserve unrelated dirty changes, use `apply_patch`, make short one-line commits, and add no
  coauthor tags.

## Completion definition

The goal is complete only when a remote browser connects directly without client-side setup and the
real served workbench edits, saves, mutates, reviews, renders images/themes, inspects Git, creates
structured worktrees, and records opt-in host diagnostics through the same grant-scoped Rust
implementations used by temporary Tauri wrappers; durable work survives a new origin/process; every
payload and blocking job is bounded; every excluded streaming/shell capability is still closed; and
all required gates pass.

If the implementation needs a generic file/Git/upload method, duplicates Tauri authority, exposes an
unapproved or pre-auth path, stores recoverable work in browser-origin storage, runs unbounded
blocking work on the socket executor, or trusts a public proxy/network without a new decision, stop
and report. Do not pull watchers, PTYs, or wrapper lifecycle forward to make the editing demo appear
complete.
