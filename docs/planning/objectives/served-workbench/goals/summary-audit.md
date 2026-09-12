# Summary — audit goal: served-workbench durability, latency, and feature evidence

**Completed:** 2026-09-12 · **Audited revision:** `032daf2` (code `c42128b`), Linux x86_64

**Commits:** `639e2d6` (reports 04–06 + index), `2dba4a1` (plan 05 revision)

**Goal file:** [`audit-goal.md`](audit-goal.md)

## Action needed from the owner

| What needs owner input | Why the owner must decide | What it blocks |
| --- | --- | --- |
| **F-03 — cross-server terminal input fencing.** Two `zd serve` processes on one state dir share the keeper, and both can write any session. Is same-user multi-serve a supported topology? | It's a product contract, not a bug an implementer can pick: supported → keeper-side fencing work; documented-unsafe → a doc line and no code. | Packet I2's scope in plan 05 |
| **Native macOS evidence** — owner-deferred ("later, less priority on tauri"), so recorded as a gap rather than run | Only the owner can supply a native runner or formally accept the gap | I6's installed-lifecycle gates; the audit does not claim macOS behavior |
| **The tmux-expectation boundary** — the keeper survives server death but shares the server's OS *session*; `kill -9` of the keeper or session teardown loses everything | The owner's "like tmux" phrasing may mean survive-ssh-logout, which the current design deliberately does not provide | The durability contract wording in ADR 0010's consequences and plan 05's lifecycle contract |

## What was delivered

1. **`research/04-terminal-reliability-audit.md`** — the real process/state map (keeper in its own
   process group but the server's session; PTY children as session leaders), a per-operation owner
   table, all seven boundary questions answered with runtime evidence, a 25-row failure matrix,
   the finding register (F-01…F-07), authority conflicts, and design recommendations.
2. **`research/05-terminal-performance-baseline.md`** — release-build measurements: 1000 samples
   × 3 ops at 0/40/100/200 ms injected RTT plus a jitter/loss stress profile and a same-host
   tailnet route (5000 samples, zero errors), p50/p95/p99 with stall counts, per-leg attribution
   (`queueMicros`/`handlerMicros`/`serializationMicros` vs transport residual), 1/8/32-session
   scaling, a 7-busy-background load profile, idle CPU/RSS per process role, the candidate-gate
   assessment, and recommended experiments.
3. **`research/06-feature-coverage-matrix.md`** — every capability row carries test evidence,
   audit protocol evidence, or an explicit gap; platform/browser status is separated (Chromium
   covered; Firefox/WebKit no driver; native macOS deferred; Windows deferred); prior reported
   symptoms verified.
4. **Revised plan 05** — audit-revision note with revision and evidence links; provisional
   hypotheses replaced by finding IDs; packets carry exact file ownership, fixed performance gates
   (with measured starting points), regression tests, dependencies, deferrals, and the remaining
   owner decision.

## Findings (all in report 04's register)

- **F-01 (P2)** — job-control background children survive `dispose`: `kill(-pgid)` misses them, the
  orphan holds the PTY slave, `OutputReader::join` times out, dispose errors, and the session
  record leaks. Reproduced natively and in Podman; the existing test can't see it (non-interactive
  `sh` keeps the child in-group). → I1 test + I2 fix.
- **F-02 (P3)** — every `TerminalError` collapses to `terminal-unavailable`; clients can't route
  `already-exists` vs `project-missing`. → I2/I3.
- **F-03 (P2, owner decision)** — no input fencing across server processes sharing a keeper. → I2.
- **F-04 (P3 now, P2 at first wire change)** — no keeper protocol handshake; `deny_unknown_fields`
  makes any schema change fatal per-request. → I2 `Hello{version}`.
- **F-05 (P3 product / P1 for evidence)** — Podman diverges: flaky zombie-vs-`kill -0` disposal
  check, deterministic restart-spec shell exits and desktop-launch failure without a display. →
  environment characterization, not a product fix.
- **F-06 (P2)** — the 16 ms snapshot pump + global keeper mutex + shared WS task inflate ops: real
  op cost is 0.7 ms but loopback p50 is ~9–10 ms, `pollExit` +31 ms in the WS task, busy-session
  reads ~120 ms. → I4.
- **F-07 (P2)** — `terminal.outputReady` carries no bytes; every visible echo costs a second RTT.
  → I4; gates the RTT+30 ms echo target.

## What was wrong and corrected mid-run

- The latency harness's WS client never sent `session.heartbeat` — sockets died exactly at the
  30 s heartbeat deadline mid-sweep. Fixed with fire-and-forget heartbeats; this also surfaced a
  contract note: *only* heartbeats reset the deadline, request traffic does not.
- A release-build isolation near-miss: `ZD_TEST_STATE_DIR` is debug-only; release fixtures were
  saved by `XDG_CONFIG_HOME` (`com.zensuite.zd` nesting). The live keeper was verified clean —
  zero fixture sessions ever touched it.
- The first resource run sampled the keeper PID before spawn and reported a dead process; the
  first flood row redirected output to `/dev/null` and "passed" vacuously; the first stall row
  waited on a socket that was *supposed* to die. All corrected before any finding was written.
- F-06's first draft blamed `pollExit` specifically — the probe showed every op contends; the
  +200 ms data then showed the real op cost is sub-millisecond and even the "quiet" 9 ms is
  contention.

## Traps and surprises

- Interactive bash puts `sleep &` in its **own** process group — process-group kill is not
  session-tree kill (F-01's root cause).
- `kill -0` returns success on zombies; a container PID 1 that doesn't reap makes liveness checks
  lie (F-05's mechanism).
- The 30 s "heartbeat timeout" is really a *heartbeat-or-die* deadline — busy sockets die too.
- Idle-exiting keepers only exit when *empty* — ~50 fixture keepers accumulated over the audit
  (all reaped at the end; correct per design, but worth knowing for anyone running many fixtures).

## What this unblocks

- Plan 05 is executable: packets I1–I6 have finding IDs, ownership, gates, and tests.
- The two P2 latency causes are measured and attributed — I4 can start with F-07 (bigger remote
  win) then F-06.
- F-01 has a reproduction and a root cause; its fix is scoped.

## What remains blocked / open evidence

- **Native macOS** — owner-deferred; recorded gap, nothing claimed.
- **Firefox/WebKit served runs** — no driver config; I5 owns.
- **Cross-machine tailnet RTT** — same-host route measured (≈loopback); real remote RTT needs a
  second host — the synthetic profiles cover the RTT term.
- **Browser-visible render leg** — protocol RTT measured; xterm render time not separately
  instrumented (noted in report 05's method section).
- **Wrapper hide/close/quit/crash on a real desktop** — no display; recorded gap.

## Gate results at handoff

`npm run check` ✅ (typecheck, lint, 945 unit tests, version) · `cargo fmt --check` ✅ ·
`cargo clippy -D warnings` ✅ · `cargo test --workspace` ✅ with two recorded container-env skips
(F-05) · `npm test` ✅ · served e2e on identical code: 13/15, both failures container-only (F-05) ·
`test:e2e` 449/449 ✅ (one caret-scroll flake passed on immediate retry) · `test:e2e:release` 3/3 ✅
(terminal renderer 2.435 MiB/s, above the 2 MiB/s gate).

`smoke:linux` on `zd_0.2.10_amd64.deb` (sha256
`cc200c042a1aba282e8652c35b121a862b9e009ddf3ed1cd7521180737e76c1b`): package verification,
install, upgrade, and stale-file removal pass; installed browser smoke passes 15/15 on the
native host. Two environment notes: the host lacks `xvfb-run`, so the orchestrated smoke exits
before the wrapper phase there; in the dev container the served browser leg hits the F-05
container PTY failures and aborts before the wrapper phase. The wrapper phase was therefore run
standalone in the container with `xvfb`+`xauth`+`dbus-x11` installed: **passed**
(`Verified installed Linux wrapper lifecycle` — single controller, reload keeps the session,
relaunch shows the workbench, secondary instance reuses, graceful/forced close and crash-prompt
paths all clean). Hosts running the full smoke need `xvfb xauth dbus-x11`
(`install-dev-deps.sh` covers them).
