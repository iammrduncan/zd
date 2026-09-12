# Implementation plan: make zd a durable, responsive terminal workbench

Date: 2026-09-05 · **Audit revision: 2026-09-12**

Status: **Revised by the executed audit.** The packets below are no longer hypotheses: each cites
finding IDs from [the reliability audit](research/04-terminal-reliability-audit.md), the measured
baseline in [the performance report](research/05-terminal-performance-baseline.md), and the
coverage matrix in [report 06](research/06-feature-coverage-matrix.md). Source revision audited:
`032daf2` (code: `c42128b`), Linux x86_64, debug + release `zd-serve`. Remaining open evidence:
native macOS and Firefox/WebKit browser runs — recorded gaps, not passes.

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

## Performance gates — audit-fixed

Measured reference: `target/release/zd-serve` on `mbox01-MINI-S` (Linux 7.0.0-31-generic x86_64),
protocol-level harness, 1000 samples per injected-RTT condition, monotonic clock plus server-side
`queueMicros`/`handlerMicros`/`serializationMicros`. Raw evidence:
`/tmp/zd-audit/evidence/a3-latency-*.ndjson` and `a3-resources-*.ndjson`. Full numbers in
[report 05](research/05-terminal-performance-baseline.md).

Measured starting points that constrain the gates:

- Real op cost is sub-millisecond: `handlerMicros` p50 ≈ 0.7 ms at 200 ms spacing. The ~9–10 ms
  seen at loopback is keeper-mutex contention with the 16 ms snapshot pump, measured inside the
  handler (F-06). Sustained sibling output inflates every op by ~30 ms; busy `read` adds payload
  transfer (~120 ms p50).
- Output delivery costs **a second RTT** (`outputReady` carries no bytes, F-07).
- Idle CPU on release: `zd-serve` ~0.3%, keeper ~0.65% of one core — both under the 1% gate.
- Bounded retention verified: 8.6 MiB written → exactly 4 MiB retained, `droppedBefore` reported;
  `zd-serve` RSS ~28 MiB after bursts, flat across attach/detach cycles.

| Measure | Fixed gate on the reference workload |
| --- | --- |
| Browser input event to WebSocket send | p95 ≤ 8 ms; p99 ≤ 16 ms (unchanged) |
| Input event to visible deterministic child echo | p95 ≤ RTT + 30 ms; p99 ≤ RTT + 60 ms — **blocked until F-07 lands** (today ≈ 2×RTT + ~10 ms + ≤16 ms pump) |
| Quiet `terminal.write`/`read`/`pollExit` at 0 ms injected | p50 ≤ 12 ms, p99 ≤ 45 ms (matches measured quiet baseline) |
| Busy-session op inflation | p50 ≤ quiet + 5 ms for `write`/`pollExit` under a continuous-output sibling (today ~+30 ms; F-06 gate) |
| Warm switch to an already attached terminal | p95 ≤ 100 ms, without losing keystrokes or viewport |
| Reattach after gateway ready | p95 ≤ 2 s + two RTTs — **passes today** (measured well under bound) |
| Foreground output under load | ≥ 2 MiB/s sustained — passes for throughput; input gates under load are the open half (F-06) |
| Idle resource use | ≤ 1% of one core per process role over 60 s — **passes on release**: serve ~0.3%, keeper ~0.65% (debug build reads higher; not the gate's subject) |
| Memory | settled within 10% of warmed baseline across 10 attach/output/detach cycles — **passes today**; absolute caps already explicit (4 MiB/session, 16 MiB hard, 32 MiB keeper reply) |

The jitter/loss profile and the tailnet route are reported separately in report 05; the harness's
user-space relay does not model TCP loss recovery, so loss behavior is stress evidence only.

## Ordered implementation packets

After the audit, cut bounded `goals/execute-goal-NN.md` contracts using the next available numbers.
Each contract must carry its finding IDs, prerequisites, file ownership, failing regression evidence,
acceptance gates, and completion condition. Do not renumber existing goals. Skip a packet's runtime
changes when the audit proves its contract already holds; retain its verification requirements.

### I1. Lock the failures and measurements into executable regressions

Depends on: completed audit and revised plan. **Findings it must cover: F-01, F-05 (test-assertion
half), F-06.**

Owns: `packages/app/tests/served/`, `packages/host/src/terminal/tests.rs`,
`packages/host/tests/terminal.rs`, performance fixtures, and Playwright configuration where
collection or browser coverage needs correction.

Turn audit reproductions into collected tests:

- **F-01:** a job-control regression — an *interactive* shell (`bash -i`, not `sh -c`), a `&`
  background child, dispose. Asserts the child dies, the session record is removed, and the keeper
  goes empty. The existing disposal test cannot see this defect (non-interactive `sh` keeps the
  child in the same pgroup).
- **F-05 (test half):** replace `kill -0` liveness with a real-dead check (`/proc/<pid>/stat`
  state, or waitpid semantics) so zombies can't false-positive — the container failure mode.
- **F-06:** a contention test — quiet-session p50 vs busy-output-session p50 for `write`/`pollExit`,
  asserting the fixed bound.
- **Heartbeat contract:** a client that stays request-busy without heartbeating must be
  disconnected at 30 s (already-true product behavior, currently untested).

Run each bug regression against the pre-fix revision and record the failure, then make it a required
check for the owning fix. Preserve the release-build baseline and network profiles
(`audit-latency.mjs`/`audit-resources.mjs` shapes are the reference harness). Build isolated
keeper/process ownership into lifecycle tests before adding crash cases. Do not commit a
deliberately failing default suite between goals; land red-to-green evidence with the fix.

Exit evidence: tests exercise real host paths, can detect the original symptom, and cannot terminate
unrelated processes. Input tests compare exact bytes; recovery tests compare live process identity.
Performance measurements identify the leg being measured and use fixed workloads and thresholds.

### I2. Keeper session lifecycle — fix dispose, add a handshake, decide fencing

Depends on: I1's lifecycle harness. **Findings it must cover: F-01 (runtime half), F-03 (owner
decision), F-04.**

Owns: `packages/host/src/terminal/keeper.rs` (dispatch, wire enums, `Hello` exchange),
`packages/host/src/terminal/process.rs` (terminate/session-member cleanup, reader join),
`packages/host/src/terminal/mod.rs` (session map, dispose path), server lifecycle, and wrapper
supervision.

What the audit proved already works (do not re-engineer): server SIGTERM/SIGKILL/restart survival
(10/10), WS reconnect (10/10), keeper dedup via lock+ping, 30 s/5 min stall survival, SIGHUP of the
server's process group, resize-while-detached, output continuity, UTF-8/ANSI/alt-screen, bounded
retention with `droppedBefore`, natural-exit records, corrupt-catalog loud failure.

What must change:

- **F-01 (P2):** dispose must kill the *session's* member set, not only the shell's process group —
  job-control children get their own pgroup inside the same session. Fix: group signal first, then
  enumerate session members and kill survivors; and detach `OutputReader::join` from EOF dependence
  (bounded drain, then abandon) so a slave-holding orphan cannot hang dispose and leak the record.
- **F-04 (P3→P2 risk):** add a `Hello{protocolVersion}` handshake on the keeper socket before any
  op; mismatch returns an explicit `incompatible-keeper` error and never kills the keeper or its
  terminals. `deny_unknown_fields` on both enums makes any schema change fatal today.
- **F-03 (P2, owner decision pending):** two serves on one state dir share the keeper and both can
  write any session — input fencing is per-server only. Either add keeper-side session ownership
  (epoch/owner field) or document same-user multi-serve as a single-writer convenience.
- Lost-ack retry: a `terminal.start` retry after a lost ack must return a typed
  `already-exists` (→reattach) rather than the generic `terminal-unavailable` (F-02, runtime half
  here; wire surface in I3).

Exit evidence: the audit's crash matrix passes unchanged (it already does — keep it green); the
F-01 job-control regression goes red-to-green; a mismatched-keeper handshake test proves
non-destructive refusal; the F-03 decision is recorded as an owner answer in the finding register.

### I3. Typed error surface and reconnect input contract

Depends on: I2's keeper handshake (wire changes serialize there first). **Findings it must cover:
F-02.**

Owns: `packages/host/src/terminal/` error kinds → `packages/server/src/protocol.rs` public error
codes → `packages/app/src/platform/served-client.ts` / `session.ts` error routing.

The audit's restoration rows already pass: reconnect returns the same session (PID+nonce verified),
exited sessions stay listed and reattachable, missing project dirs refuse without respawning,
controller replacement fences the stale socket, and grace expiry stops watches but leaves terminals.

What must change:

- **F-02 (P3):** map `TerminalErrorKind` to typed public codes — `already-exists` (retry→reattach),
  `project-missing` (→project error), `not-found` (→null path) — keeping `terminal-unavailable`
  only as fallback. Clients currently cannot route these causes.
- Input ordering/dedup contract: no defect observed (10/10 reconnect cycles, no repeated commands),
  but the contract is implicit — define it: acknowledged writes are committed once; ambiguous
  reconnect retries must not resend silently. Keeper-side dedup only if a failure case is
  reproduced; otherwise document the contract.

Exit evidence: typed codes asserted per cause; the reconnect/restore suite stays green; input
contract documented and, where ambiguous, visibly refused rather than silently retried.

### I4. Remove the two measured latency causes

Depends on: I1's baseline harness and I2/I3's wire changes. **Findings it must cover: F-06, F-07.**

Owns: `packages/server/src/server.rs` (`TerminalEventPump`, 16 ms poll, `outputReady` shape),
`packages/host/src/terminal/keeper.rs` (global `sessions` mutex, per-session granularity),
`packages/server/src/session.rs` (event journal/broadcast), and the client read path in
`packages/app/src/threads/terminal/session.ts`. Serialize protocol changes with I2/I3; no parallel
incompatible encodings.

The audit's attribution is specific — these are the measured causes, not a survey:

- **F-07 (P2, first):** `terminal.outputReady` carries no bytes; output costs a second RTT.
  Piggyback bounded bytes on the signal (or a streamed frame) — halves the remote echo path.
- **F-06 (P2, second):** the 16 ms `terminal_snapshot()` pump takes the keeper's single `sessions`
  mutex while iterating; every op queues behind it (+~30 ms under output flow; reads ~120 ms p50
  including payload). Push readiness from the keeper or take per-session locks/`RwLock`.

Preserve input ordering; keep bulk output from delaying interactive input. Bounded output drain is
already correct (slow-consumer row passed; retention capped). No unconditional local echo.

Exit evidence: the fixed gates pass — echo p95 ≤ RTT+30 ms (needs F-07), busy-vs-quiet op inflation
≤ 5 ms (needs F-06), quiet p50 ≤ 12 ms and p99 ≤ 45 ms preserved. Show before/after distributions
from the same harness, per process role. Durability and byte-correctness suites stay green.

### I5. Close the audited coverage gaps

Depends on: I1 harness; session-related items depend on I2/I3. **Covers report 06's gap list plus
prior-reported symptoms the audit verified.**

Owns: Playwright config (`playwright.served.config.ts` — browser projects), the served-path
terminal input path (`session.ts`, emulator glue), file-tree/picker/editor files only where a
reproduction shows a live defect.

The audit's capability matrix (report 06) shows the served path is well covered on Chromium+Linux.
The verified-prior-symptoms table recorded: blank editor fixed at `2b58d97`; restart-survival works
by design (not a defect); stale `failed` thread recovery passes. Prior reports still needing
verification where the audit did not reach: left-click file activation, picker overflow on long
lists, persistent banners, repeated pasted input, misleading "no longer attached" state.

Coverage gaps to close (all recorded, none hidden):

- **Firefox and WebKit served-path runs** — no config exists; add projects to the served Playwright
  config and record results separately per browser.
- **Terminal input fidelity over the wire** — bracketed paste, IME composition, key ordering,
  copy/selection: unit-tested only; add served-path tests that type them end to end.
- **Git e2e on the served path** — host tests only today.
- **Long project-picker lists** — unit-tested; needs e2e scroll evidence.
- **Container PTY divergence (F-05)** — dev-container environment characterization, not a product
  defect; the `real-host` restart spec stays Chromium-native until the container shell-exit cause
  is understood.

Exit evidence: each gap either gets a real run with recorded results or an explicit owner deferral.
No browser-specific filesystem or terminal backend to make a test pass.

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

Audit executed 2026-09-12 against `032daf2` (code `c42128b`). Evidence:
[report 04](research/04-terminal-reliability-audit.md) (process map, 22-row failure matrix, finding
register F-01…F-07), [report 05](research/05-terminal-performance-baseline.md) (release-build
latency/resource baseline), [report 06](research/06-feature-coverage-matrix.md) (capability ×
platform/browser matrix). Raw protocol-level evidence: `/tmp/zd-audit/evidence/*.ndjson`;
harness: `/tmp/zd-audit/bin/` (uncommitted by design — I1 decides what to commit).

| Required audit handoff | State |
| --- | --- |
| Finding register | **Delivered** — F-01…F-07 in report 04, each with severity, repro, evidence, cause confidence, test gap, destination packet |
| Capability/platform matrix | **Delivered** — report 06; gaps are explicit, not hidden |
| Durability matrix | **Delivered** — 22 rows; 21 pass, 1 fail (F-01). Keeper-death and session-death bounds honestly recorded |
| Upgrade/versioning policy | **Decided as a finding** — F-04: no keeper handshake exists; I2 owns the `Hello{version}` addition |
| Screen restoration / input contract | **Mostly verified** — restoration rows pass; F-02 error typing and the implicit input-ordering contract go to I3 |
| Attributed latency baseline | **Delivered** — report 05; host ~9–10 ms/op quiet, +~30 ms under output flow (F-06), second-RTT output cost (F-07) |
| Fixed performance gates | **Set above** — echo gate blocked on F-07; all other gates pass on the measured release baseline |
| Finding→packet map, ownership, tests | **Done** — packets I1–I5 carry finding IDs and file ownership |
| Owner decisions | **One pending** — F-03 below |
| Deferrals | macOS native evidence (owner-deferred), Windows (plan-deferred), container e2e (F-05 env gap) |

### Owner decisions this plan cannot proceed past

| Decision | Why it blocks | Default if unanswered |
| --- | --- | --- |
| **F-03 — cross-server input fencing:** is same-user multi-serve sharing a supported topology? | Changes I2's scope — keeper-side fencing (new epoch/owner field) vs documenting single-writer. | Treat as supported + document "one writer at a time" (no fencing) — matches how the keeper is already shared. |

### Remaining blockers (evidence, not decisions)

1. **Native macOS run** — required by the original plan; owner-deferred for this audit. Implementation
   gates on Linux evidence; macOS stays an open row until a native runner exists.
2. **Firefox/WebKit served runs** — no driver config exists; I5 owns adding them.
3. **F-01 fix must not regress normal dispose** — the session-member enumeration is the risky part;
   I1's regression lands first.

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
