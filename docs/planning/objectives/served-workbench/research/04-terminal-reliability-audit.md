# Terminal reliability audit

Date: 2026-09-12

Status: **Executed.** This report records what was traced and what was observed under failure
injection, on the revision named below. It supersedes the hypotheses in
[the audit plan](../04-DURABILITY-PERFORMANCE-AUDIT.md) wherever the two disagree.

## Audit environment

| Item | Value |
| --- | --- |
| Source revision | `032daf2` on `feat/serve` (code under test is `c42128b`; the two later commits are docs-only) |
| Binary under test | `zd-serve` debug build, `target/debug/zd-serve`, built 2026-09-11 in the dev container |
| Release binary | `target/release/zd-serve`, built 2026-09-11 23:24 in the dev container (used for A3) |
| Frontend assets | `packages/app/dist`, built 2026-09-11 13:06 |
| Host OS | Linux 7.0.0-31-generic, x86_64, `mbox01-MINI-S` |
| Harness runtime | Node v22.23.2 |
| Browser evidence | Playwright Chromium (`chromium-1234`); WebKit present but not driven on the served path |
| Isolation | Fixture state under `/tmp/zd-audit-*`; fixture keeper socket under `terminal-keeper-v1/` inside each fixture state dir; the owner's live keeper (PID 30025) and live `zd-serve` (PID 1292950) were never signaled |

## Process and state map

The fixture process tree, observed at runtime, matches the designed topology:

```
audit harness (node)
└── zd-serve <project> --bind 127.0.0.1 --port 0 --secret …   ← fixture host; own session
    └── zd-serve __zd-terminal-keeper <state-dir>             ← keeper; own pgroup, host's session
        └── <shell>  (interactive bash)                       ← PTY child; own session + pgroup
            └── <job-control background children>             ← own pgroup inside child's session
```

Runtime evidence: the keeper runs in its **own process group** (`process_group(0)` at spawn) but
inherits the **server's session ID**. PTY children become session leaders (portable-pty setsid).
The keeper's stdio is `/dev/null` on all three streams — no inherited pipes exist to break.

Who owns what, per operation:

| Operation | Owner | Identity | Persistence point | Bound | Failure result |
| --- | --- | --- | --- | --- | --- |
| start | keeper `TerminalSessions` map | `TerminalSessionHandle{project,worktree,session}` | keeper RAM only — nothing on disk | viewport validated; none on count | error → `terminal-unavailable` |
| input/write | keeper session → PTY master | per-session | none (immediate) | `MAX_INPUT_BYTES` = 64 KiB/write | dead child → `Io` "already exited" |
| output/read | keeper `BoundedOutput` ring | absolute byte offsets | keeper RAM, 4 MiB cap (16 MiB max) | `droppedBefore` reported; 32 MiB keeper reply cap | unknown session → error |
| resize | keeper → PTY master | per-session | none | viewport validated | same error mapping |
| detach (client gone) | server `SessionRuntime` → 30 s controller grace | per-server generation | none needed | `CONTROLLER_DISCONNECT_GRACE` = 30 s | file watches stopped; `session.resync-required` published |
| reconnect/reattach | keeper lookup by `(scope, terminal_id)` | same handle returned | keeper map | — | missing → `null`; project gone → error |
| natural exit | keeper session record | exit status `code/signal/reason` | keeper RAM until dispose | output retained | `pollExit` reports status |
| explicit dispose | keeper `terminate` → `kill(-pgid)` | session record removed on success | removal only after successful terminate | reader join 2 s | **see F-01** |
| event fan-out | server `TerminalEventPump` → broadcast | sequence-numbered `HostEvent` | none | 16 ms poll; channel cap 256 → Lagged→resync | client resyncs |
| WS liveness | server heartbeat deadline | per-socket | — | 30 s silence → close | client must re-auth |

## Boundary questions answered

1. **Who holds PTY masters and child handles?** The keeper process. Server restarts, crashes, and
   SIGKILL cannot reach them — observed directly (rows below). The keeper is immune to launch-shell
   exit and terminal hangup: SIGHUP to the server's foreground process group kills `zd-serve` while
   the keeper and every shell survive. The residual exposure is that the keeper shares the server's
   *session*: anything that kills a whole session or user cgroup kills it too. That is the honest
   boundary of the guarantee — below the HTTP server lifetime, not below the OS session.
2. **What survives a new server, port, origin, profile?** Sessions live in the keeper — they survive
   server, port, and browser changes. The pairing token persists in the state directory and survives
   restart and port changes; a new browser profile has no cookie and must pair again. Durable records
   (identity catalog, grant set, durable-state files) live under the state directory.
3. **Created-but-lost / stale-failed / resurrection?** A `terminal.start` whose ack is lost leaves a
   live keeper session; the retry errors generically rather than double-spawning (observed: snapshot
   count stayed 1). The stale-`failed` thread case is covered by the committed
   `terminal-restoration` spec — startup reattach revives it. A disposed session cannot reappear:
   `reattach` returns `null` (observed).
4. **Multiple serves, one user?** All `zd-serve` processes with the same state directory share one
   keeper — a `keeper.lock` file lock plus a ping to the existing socket prevents duplicates
   (observed: two servers, one keeper PID, shared session list). Two servers do **not** fence each
   other's terminal input — controller fencing is per-server-runtime; both serves can write to the
   same session (F-03).
5. **Reconnect = same session?** Verified with PID + in-shell nonce, not PID alone: the shell prints
   `$$` and a random nonce, and after reconnect the same PID answers a fresh nonce write — 10/10
   WS cycles and 10/10 server SIGKILL cycles.
6. **Keeper/server version mismatch or upgrade?** The keeper wire protocol has **no version field**;
   both enums are `deny_unknown_fields`. A new binary reuses a live old keeper when the wire format
   still matches, and fails with a decode/unexpected-response error (non-destructive — the keeper and
   its terminals keep running, but no terminal op succeeds) when it does not. There is no negotiated
   compatibility path and no forced keeper restart (F-04).
7. **Lost acks, repeated reconnect?** See row data; no duplicate spawn, no repeated command, no
   resurrection was observed in any run.

## Failure matrix — observed results

Evidence is the ndjson logs under `/tmp/zd-audit/evidence/` (run-scoped paths; the same cases are
reproducible through `audit-matrix*.mjs` in the harness). PASS means the row's contract held.

| Row | Result | Observation |
| --- | --- | --- |
| WS close + reconnect, same session/PID | PASS | same handle; shell pid unchanged |
| Server SIGTERM + restart on new port | PASS | keeper + child survived; rediscovery works |
| Server SIGKILL × 10, restart each time | PASS | 10/10: shell survived, reattach + IO intact |
| WS close + reconnect × 10 | PASS | 10/10 reattached to same pid |
| Keeper death | PASS (honest loss) | all shells die with the keeper (PTY master dies); ops error `terminal-unavailable`; reattach after restart → `null`; nothing fakes survival |
| Explicit dispose, sibling lives | PASS* | disposed shell dead; sibling alive; no resurrection — *but see F-01 for the job-control exception |
| Natural exit | PASS | `pollExit` → `{code:41, reason:exited}`; output retained; reattach returns the exited handle; restart is explicit |
| Two serves, one keeper | PASS | single keeper serves both; second server lists shared sessions |
| Controller replacement | PASS | first controller gets `controller-replaced`; its later writes are refused |
| Detached output > 4 MiB | PASS | 8.6 MiB in → retained exactly 4194304 B; `droppedBefore` reported; keeper RSS ~15 MiB mid-flood |
| Lost start ack → retry | PASS | no double-spawn; retry sees a generic error (F-02) |
| 30 s network stall (frozen TCP) | PASS | socket dies at the 30 s heartbeat bound; shell + mid-stall output survive; fresh reconnect reattaches |
| 5 min network stall (frozen TCP) | PASS | same bound; stalled 305 s; mid-stall output present; reattach → handle |
| Terminal hangup / launching-shell exit | PASS | SIGHUP to server pgroup: serve dies, keeper + shells survive; new serve reuses keeper |
| Resize while detached | PASS | reattach with 50×132 → `stty` reports 50×132 |
| Output during reconnect gap | PASS | output written clientless via keeper present after reconnect, `droppedBefore=0` |
| UTF-8 multibyte + alt-screen + cursor modes | PASS | 4-byte emoji round-trips; `1049h`/`1049l` + return to main screen verified |
| Missing project dir on reattach | PASS* | generic `terminal-unavailable` (F-02 fidelity); shell stays alive; no silent respawn |
| Corrupt identity catalog | PASS | host refuses to start: `identity catalog is unavailable: catalog JSON is invalid` — loud, specific |
| Job-control background child on dispose | **FAIL → F-01** | see below |
| Slow consumer (never reads) during flood | PASS | retention stays ≤ 4 MiB; client responsive; no resync storm |
| Controller grace expiry | PASS | watches stop at 30 s; resync published; watches restart on client re-request |
| Heartbeat contract | PASS (contract note) | only `session.heartbeat` resets the 30 s socket deadline — a continuously busy client that never heartbeats is still disconnected at auth+30 s (observed: socket death at ~31 s mid-traffic). The app client always heartbeats so the contract holds; scripted/third-party clients must too |

### Container (Podman) rows — recorded, not hidden

Two existing tests fail inside the dev container and pass on the native host:

- `real-host.spec.ts` "keeps every project terminal through a served-host process restart" — spawned
  shells exit early (`logout` / `data-terminal-status="exited"`), at different points per run.
- `terminal::tests::disposal_terminates_the_session_process_group` — a descendant survives.

Both were re-run on the pre-`--secret` revision and with and without `--userns=keep-id`: identical
failure. They are container PTY/process-group semantics, not a product regression — but they are
exactly the kind of environment gap this audit exists to record (F-05).

## Finding register

Severity: P0 security/data-loss · P1 core workflow blocked · P2 degraded with workaround · P3 minor.

### F-01 — Job-control children survive dispose; the orphan hangs the reader and leaks the session

- **Severity:** P2 (workaround: kill the orphan, then dispose succeeds)
- **Affected:** Linux + macOS keeper mode, interactive shells (job control on). All versions since
  the keeper shipped.
- **Reproduction:** in any interactive terminal, `sleep 555 &` (bash puts it in its own pgroup), then
  close the terminal tab.
- **Expected:** the owned process tree terminates; the session record is removed.
- **Actual:** `kill(-pgid)` targets only the shell's pgroup; the job-control child survives. The
  orphan still holds the PTY slave, so the reader thread never sees EOF; `OutputReader::join` times
  out at 2 s; `dispose` returns `terminal-unavailable`; `sessions.remove()` never runs — the keeper
  keeps a zombie record that `reattach` returns a handle for, and the keeper never goes empty (no
  idle exit).
- **Evidence:** `a2-matrix3` jobctl row — dispose errored; orphan alive holding 3 pts fds; keeper
  still listed `term-jobctl`; reattach returned a handle; killing the orphan made a second dispose
  succeed and cleared the record. Confirmed identically on a native host keeper and in Podman.
- **Cause confidence:** high — code path read end to end and the mechanism reproduced at both levels.
- **Test gap:** the existing disposal test uses non-interactive `sh -c`, where `sleep &` stays in the
  shell's pgroup. No test covers a job-control child.
- **Destination:** implementation packet T-01 (process cleanup).
- **Fix direction:** fall back to session-member kill whenever any member of the session survives the
  group signal — not only on EPERM — and detach the output reader from EOF dependency on join
  (bounded drain, then abandon).

### F-02 — Keeper error fidelity collapses distinct causes into `terminal-unavailable`

- **Severity:** P3
- **Affected:** all served platforms.
- **Reproduction:** retry `terminal.start` after a lost ack, or `terminal.reattach` with a deleted
  project directory.
- **Expected:** typed errors (`already-exists`, `project-missing`) a client can act on.
- **Actual:** one generic `terminal-unavailable`; a client cannot tell "session already exists"
  (→reattach) from "session gone" (→null) from "project missing" (→error).
- **Evidence:** matrix `lost-ack` and `missing project` rows.
- **Cause confidence:** high — the server maps every `TerminalError` to one public code.
- **Test gap:** no test asserts the public error code per cause.
- **Destination:** packet T-02 (protocol error surface).
- **Fix direction:** map `TerminalErrorKind` through to typed public codes; keep the generic fallback.

### F-03 — Terminal input is not fenced across server processes

- **Severity:** P2 for the shared-keeper topology (deliberate multi-serve), else P3.
- **Affected:** any two `zd serve` processes sharing one state directory.
- **Reproduction:** start serve A and B on the same state dir; both create/reattach the same
  terminal; both `terminal.write` succeed — two input authorities on one PTY.
- **Expected:** exactly one valid input authority per session, per the audit contract.
- **Actual:** fencing is per-server-runtime only; the keeper has no controller concept.
- **Evidence:** `two serves, one keeper` row — second server sees and writes the shared session.
- **Cause confidence:** high — there is no keeper-side fencing field.
- **Test gap:** no cross-server fencing test exists.
- **Destination:** packet T-03 (keeper fencing) — or an owner decision that same-user multi-serve
  sharing is intended and documented.
- **Fix direction:** if fencing is wanted, the keeper needs an epoch/owner field per session, not a
  per-server check.

### F-04 — No keeper protocol version; upgrades are all-or-nothing compatible

- **Severity:** P3 today (single-version deployments), P2 risk at the first wire-format change.
- **Affected:** every upgrade path with live terminals.
- **Reproduction:** change any `KeeperRequest`/`KeeperResponse` field and restart `zd-serve` while a
  keeper lives; every terminal op fails decode; the keeper keeps running.
- **Expected:** a version handshake with an explicit non-destructive refusal or a compatible path.
- **Actual:** `deny_unknown_fields` on both sides → any schema change is fatal to interop, silently
  and per-request.
- **Evidence:** code read (`keeper.rs` wire enums); no runtime injection — the finding is structural.
- **Cause confidence:** high.
- **Test gap:** no version-negotiation test exists because none is implemented.
- **Destination:** packet T-04 (keeper handshake).
- **Fix direction:** a `Hello{version}` exchange on connect; mismatch → explicit `incompatible-keeper`
  error, never a kill.

### F-05 — Podman container results differ from the native host — two separate mechanisms

- **Severity:** P3 for product (the container is dev tooling), P1 for trusting Podman as audit
  evidence without characterization.
- **Affected:** dev-container runs only; not a shipped path.
- **Reproduction and mechanism:**
  - `terminal::tests::disposal_…` is **flaky** in the container (observed fail then pass on the same
    revision). The killed descendant reparents to the container's PID 1 — `node`, which never
    reaps — so the test's `kill -0` check reads a zombie as "survived". The SIGKILL lands correctly;
    the assertion is environment-sensitive. Native hosts reap via init and pass deterministically.
  - `real-host.spec.ts` "keeps every project terminal through a served-host process restart" fails
    in the container with shells exiting early (`logout`/`status=exited`) at varying points —
    reproduced on the pre-change revision, with and without `--userns=keep-id`. Mechanism
    unconfirmed; container PTY/session semantics are the suspect.
- **Cause confidence:** high for the zombie-reaping explanation (observed pass/fail flip); medium
  for the e2e restart row.
- **Test gap:** the liveness assertion should read `/proc/<pid>/stat` state, not `kill -0` — zombies
  accept signal-0. Worth a shared "is-really-dead" helper if more tests do PID checks.
- **Destination:** environment characterization; the zombie-check fix belongs to packet T-01's test
  work. Container e2e remains flagged where used in report 06.

### F-06 — Output flow inflates every keeper op by ~30 ms; reads by ~110 ms

- **Severity:** P2 — interactive latency degrades precisely while output flows (when it matters most).
- **Affected:** all platforms, debug and release builds alike.
- **Reproduction:** hold a terminal producing continuous output; send `terminal.write`,
  `terminal.read`, or `terminal.pollExit`. Also visible on a quiet terminal driven in a tight
  loopback request loop.
- **Expected:** request latency near the sub-millisecond op cost the release build shows at wide
  spacing (`handlerMicros` p50 ≈ 0.7 ms at 200 ms request spacing).
- **Actual, release build:** the tight-loop loopback baseline is ~9–10 ms — contention measured
  *inside* `handlerMicros` (the request's keeper call waits on the global `sessions` mutex while
  the 16 ms `terminal_snapshot()` pump iterates it). `pollExit` adds a further ~31 ms *outside*
  host time — WS-task delay while queued `outputReady` events are serviced. Under a sustained
  sibling output stream (`probe-pollexit`): `write`/`pollExit` ~40 ms p50, `read` ~120 ms p50
  (payload included).
- **Evidence:** `a3-latency-2026-09-12T05-35-53.706Z.ndjson` (handler 9.7 ms @ 0 ms vs 0.7 ms
  @ 200 ms; pollExit residual 31.2 ms @ 0 ms); `probe-pollexit` quiet-vs-busy run.
- **Cause confidence:** high for the keeper-mutex half (timing split is in the numbers); medium for
  the WS-task half of `pollExit` (mechanism inferred from where the residual sits).
- **Test gap:** no load-vs-latency contention test exists.
- **Destination:** packet I4 (event pump / snapshot cost / keeper lock granularity).
- **Fix direction:** push output readiness from the keeper (or diff on offsets without holding the
  session-map lock); per-session locks or `RwLock`; keep request responses ahead of bulk event
  sends in the WS task.

### F-07 — Output delivery costs a second full round trip

- **Severity:** P2 at remote RTTs — the dominant interactive-latency contributor.
- **Affected:** all remote (non-loopback) clients.
- **Evidence:** `terminal.outputReady` carries no bytes (server.rs `TerminalEventObserver`); the
  client must `terminal.read` after the signal. Echo path ≈ 2×RTT + ~9 ms host + ≤16 ms pump wait.
- **Cause confidence:** high — protocol shape, read end to end.
- **Destination:** packet T-06 (output piggyback / push bytes with the signal).
- **Fix direction:** carry the first chunk of pending bytes in `outputReady` (bounded), or switch the
  event to a streamed frame — either removes the second RTT from the echo path.

## Authority conflicts

- **ADR 0010** (keeper below server lifetime) vs the audit's durability contract — **consistent**;
  every restart row passes. The ADR is silent on the session-level kill boundary (F-adjacent note,
  not a conflict): the keeper survives *server* death but not *session* death. That is a design
  boundary worth stating in the ADR's consequences, not an implementation bug.
- **Owner direction** "terminals survive `zd serve` crashing, restarting" — met as stated. The
  owner's tmux comparison sets an expectation the current design deliberately does not meet:
  tmux survives its own *session* because it daemonizes into a new one; this keeper does not. If the
  owner expects survive-ssh-logout semantics, that is an owner decision for plan 05.
- **`DENY_UNKNOWN_FIELDS` on the keeper wire** vs "upgrade with live terminals preserves them" —
  the current contract makes any wire change a hard break (F-04). The plan's "compatible path or
  explicit non-destructive refusal" is not implemented.
- **Older quit/shutdown descriptions** — `run_foreground`'s graceful-stop path and the keeper's
  2 s empty-idle exit are consistent with each other; no stale doc claimed server-lifetime cleanup.
  The audit-goal text and ADR 0010 agree; nothing needed rewriting.

## Design recommendations carried to plan 05

1. **Session-member cleanup as the default path** for Unix dispose — group signal first, then
   verify by session, not only on EPERM. (F-01)
2. **Typed public error codes** for terminal ops so clients can route `already-exists` to reattach
   and `project-missing` to a project error instead of one banner. (F-02)
3. **A keeper handshake** (`Hello{protocolVersion}`) before any op; mismatch is explicit and
   non-destructive. (F-04)
4. **Push output, don't poll it** — either bytes in the ready signal or a keeper→server event
   channel; the 16 ms poll both adds latency and contends the session lock (F-06, F-07).
5. **Decide the multi-serve input contract** — owner decision: same-user serves sharing a keeper is
   either supported (then keeper-side fencing is needed) or documented as unsafe. (F-03)
