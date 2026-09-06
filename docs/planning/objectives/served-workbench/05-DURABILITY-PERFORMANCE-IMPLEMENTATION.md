# Implementation plan: make zd a durable, responsive terminal workbench

Date: 2026-09-05

Status: **Provisional; blocked on the audit and its revision of this plan.** No implementation is
authorized by the current planning request. The work packets below are candidate goal boundaries,
not a claim that each area needs a rewrite.

## Outcome and prerequisites

Make `zd serve` the browser connection to a machine's continuing agent work. A browser or gateway
failure must not end that work. Reopening zd must recover the actual sessions, and terminal input
must meet measured latency limits under foreground and background load. Tauri remains a wrapper
around the same server, filesystem, Git, watcher, and terminal implementations.

Start only after the [audit plan](04-DURABILITY-PERFORMANCE-AUDIT.md) has produced its reports and
updated this plan. It must supply finding IDs, a reproducible baseline, agreed measurement methods,
chosen changes, and a complete coverage matrix. Existing
[release goal 05](goals/execute-goal-05.md) remains open on its own evidence requirements; this plan
does not declare it complete or require a release before corrective source work can begin.

Needed from the owner: nothing to write this plan. Before implementation, resolve any audit-raised
change to accepted architecture or product scope. Unmeasured bottlenecks and unavailable platform
evidence cannot be converted into assumptions of success.

## Lifecycle contract

Use the existing keeper architecture in
[ADR 0010](../../../adr/suite/0010-keep-terminal-sessions-below-server-lifetime_H.md). “Like tmux” is
the behavior target, not a decision to add tmux as a mandatory dependency.

```text
Browser or Tauri shell             replaceable presentation and connection
          │
       zd serve                   restartable HTTP/WebSocket gateway
          │ private same-user IPC
    terminal keeper               live session authority, PTY handles, bounded output
          ├── terminal A ── shell / agent and its descendants
          └── terminal B ── shell / agent and its descendants

Host-owned durable records        session identity and project/thread relationships
                                  independent of browser origin and server PID
```

- Refresh, detach, connection loss, server crash/restart, and wrapper quit leave existing processes
  alive. An idle-client timeout is not a terminal termination policy.
- Reattach by stable session identity and keeper generation, not current scope, list position, a
  stale runtime handle, or PID alone. Distinguish disconnected, live, exited, lost, and explicitly
  closed states. Never auto-spawn a replacement and label it restored.
- Natural exit preserves an exited record and retained output. Explicit terminal close terminates
  its owned process tree and persists closure. Removing a project or closing presentation is not
  implicit permission to terminate work.
- Keeper crash, OS reboot, and OS policies that terminate the user's processes are outside the live
  process survival guarantee. Keep recoverable metadata, mark loss, and offer explicit restart.
  Define bounded transcript/screen retention separately; this is not unlimited logging or checkpointing
  arbitrary agent memory.
- A compatible gateway upgrade reconnects without restarting the keeper. Incompatibility must fail
  without killing live terminals; the audit must select a versioning and migration policy.

“All agent work” initially means zd-managed terminal threads and project terminals across approved
projects for the same OS user. The session catalog must recover managed work even if a browser record
was never saved. Attaching arbitrary processes started outside zd is a separate capability: an
existing PID alone does not supply a usable terminal attachment. Do not imply automatic adoption.

Preserve the frontend's single workbench-transition owner. The keeper supplies live process truth;
host-owned durable records preserve identities and relationships; the frontend owns presentation
transitions. The audit must resolve disagreements at these boundaries without adding competing owners.

## Candidate performance gates

These are proposed acceptance targets, **not measurements or current guarantees**. The audit must
record reference hardware, workloads, instrumentation error, and final gates before implementation.
Any change to a target needs a documented reason; a slower result alone does not justify relaxing it.

| Measure | Candidate gate on the reference workload |
| --- | --- |
| Browser input event to WebSocket send | p95 ≤ 8 ms; p99 ≤ 16 ms |
| Input event to visible deterministic child echo | p95 ≤ measured RTT + 30 ms; p99 ≤ RTT + 60 ms |
| Warm switch to an already attached terminal | p95 ≤ 100 ms, without losing keystrokes or viewport |
| Reattach after gateway is ready and reachable | p95 ≤ 2 seconds + two RTTs; no replacement process |
| Foreground output under load | Sustain ≥ 2 MiB/s for the audit's ANSI fixture while meeting input gates |
| Idle resource use | Mean ≤ 1% of one CPU core per zd process role over 60 seconds; no continuous UI repaint |
| Memory and retained output | Explicit per-session and total caps; settled memory stays within 10% of the warmed baseline after ten fixed-size attach/output/detach cycles |

Use both one terminal and foreground typing with seven busy background terminals. Record the 32-live
terminal stress profile separately with its own audit-fixed limits. Run typing gates at controlled
0/40/100/200 ms RTT without loss; report jitter/loss behavior separately and require bounded recovery,
no duplicate input, and no unbounded queues. Measure real remote routes separately from those profiles.
Report child execution delay instead of attributing a slow agent response to zd.

The audit must set absolute memory, scrollback, replay, and queue caps as well as the relative memory
gate. A high starting footprint cannot pass merely because it stays high. Keep renderer-only
fixtures, but do not use their broad ceilings as proof of end-to-end terminal responsiveness.

## Ordered implementation packets

After the audit, cut bounded `goals/execute-goal-NN.md` contracts using the next available numbers.
Each contract must carry its finding IDs, prerequisites, file ownership, failing regression evidence,
acceptance gates, and completion condition. Do not renumber existing goals. Skip a packet's runtime
changes when the audit proves its contract already holds; retain its verification requirements.

### I1. Lock the failures and measurements into executable regressions

Depends on: completed audit and revised plan.

Owns: `packages/app/tests/served/`, applicable existing unit/integration suites, performance fixtures,
and Playwright configuration where collection or browser coverage needs correction.

Turn audit reproductions into collected tests. Run each bug regression against the pre-fix revision
and record the relevant failure, then make it a required check for the owning fix. Preserve the
release-build baseline and network profiles. Build isolated keeper/process ownership into lifecycle
tests before adding crash cases. Do not commit a deliberately failing default suite between goals;
land red-to-green evidence with the corresponding fix or keep the audit reproduction documented.

Exit evidence: tests exercise real host paths, can detect the original symptom, and cannot terminate
unrelated processes. Input tests compare exact bytes; recovery tests compare live process identity.
Performance measurements identify the leg being measured and use fixed workloads and thresholds.

### I2. Make live sessions discoverable below the gateway lifetime

Depends on: I1's lifecycle harness and the audit's chosen catalog/versioning policy.

Owns: `packages/host/src/terminal/`, host persistence, server lifecycle, and wrapper supervision.

Address confirmed failures in keeper detachment, singleton startup, private socket permissions,
stable session catalog, crash-consistent metadata, and reattachment discovery. Cover both thread
terminals and project-terminal splits. Reconcile a live session whose create acknowledgement or
frontend save was lost; do not leave inaccessible processes or create duplicates on retry.

Define atomic creation/closure records, idempotent operation identities, closed-session tombstone
retention, keeper generation, and schema compatibility only as required by the audited failure cases.
Bound metadata and exited-session retention without expiring live processes. Distinguish transport
unavailability from confirmed process loss. Preserve live processes during incompatible upgrades.

Exit evidence: the audit's crash matrix passes for unchanged process identity and continued work;
multiple gateway launches do not create conflicting authorities; explicit close is targeted and
durable; keeper loss is visible and never triggers silent replacement.

### I3. Restore terminal state and make reconnect input safe

Depends on: I2's identity and lifecycle contract.

Owns: host terminal output/IPC, `packages/server/src/protocol.rs`, server session/controller logic,
`packages/app/src/platform/served*.ts`, and terminal session/emulator restoration.

Implement the audit-selected output cursor, replay, and screen-restoration design. Define ordering,
acknowledgement, truncation, replay-to-live transition, resize, and stale-generation rejection. A raw
suffix of escape sequences is not automatically a valid screen snapshot. Test alternate-screen
programs, cursor/input modes, split Unicode/ANSI sequences, and resize during reconnect.

Give terminal input one ordered path. Prevent old controllers and uncertain reconnect retries from
repeating commands. If acknowledged input is retried, deduplication must live with the surviving
keeper, not only in the gateway that can crash. If delivery is ambiguous and deduplication cannot
resolve it, report uncertainty and do not resend silently. Bound pending paste/input and visibly
disable disconnected input instead of collecting hidden commands to execute later.

Exit evidence: exact bytes arrive once and in order for the supported retry contract; the restored
screen matches the live session; stale snapshots/controllers cannot overwrite current truth; large
detached output stays bounded and reports truncation.

### I4. Remove the measured latency causes

Depends on: I1's baseline and I3's stable transport/replay contract.

Owns: only the host, IPC, server, browser transport, or terminal-rendering paths implicated by audit
traces. Serialize protocol changes with I2/I3; do not develop incompatible encodings in parallel.

Run one controlled change at a time against the same baseline. Candidate investigations include
polling delay, connection setup, lock contention, queue head-of-line blocking, batching, serialization,
unnecessary DOM work, and inactive-terminal output consumption. Select changes from measured cost,
not from the appeal of a binary protocol or a different renderer.

Preserve input ordering while keeping bulk output and file/Git work from delaying interactive input.
Drain bounded output without blocking a child indefinitely merely because no browser is attached.
Define slow-consumer overflow behavior, fair scheduling, and memory bounds. Do not mask network
latency with unconditional local echo: password input, shell editing, and fullscreen apps must remain
correct. Any predictive echo would require separate evidence and an explicit design decision.

Exit evidence: audit-fixed input, output, reconnect, CPU, and memory gates pass in production builds,
including background load. Show before/after distributions and costs per process role, not only an
average or a renderer microbenchmark. Durability and byte-correctness tests remain green.

### I5. Close the audited feature failures

Depends on: I1 reproductions; session-related fixes also depend on I2/I3. Independent UI fixes may
land earlier when they do not compete for shared files. P0/P1 findings take priority over cosmetic work.

Owns: finding-specific file-tree, picker, editor, workbench, connection, terminal-view, and shell files.

Use the audit's matrix as the work list. It must explicitly account for prior reports: left-click
file/folder activation despite working right-click; watcher races; picker overflow and scrolling;
remote project selection; persistent banners; remembered credentials and stale-controller rejection;
repeated pasted terminal input; and misleading “no longer attached” state. These reports require
verification, not an assumption that they still fail or that prior fixes resolved every variant.

Exit evidence: each accepted finding has a red-to-green regression or documented pre-existing pass,
plus the actual user-visible outcome on a real host. Cover keyboard/focus behavior and browser/Tauri
parity. No browser-specific filesystem or terminal backend is introduced to make a test pass.

### I6. Prove the integrated result and document the limits

Depends on: accepted fixes from I2–I5 and resolved architecture decisions.

Owns: existing integration/release suites, package smoke checks, bounded diagnostic evidence, objective
summaries, and documentation updates supported by the results.

Run an eight-hour isolated soak with multiple projects, 32 sessions, foreground interaction,
background output, repeated reconnect, and ten gateway restarts. Preserve known process identities,
input sequence checks, output bounds, and resource samples. Run native Linux/macOS installed
lifecycle checks and browser coverage separately. Keep diagnostic capture opt-in, bounded, and free
of prompts, transcripts, credentials, and private paths.

Required commands, using the audited environment and any registered additions:

```sh
npm run check
npm run test:e2e
npm run test:e2e:served
npm run test:e2e:release
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

Run the applicable `package:linux` / `smoke:linux` and `package:macos` / `smoke:macos` npm scripts on
their native environments. The current release fixture command is not sufficient unless the new
real-host performance coverage is also registered and run. An unavailable platform remains an open
gate. Coordinate shared release files with existing goal 05; do not publish a release without a
separate request.

Exit evidence: all mandatory gates pass, no unresolved P0/P1 findings remain in scope, lower-priority
deferrals have explicit rationale, and the finding register links fixes to tests and measurements.
Reconcile outdated lifecycle instructions through the appropriate documentation/decision workflow;
do not silently edit human-owned ADRs. Document live-process survival limits, reconnect behavior,
explicit termination, retention bounds, and how to locate a slow interaction.

## Audit revision and implementation readiness

The audit must replace the pending entries below before this plan becomes executable. It may split,
merge, reorder, or remove candidate packets based on evidence while preserving the required outcomes.

| Required audit handoff | Current state |
| --- | --- |
| Finding register and complete capability/platform matrix | Pending; audit not run |
| Durability failures, session catalog, ownership, and upgrade policy | Pending |
| Screen restoration and input retry/controller contract | Pending |
| Attributed latency baseline, memory caps, and final performance gates | Pending |
| Finding-to-packet mapping, exact file ownership, tests, and dependencies | Pending |
| Owner decisions, explicit deferrals, and native evidence availability | Pending |

Record the audit revision date, source revision, evidence links, and remaining blockers here. Do not
mark this table ready because reports exist if measurements or decisions are still missing.

## Constraints and completion definition

Follow [GOOD_ENGINEERING_H.md](../../../GOOD_ENGINEERING_H.md) and repository test rules. Add a failing
test before a reported bug fix; change one measured cause at a time; preserve unrelated work; use
short incremental commits without coauthor tags. Keep one host backend and narrow typed boundaries.

Do not add Windows support, a cloud account service, public-Internet hosting, multi-user collaboration,
an SSH client, arbitrary-process adoption, a new agent scheduler, unlimited transcripts, or OS-reboot
process resurrection. Replacing the keeper with an external multiplexer is not the default; an audit
recommendation for that change requires an explicit decision and migration plan first.

This work is complete only when managed sessions survive the specified presentation/gateway failures,
the same work is discoverable and attachable, terminal correctness and measured performance gates
pass, accepted feature findings are closed, and required browser/native evidence and documentation
are present. A green mocked suite or a new shell with the old thread name cannot satisfy that outcome.
