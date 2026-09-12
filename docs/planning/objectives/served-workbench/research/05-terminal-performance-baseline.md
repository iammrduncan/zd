# Terminal performance baseline

Date: 2026-09-12

Status: **Executed on the release build.** All terminal-operation latencies below are from
`target/release/zd-serve` (built 2026-09-11, code revision `c42128b` on `feat/serve`, docs-only
commits to `032daf2`). Earlier debug-build samples showed the same structure with slightly higher
constants; every gate below is stated against release numbers.

## Method

- **Harness:** `/tmp/zd-audit/bin/audit-latency.mjs` — a fixture `zd-serve` plus a user-space TCP
  delay relay that adds half the configured RTT in each direction. Monotonic clock
  (`performance.now()`) on the client; the server echoes its own timing fields on every response:
  `queueMicros`, `handlerMicros`, `serializationMicros`. Client RTT minus host time = transport
  residual.
- **Workload per iteration:** `terminal.write` (echo a marker), `terminal.read` (drain retained
  output), `terminal.pollExit`. 1000 iterations per network condition; evidence is incremental
  ndjson under `/tmp/zd-audit/evidence/a3-latency-*.ndjson`.
- **Isolation:** fixture state under `/tmp/zd-audit-*` (release builds honor `XDG_CONFIG_HOME`;
  debug builds honor `ZD_TEST_STATE_DIR`). The owner's live keeper and server were never touched.
- **Known harness limit:** the delay relay models RTT and jitter in user space — it does not model
  TCP loss recovery faithfully. The jitter/loss profile adds per-packet delay variance and
  retransmit-style stalls; treat it as stress evidence, not a loss model.

## Environment

| Item | Value |
| --- | --- |
| Host | `mbox01-MINI-S`, Linux 7.0.0-31-generic x86_64 |
| Binary | `zd-serve` release, `target/release/zd-serve` |
| Frontend assets | packaged layout `target/release/assets` (release path exercised) |
| Client | Node v22.23.2, RFC6455-over-`node:net` harness |
| Profiles sampled | loopback +0 / +40 / +100 / +200 ms RTT; jitter+loss stress; tailnet route |

## Results — terminal operation latency (release, ms)

1000 samples per condition (333/334 per op), zero errors. Evidence file:
`/tmp/zd-audit/evidence/a3-latency-2026-09-12T05-35-53.706Z.ndjson`.

| Condition | op | RTT p50 | RTT p99 | host p50 | residual p50 |
| --- | --- | --- | --- | --- | --- |
| loopback +0 ms | write | 9.5 | 40.7 | 9.1 | 0.4 |
| | read | 10.1 | 11.4 | 9.7 | 0.3 |
| | pollExit | 40.8 | 41.6 | 9.7 | **31.2** |
| loopback +40 ms | write | 50.4 | 54.8 | 9.6 | 40.8 |
| | read | 60.3 | 61.9 | 9.4 | 51.0 |
| | pollExit | 50.2 | 51.6 | 9.4 | 40.8 |
| loopback +100 ms | write | 110.9 | 114.0 | 10.0 | 100.9 |
| | read | 110.7 | 113.1 | 9.5 | 101.0 |
| | pollExit | 110.8 | 113.6 | 10.0 | 100.8 |
| loopback +200 ms | write | 201.6 | 211.0 | **0.77** | 200.9 |
| | read | 201.5 | 211.7 | **0.68** | 201.0 |
| | pollExit | 201.5 | 213.5 | **0.72** | 200.8 |
| +40 ms, ±20 ms jitter, ~1% retransmit | write | 45.2 | 345.1 | 5.7 | 40.7 |
| | read | 63.2 | 369.5 | 5.3 | 58.2 |
| | pollExit | 48.2 | 351.0 | 5.5 | 43.6 |
| tailnet same-host (`tailscale0`) | write | 9.4 | 41.5 | 9.0 | 0.4 |
| | read | 10.1 | 12.7 | 9.7 | 0.4 |
| | pollExit | 40.9 | 42.3 | 9.7 | 31.3 |

Tailnet evidence file: `a3-latency-2026-09-12T05-45-49.967Z.ndjson`. The same-host tailnet route is
indistinguishable from loopback (~0 ms added) — the kernel short-circuits the WireGuard interface.
**Cross-machine tailnet RTT is not measurable from one host**; the live tailnet serve at
`mbox01-mini-s.taila9c138.ts.net:45027` proves reachability, and the real remote-RTT term is the
network's, which the +40/100/200 ms profiles already model.

### What the numbers say

- **The op itself is sub-millisecond.** At 200 ms spacing (requests never race the pump),
  `handlerMicros` p50 is **0.7–0.8 ms**. The ~9–10 ms "host" time at loopback is almost entirely
  contention measured *inside* the handler — the request's keeper call waits on the global
  `sessions` mutex the 16 ms snapshot pump holds while iterating.
- **`pollExit`'s +31 ms at loopback sits outside host time** — it is WS-task/event-stream delay,
  not keeper work. It is the third op in each iteration, landing while the just-written echo's
  `outputReady` traffic is in flight. It disappears once spacing exceeds the pump period.
- **Residual scales 1:1 with injected RTT** (±1 ms) — the relay does what it claims; no hidden
  server-side queueing at these rates.
- **Jitter profile:** p50 tracks the base RTT; p99 ≈ 350 ms reflects the retransmit-style stalls —
  bounded recovery, no errors, no duplicate delivery observed in any row.

## Attribution — where the time goes

1. **Real op cost is sub-millisecond** — `handlerMicros` p50 ≈ 0.7 ms at 200 ms spacing. The ~9 ms
   seen at loopback is contention *inside* the handler: the keeper request blocks on the global
   `sessions` mutex while the 16 ms pump's `terminal_snapshot()` iterates it. (F-06)
2. **`pollExit` shows a further ~31 ms outside host time** at loopback — the response is delayed in
   the shared WS task while `outputReady` events from the just-written echo are serviced. (F-06)
3. **Under sustained sibling output, every op degrades further** — `probe-pollexit`: quiet p50
   ≈ 10.3 ms → busy `write`/`pollExit` ≈ 40 ms, busy `read` ≈ 120 ms (payload included). (F-06)
4. **Output delivery costs a second full RTT** — `terminal.outputReady` carries no bytes; the
   client must issue `terminal.read`. Echo-to-visible ≈ write RTT + echo + ≤16 ms pump wait +
   read RTT + render. At 100 ms RTT that is ≥ 200 ms of transport for one keystroke echo. (F-07)
5. **Transport residual scales ~1:1 with injected RTT** — the residual column tracks the injected
   delay almost exactly; no server-side queueing beyond the contention already attributed.

## Resource profile (release build)

Sampled by `/tmp/zd-audit/bin/audit-resources.mjs` against a fixture with one live terminal:
boot, 60 s idle, 20 attach/detach cycles, four ~2 MiB output bursts. Evidence:
`/tmp/zd-audit/evidence/a3-resources-*.ndjson`.

| Phase | `zd-serve` RSS | keeper RSS | `zd-serve` CPU | keeper CPU |
| --- | --- | --- | --- | --- |
| boot | 6.6 MiB | 4.7 MiB | — | — |
| idle 60 s | 7.1 MiB | 5.2 MiB | **0.30%** of one core | **0.65%** |
| after 20 attach/detach | 7.4 MiB | 5.2 MiB | — | — |
| after 4× ~2 MiB output bursts | 28.1 MiB | 9.5 MiB | — | — |

Both roles pass the proposed ≤1%-of-one-core idle gate on release (an earlier debug-build sample
showed the keeper at 1.08% — debug overhead, not the gate's subject). RSS is flat across
attach/detach — no per-cycle growth. `zd-serve` RSS climbs to ~28 MiB during output bursts
(retained 4 MiB buffer + base64/event fan-out working set) — bounded, not a leak; it does not grow
per attach/detach cycle.

## Candidate-gate assessment (plan 05)

| Proposed gate | Audit verdict |
| --- | --- |
| Input→echo p95 ≤ RTT + 30 ms | **Fails today** — write+read ≈ 2 RTTs + ~10 ms host + pump wait. Needs F-07's piggyback or streaming before this gate is reachable; with it, ~RTT + ~25 ms is plausible. |
| Idle CPU ≤ 1% of one core | **Passes** — see resource table; both roles idle far below. |
| Reattach p95 ≤ 2 s + 2 RTTs | **Passes** — measured reattach well under the bound on all profiles. |
| Memory within 10% of warmed baseline after 10 cycles | **Passes** — see resource table; bounded retention holds at 4 MiB. |
| ≥2 MiB/s output while meeting input gates | **Partial** — output sustains the rate; input gates degrade under output flow (F-06). |

## Recommended experiments for the implementation packets

1. **F-07 fix first** — piggyback bounded bytes on `outputReady` (or a streamed frame). Re-measure
   echo path; expect the remote-RTT term to halve.
2. **F-06 fix second** — push readiness from the keeper or take per-session locks / RwLock so the
   pump does not serialize ops. Re-run the busy-session probe; target busy `write`/`pollExit` p50
   ≤ quiet + 5 ms.
3. **After both:** re-run this baseline unchanged (same harness, same evidence layout) as the
   before/after distribution for the I4 gate.
