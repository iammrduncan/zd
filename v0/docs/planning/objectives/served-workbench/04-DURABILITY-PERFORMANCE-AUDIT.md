# Audit plan: establish terminal durability, latency, and feature evidence

Date: 2026-09-05

Status: **Planned; not executed.** This document authorizes no work by itself. The current request
is to write the plans, not to run the audit or implement fixes.

## Outcome and order

Establish what prevents `zd serve` from being a durable, responsive connection to agent work on a
machine. Produce reproducible findings and revise the
[implementation plan](05-DURABILITY-PERFORMANCE-IMPLEMENTATION.md) before implementation starts.
An inventory of source and existing tests is planning context, not evidence that a behavior works.

The audit covers the complete served workbench and its Tauri wrapper. Terminal durability and input
latency have first priority. “Full” means every supported capability has an evidence row, including
failures and unavailable environments; it does not mean reviewing unrelated website features.

## Prerequisites and ownership

- Record the exact source revision, asset build, binary version, OS, browser, and test configuration.
- Use disposable projects, a separate test configuration and keeper namespace, and fixture-owned
  processes. Prove isolation before injecting failures. Never restart the user's live host or keeper.
- Obtain Linux and native macOS test environments. Chromium, Firefox, and WebKit coverage must be
  recorded separately; a Playwright WebKit run is not native Tauri evidence. Windows remains deferred.
- Existing [packaging goal 05](goals/execute-goal-05.md) can remain open while source-level audit work
  proceeds. Missing installed-platform evidence must remain visible, not be counted as passing.
- One audit executor owns the finding register and implementation-plan revision. Coordinate any
  test-harness edits with work touching the same files; do not change product behavior during audit.

Needed from the owner: nothing to prepare these plans. Future execution needs isolated test
environments. If a native runner or representative remote route is unavailable, continue independent
checks and report the missing evidence. Do not declare the full audit complete.

## Authority and starting points

Apply the latest owner direction and
[ADR 0010](../../../adr/suite/0010-keep-terminal-sessions-below-server-lifetime_H.md): a private,
same-user terminal keeper owns live processes below the lifetime of the HTTP server. The browser and
Tauri use one backend. Preserve the versioned workbench state owner and approved project grants.

Inspect these existing boundaries; none is a confirmed cause of lag merely because it is listed:

| Boundary | Primary code or evidence |
| --- | --- |
| Keeper, PTYs, output retention, process cleanup | `packages/host/src/terminal/` |
| Server lifecycle, controller, protocol, wrapper | `packages/server/src/` and `packages/tauri/` |
| Browser transport and restoration | `packages/app/src/platform/served*.ts` and `packages/app/src/workbench/` |
| Input, emulator, replay, terminal views | `packages/app/src/threads/terminal/` |
| Tree, picker, files, Git, commands | `packages/app/src/files/`, `packages/app/src/git/`, and workbench composition |
| Real-host browser regressions | `packages/app/tests/served/` and `playwright.served.config.ts` |
| Renderer fixtures and earlier measurements | `packages/app/tests/e2e/` and [performance review](../../performance.md) |
| Installed lifecycle and artifacts | `packages/scripts/release/`, `packaging/`, and release workflows |

Reconcile current behavior with the [vision](../../../VISION.md), [design](../../../DESIGN.md),
accepted ADRs, and earlier objective documents. In particular, flag older quit/shutdown descriptions
that conflict with the owner's durability requirement. Do not silently rewrite human-owned decisions.

## A1. Trace ownership and failure boundaries

Draw the actual process tree and trace start, input, output, resize, detach, reconnect, exit, and
explicit close. For each operation record its owner, stable identity, persistence point, queue bounds,
acknowledgement boundary, and failure result.

Answer these questions with code references and runtime evidence:

- Who holds the PTY master and child/process-group handles? Can server cleanup, wrapper containment,
  closed inherited pipes, launch-shell exit, or idle expiry terminate them accidentally?
- Which state survives a new server process, port, browser origin, and browser profile? Separate live
  session truth, host-owned durable records, and client presentation state.
- Can a terminal be created but lost from the workbench when creation acknowledgement or state saving
  fails? Can a stale `failed` thread hide a live keeper session? Can a closed session reappear?
- How do multiple `zd serve` launches under the same OS user discover managed sessions without
  duplicate keepers, competing input controllers, or exposing another user's sessions?
- Does reconnect restore the actual session and terminal screen, or create a visually similar shell?
  Compare process start identity and an in-process nonce, not PID alone.
- What happens during keeper/server version mismatch or an application update with live terminals?
  A forced keeper restart is not a non-disruptive update.

## A2. Exercise the durability matrix

Run each relevant case for thread terminals and project-terminal splits. Include several projects,
inactive terminals, a running child agent fixture, and output while no client is attached.

| Event | Required observation |
| --- | --- |
| Refresh, tab close, browser crash, project/thread switch | Same managed session and process remain; reattach does not start another shell |
| Network loss for 30 seconds and 5 minutes | Process keeps working; bounded reconnect restores identity, output, and input ownership |
| Server SIGTERM, SIGKILL, and restart, including a changed port | Keeper and child survive; existing sessions can be rediscovered after authentication |
| Tauri hide, close, quit, crash, and supervised server restart | Closing presentation or the gateway does not terminate terminal processes |
| Launching shell exits or remote login disconnects | No accidental inherited-pipe or process-group death; state any OS-session policy limits |
| Lost start/close/input acknowledgement and repeated reconnect | No duplicate spawn, repeated command, or resurrected closed session |
| Natural process exit | Preserve the exited record and available output; restart is an explicit action |
| Explicit UI terminal close | Terminate only its owned process tree; persist closure; reconnect cannot restore it as live |
| Keeper death or machine reboot | Report lost sessions honestly; do not claim a fresh process is a reattachment |
| Missing project/worktree, stale metadata, disk full, interrupted state write | Preserve recoverable records and give a specific error; never silently discard or respawn work |
| Concurrent server launch, controller replacement, old client resumes | Exactly one valid input authority per session; stale requests cannot affect the new controller |
| Upgrade or incompatible keeper protocol | Preserve live processes; provide a compatible path or an explicit non-destructive refusal |

Repeat gateway crash/reconnect at least ten times. During detached output, exceed the configured
replay limit and verify bounded memory plus explicit truncation. Exercise UTF-8 and ANSI sequences
split across frames, alternate-screen programs, resize while disconnected, cursor and input modes,
and an output/reconnect race. Saving lines of text is not proof of terminal-screen restoration.

Use fixture-owned PIDs and process identities for signals and cleanup. Keeper death and reboot tests
belong in a disposable environment, never on a machine containing the user's agent work.

## A3. Measure typing and output end to end

Measure release builds with diagnostics both off and explicitly enabled. Use existing collected test
locations for any necessary harness additions; do not add standalone scripts or runtime fixes.

Trace browser key event → input queue → WebSocket → server queue → keeper IPC → PTY write → child
response → output queue/replay → WebSocket → emulator parse → presentation. Record queue depth,
batch delay, bytes, dropped/truncated output, CPU, memory, and reconnect duration per process role.

Use a deterministic raw-mode fixture child that records exact received bytes and emits correlated
responses. Record input-to-visible-response on the browser's monotonic clock. Record host phases on
the host's monotonic clock; never subtract timestamps from different machines. Distinguish an xterm
write callback from a displayed frame. Document the presentation measurement method and its error;
use headed traces or capture for checks that a headless browser cannot establish.

Workloads:

- 1, 8, and 32 live terminals across up to four projects; also retain the existing 24-inactive-surface
  fixture for comparison. Type in the foreground while seven background terminals produce output.
- Plain echo, sustained key repeat, long paste, Unicode/IME, shell editing, and a fullscreen TUI.
  Include representative supported agent CLIs where available without capturing private prompts.
- Quiet prompt, paced output, and a 10 MiB ANSI-output burst. Exercise file watches and Git refresh
  concurrently to detect shared-queue interference.
- Controlled round-trip latency of 0, 40, 100, and 200 ms; add 20 ms jitter and 1% packet loss in a
  separate stress profile. Record actual RTT. Run a protected-network remote route, such as Tailscale,
  separately from loopback and synthetic network shaping.
- Warm up, take at least 1,000 input samples per measured profile, repeat three times, and report
  p50/p95/p99 plus stalls and sample counts. Record steady idle CPU over 60 seconds and memory after
  repeated attach/detach and output bursts. Include browser/webview, gateway, keeper, and child costs.

Evaluate the implementation plan's candidate budgets. Explain how much latency is browser work,
gateway/keeper work, child response, and transport residual. Inspect polling, IPC connection churn,
locking, batching, encoding, rendering, and scheduling only as hypotheses until traces implicate them.
Fixture throughput alone cannot establish responsive remote typing.

## A4. Audit the complete interaction and security surface

Build a capability-by-platform matrix. Every row needs a real production-path test, a bounded manual
procedure with evidence, or an explicit coverage gap. Inspect whether existing tests can fail for the
reported symptom, whether they are collected, and whether mocks bypass the failing boundary.

- **Connection:** first pairing, remembered credential after reload/restart, expiry/revocation,
  reconnect feedback, stale controller recovery, and intentional controller replacement. Never log
  a token or make every refresh require manual credentials.
- **Projects and picker:** browse the remote host, scroll long lists within the dialog, select and add
  a folder beside the current project, cancel, reopen, and handle missing or denied roots.
- **Files:** real left-click opens files and expands folders; right-click does not substitute for it.
  Test watcher refresh between pointer down/up, repeated clicks, keyboard navigation, modifier
  selection, filtering, tree scroll, context-menu dismissal, and focus preservation.
- **Editor and Git:** open the selected file's actual contents, edit/save/reopen, dirty-buffer context
  switches, external changes, Changes/revision views, and approved-root enforcement.
- **Terminals:** focus, key ordering, no duplicated textarea/paste input, bracketed paste, composition,
  shortcuts, interrupt, copy/selection, search, scrollback, resize, alternate screen, split terminals,
  theme contrast, and reconnect restoration. Check both headless behavior and visible usability.
- **Workbench and shell:** create/rename/reorder/close threads, switch projects/worktrees, restore
  layout, dismiss banners/dialogs, command routing, notifications, quick access, and desktop-only
  unavailable states. Include keyboard access, accessible names, form labels, and all shipped themes.
- **Security and resource limits:** same-user keeper socket permissions and peer authority,
  credential/origin checks, controller fencing, project grants, hostile paths, frame/input/output
  bounds, slow consumers, and content-free diagnostic retention. Terminal access grants shell-user
  authority; project grants are not a terminal sandbox.
- **Delivery:** packaged assets match the binary, CLI and wrapper use the same backend, native
  startup/shutdown/upgrade behavior, and user documentation matches verified behavior.

Extend the real-host Playwright suite for browser-to-host failures. Assert observable results: file
contents appear, folder children become reachable, the same terminal process receives exactly the
expected bytes. A dispatched click, a successful API response, or a mocked adapter call is not enough.
For each reproducible reported error, add and run a failing regression before any later fix. If the
current code already passes, record that and strengthen missing coverage; do not manufacture a failure.

## Deliverables and mandatory handoff

Create these reports during the audit, not during planning:

1. `research/04-terminal-reliability-audit.md`: process/state maps, failure matrix, finding register,
   authority conflicts, and durable-session design recommendations.
2. `research/05-terminal-performance-baseline.md`: environment, commands, raw measurement locations,
   distributions, attribution, candidate-budget assessment, and recommended experiments.
3. `research/06-feature-coverage-matrix.md`: all capability/platform rows, test quality, regressions,
   manual evidence, and missing coverage. Update the research index with the reports.
4. Revise [plan 05](05-DURABILITY-PERFORMANCE-IMPLEMENTATION.md) in the same handoff. Replace hypotheses
   with finding IDs, chosen changes, exact file ownership, fixed performance gates, dependencies,
   regression tests, deferrals, and any owner decisions. Preserve a dated revision note.

Each finding must have an ID, severity, affected versions/platforms, reproducible steps, expected and
actual result, evidence reference, cause confidence, test gap, and destination implementation packet.
Use P0 for security exposure or destructive data/process loss, P1 for core workflows blocked or
unusable, P2 for degraded behavior with a workaround, and P3 for minor issues. Severity follows impact,
not the size of the proposed fix. Every finding needs a fix, justified deferral, or owner decision.

Keep bounded, sanitized traces/screenshots under the existing test-artifact policy. Commit reports and
reproduction instructions, not private transcripts, secrets, personal paths, or large trace archives.

## Completion gate and non-goals

The audit completes when all scoped capability rows and failure cases have evidence, latency has an
attributed baseline, findings are prioritized, and plan 05 has been revised. Product failures are
valid audit results; missing mandatory evidence is not a pass. The handoff must separately state
whether implementation is ready or which decisions still block it.

Do not implement fixes, tune timeouts to pass, restart live user services, publish releases, introduce
a second terminal backend, add Windows work, or turn this into a new agent orchestration platform.
Instrumentation needed for the audit must stay isolated and must not change production behavior.
