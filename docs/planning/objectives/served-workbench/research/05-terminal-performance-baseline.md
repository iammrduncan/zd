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
- **Known harness limits:**
  - The delay relay models RTT and jitter in user space — it does not model TCP loss recovery
    faithfully. The jitter/loss profile adds per-packet delay variance and retransmit-style stalls;
    treat it as stress evidence, not a loss model.
  - Measurements are **protocol-level** (request send → response received, monotonic clock), not
    browser-visible render time. The presentation leg adds xterm write+render (~a few ms on this
    hardware, not separately instrumented here — the e2e suite covers render-path regressions, and
    the error term of this method is roughly one event-loop tick plus JSON parse of the response,
    ≈1–2 ms). Both client and host timings are monotonic clocks on the same machine; no
    cross-machine subtraction anywhere.
  - Three repeats per profile: the 1000-sample pass is repeat 1; repeats 2 and 3 ran at 334 samples
    each in a fresh fixture (`latency-repeats.log` / additional `a3-latency-*.ndjson` files).

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

| Condition | op | RTT p50 | RTT p95 | RTT p99 | stalls¹ | host p50 | residual p50 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| loopback +0 ms | write | 9.5 | 10.1 | 40.7 | 0 | 9.1 | 0.4 |
| | read | 10.1 | 10.2 | 11.4 | 0 | 9.7 | 0.3 |
| | pollExit | 40.8 | 41.3 | 41.6 | 0 | 9.7 | **31.2** |
| loopback +40 ms | write | 50.4 | 50.9 | 54.8 | 0 | 9.6 | 40.8 |
| | read | 60.3 | 61.5 | 61.9 | 0 | 9.4 | 51.0 |
| | pollExit | 50.2 | 50.8 | 51.6 | 0 | 9.4 | 40.8 |
| loopback +100 ms | write | 110.9 | 111.9 | 114.0 | 0 | 10.0 | 100.9 |
| | read | 110.7 | 111.3 | 113.1 | 0 | 9.5 | 101.0 |
| | pollExit | 110.8 | 111.6 | 113.6 | 0 | 10.0 | 100.8 |
| loopback +200 ms | write | 201.6 | 205.1 | 211.0 | 0 | **0.77** | 200.9 |
| | read | 201.5 | 209.6 | 211.7 | 0 | **0.68** | 201.0 |
| | pollExit | 201.5 | 203.8 | 213.5 | 0 | **0.72** | 200.8 |
| +40 ms, ±20 ms jitter, ~1% retransmit | write | 45.2 | 102.7 | 345.1 | 7 | 5.7 | 40.7 |
| | read | 63.2 | 103.2 | 369.5 | 6 | 5.3 | 58.2 |
| | pollExit | 48.2 | 87.8 | 351.0 | 11 | 5.5 | 43.6 |
| tailnet same-host (`tailscale0`) | write | 9.4 | 10.7 | 41.5 | 0 | 9.0 | 0.4 |
| | read | 10.1 | 10.4 | 12.7 | 0 | 9.7 | 0.4 |
| | pollExit | 40.9 | 41.9 | 42.3 | 0 | 9.7 | 31.3 |

¹ stall = a sample exceeding 2× injected RTT + 60 ms. Zero stalls on every clean profile; the
jitter profile's stalls are the injected retransmit-style delays landing — bounded recovery, zero
errors or duplicates in all 5000 samples.

Tailnet evidence file: `a3-latency-2026-09-12T05-45-49.967Z.ndjson`. The same-host tailnet route is
indistinguishable from loopback (~0 ms added) — the kernel short-circuits the WireGuard interface.
**Cross-machine tailnet RTT is not measurable from one host**; the live tailnet serve at
`mbox01-mini-s.taila9c138.ts.net:45027` proves reachability, and the real remote-RTT term is the
network's, which the +40/100/200 ms profiles already model.

## Session-count scaling and busy-background load (release, loopback)

`audit-scale.mjs`, 120 samples per op per level, evidence
`a3-scale-2026-09-12T05-59-39.954Z.ndjson`:

| Load | op | RTT p50 | RTT p95 | RTT p99 | host p50 |
| --- | --- | --- | --- | --- | --- |
| 1 session | write / read / pollExit | 10.3 / 10.2 / 10.2 | 42.0 / 11.6 / 11.6 | 42.5 / 14.1 / 12.6 | ~9.6 |
| 8 sessions | write / read / pollExit | 10.3 / 10.2 / 10.2 | 41.8 / 12.1 / 11.7 | 42.6 / 12.8 / 12.5 | ~9.6 |
| 32 sessions (cap) | write / read / pollExit | 10.7 / 10.2 / 10.2 | 45.4 / 12.6 / 12.4 | 52.7 / 16.3 / 13.1 | ~9.6 |
| 7 siblings flooding output | write / read / pollExit | 10.4 / 10.8 / 11.3 | 43.0 / 42.9 / 45.4 | 44.4 / 46.8 / **137.3** | ~9.3 |

- Session count is flat — the keeper scales to the 32-session cap without p50 regression; the cap
  itself is enforced (a 33rd `terminal.start` failed).
- Sibling floods don't move the foreground p50 but inflate the tail (pollExit p99 137 ms) — output
  event traffic on the shared socket/task delays responses occasionally, consistent with F-06.
- Keeper RSS grew ~13 MiB across the 7-flood phase (~2 MiB/session working set under flood).

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
| ≥2 MiB/s output while meeting input gates | **Passes on the render side** — release fixture sustains 2.44 MiB/s through the terminal renderer (`terminal-performance.spec`); input gates under output flow are the open half (F-06). |

## Recommended experiments for the implementation packets

1. **F-07 fix first** — piggyback bounded bytes on `outputReady` (or a streamed frame). Re-measure
   echo path; expect the remote-RTT term to halve.
2. **F-06 fix second** — push readiness from the keeper or take per-session locks / RwLock so the
   pump does not serialize ops. Re-run the busy-session probe; target busy `write`/`pollExit` p50
   ≤ quiet + 5 ms.
3. **After both:** re-run this baseline unchanged (same harness, same evidence layout) as the
   before/after distribution for the I4 gate.
