# Audit goal: Establish served-workbench durability, latency, and feature evidence

## Prerequisites

- [Plan 04](../04-DURABILITY-PERFORMANCE-AUDIT.md) is the binding audit contract. This goal executes
  it; it does not reinterpret it. [Plan 05](../05-DURABILITY-PERFORMANCE-IMPLEMENTATION.md) is
  provisional until this audit revises it.
- Goals [00–04](_completed/) are complete and supply the served host, durable state, terminals, and
  wrapper under audit. [Execute goal 05](execute-goal-05.md) remains open on its own evidence
  requirements; per `04-DURABILITY-PERFORMANCE-AUDIT.md:26-27` it stays open while audit work
  proceeds, and missing installed-platform evidence is recorded as missing, not counted as passing.
- This goal owns `../research/04-…06-*.md`, the research index, the audit revision of plan 05, and
  audit test/harness additions under the collected test locations named in
  `04-DURABILITY-PERFORMANCE-AUDIT.md:42-54`. It does not own product source; any test-harness edit
  that collides with in-flight work is coordinated before commit.
- One audit executor owns the finding register and the plan-05 revision end to end
  (`04-DURABILITY-PERFORMANCE-AUDIT.md:28-29`).

### Needed from the owner before starting

The audit can begin on this machine immediately; these items decide whether it can be declared
*complete* rather than whether it can run. Answer them now or let the audit record the gaps.

| # | What | Why it needs you |
| --- | --- | --- |
| 1 | Approval to spawn fixture-owned processes, disposable projects, and a separate test configuration and keeper namespace on this machine | The audit injects crashes and signals; it must never touch the owner's live host, keeper, or real projects (`04-DURABILITY-PERFORMANCE-AUDIT.md:22-24`) |
| 2 | A native macOS test environment for installed-wrapper and lifecycle evidence, or a recorded gap | A Playwright WebKit run is not native Tauri evidence (`04-DURABILITY-PERFORMANCE-AUDIT.md:24-25`) |
| 3 | A representative protected-network remote route (for example Tailscale), or a recorded gap | Loopback and synthetic shaping cannot establish remote typing behavior (`04-DURABILITY-PERFORMANCE-AUDIT.md:132-134`) |

## `/goal` objective

This goal delivers the audit defined by `../04-DURABILITY-PERFORMANCE-AUDIT.md:1-210` — the
ownership trace (A1, `:59-80`), the durability matrix (A2, `:81-107`), the end-to-end latency
measurement (A3, `:108-142`), and the interaction/security coverage matrix (A4, `:143-177`) — and
the mandatory handoff (`:179-199`).

Everything in the durability/performance arc is blocked on this goal: plan 05's implementation
packets cannot start until the finding register, attributed latency baseline, and revised gates land.
Done badly — inventories instead of evidence, cross-machine clock subtraction, unmeasured claims —
it produces a plan that looks executable and is not.

## Required outcome

When the work is complete, the repository must have:

1. `../research/04-terminal-reliability-audit.md`: the actual process tree and per-operation owner
   map (start, input, output, resize, detach, reconnect, exit, explicit close), the executed
   durability matrix with an observed result and evidence reference per row, the finding register,
   authority conflicts between current code and owner direction, and durable-session design
   recommendations;
2. `../research/05-terminal-performance-baseline.md`: recorded environment (source revision, asset
   build, binary version, OS, browsers, test configuration), the presentation measurement method
   and its error, per-leg latency attribution, p50/p95/p99 distributions with sample counts, the
   candidate-gate assessment, and recommended experiments;
3. `../research/06-feature-coverage-matrix.md`: every capability-by-platform row carrying a real
   production-path test result, a bounded manual procedure with evidence, or an explicit coverage
   gap — including a verified current status for each previously reported symptom (left-click
   file/folder activation, watcher races, picker overflow, remote project selection, persistent
   banners, stale-controller rejection, duplicated pasted input, misleading detached state, and the
   blank-editor collapse fixed in `2b58d97`);
4. an updated `../research/README.md` document map listing reports 04–06;
5. a revised `../05-DURABILITY-PERFORMANCE-IMPLEMENTATION.md` whose audit-revision table no longer
   reads "Pending": finding IDs mapped to packets, chosen changes, exact file ownership, fixed
   performance gates, regression tests, dependencies, deferrals, owner decisions, and a dated
   revision note recording source revision and evidence links;
6. audit harness and regression additions committed under the collected locations in
   `04-DURABILITY-PERFORMANCE-AUDIT.md:42-54`, green on current code — a reproduction that fails on
   current source is recorded in its finding with the test's location and lands with its fix under
   implementation, never as a committed failing default suite; and
7. a finding register where every entry has an ID, severity (P0–P3 per `:194-196`), affected
   versions/platforms, reproducible steps, expected and actual result, evidence reference, cause
   confidence, test gap, and destination implementation packet — every finding carrying a fix,
   justified deferral, or owner decision.

## In scope

- **Failure-injection environment.** Owns disposable projects, the isolated test configuration and
  keeper namespace, and fixture-owned process identities. Prove isolation before any fault
  injection; all signals target fixture PIDs only.
- **Ownership and lifecycle trace (A1).** Owns the process/state maps and the answers to the
  boundary questions, each with code references and runtime evidence.
- **Durability matrix (A2).** Owns execution of every applicable row for thread terminals and
  project-terminal splits, including the ≥10 crash/reconnect repetitions and detached-output bounds.
- **Latency measurement (A3).** Owns the deterministic raw-mode fixture child, clock methodology,
  workload set, and controlled-RTT profiles. Measurement instrumentation stays isolated and changes
  no production behavior.
- **Coverage matrix (A4).** Owns the capability-by-platform matrix, test-quality review (can the
  existing test fail for the reported symptom, is it collected, do mocks bypass the boundary), and
  real-host Playwright extensions asserting observable results.
- **Plan revision and handoff.** Owns the finding register, the plan-05 revision, and the explicit
  ready/blocked statement for implementation.
- **Serialization.** No product source changes; the audit cannot conflict with runtime code, but
  shared test files and `docs/planning/` documents are coordinated with any concurrent goal.

## Required tests and evidence

At minimum, prove:

- the audit header in each report records `git rev-parse HEAD`, the asset build, binary version,
  OS, browser versions, and test configuration actually used;
- every applicable A2 row ran: refresh/tab close/browser crash/project switch, 30-second and
  5-minute network loss, server SIGTERM/SIGKILL/restart on a changed port, wrapper hide/close/quit/
  crash, launching-shell exit, lost acknowledgements with repeated reconnect, natural exit, explicit
  close, keeper death (disposable environment only), degraded-state writes, concurrent launches, and
  version mismatch — each with an observed result, not a code reading;
- gateway crash/reconnect repeated at least ten times; detached output beyond the replay limit
  shows bounded memory and explicit truncation; UTF-8/ANSI splits, alternate-screen programs,
  resize-while-disconnected, cursor/input modes, and an output/reconnect race each have results;
- every measured latency profile has ≥1,000 warmed input samples, three repeats, and p50/p95/p99
  with stall counts, at controlled 0/40/100/200 ms RTT without loss; jitter/loss and any real remote
  route are reported separately with actual RTT;
- input-to-visible-response uses the browser's monotonic clock and host phases use the host's
  monotonic clock, with no cross-machine subtraction; the presentation measurement method and its
  error are written down;
- workloads cover 1, 8, and 32 live terminals across up to four projects, foreground typing against
  seven busy background terminals, the retained 24-inactive-surface fixture, plain echo through a
  fullscreen TUI, and a 10 MiB ANSI burst concurrent with file-watch and Git refresh; idle CPU over
  60 seconds and settled memory after attach/detach cycles are recorded per process role;
- no capability row is blank: each has a real production-path test, bounded manual evidence, or an
  explicit gap, and each previously reported symptom has a run regression or a documented pass;
- all signals and cleanup target fixture-owned process identities; the user's live host, keeper,
  and projects are never restarted, killed, or attached; and
- `npm run check`, `npm test`, `npm run test:e2e:served`, `cargo test --workspace`,
  `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and
  `git diff --check` pass at handoff with audit additions included.

## Explicit non-goals

- Do not implement fixes, tune timeouts, or change product behavior to make a case pass; product
  failures are valid audit results.
- Do not restart, signal, or attach the owner's live host, keeper, terminals, or real projects.
  Keeper-death and reboot cases run only in a disposable environment.
- Do not commit a deliberately failing default suite; keep failing reproductions documented in
  their findings until the implementation packet lands them red-to-green.
- Do not add a second terminal backend, adopt tmux or another multiplexer, or attach arbitrary
  external processes; a recommendation to that effect is a report line plus an owner decision.
- Do not rewrite accepted ADRs, VISION.md, DESIGN.md, or human-owned decisions in place; record
  authority conflicts in the audit report for the owner.
- Do not add standalone scripts outside collected test locations, Windows work, release publishing,
  or public-Internet claims.
- Do not commit private transcripts, secrets, personal paths, or large trace archives; artifacts
  stay bounded and sanitized under the existing test-artifact policy.
- Do not declare the audit complete while mandatory evidence is missing; record the gap instead.

## Engineering constraints

- Follow repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md),
  [`DESIGN.md`](../../../../DESIGN.md), and
  [ADR 0010](../../../../adr/suite/0010-keep-terminal-sessions-below-server-lifetime_H.md). The
  keeper-below-server decision is authority; the audit tests whether the implementation holds it.
- Test additions go to the collected locations named in the audit plan
  (`packages/app/tests/served/`, existing unit/integration suites, existing performance fixtures);
  assertions observe real outcomes — file contents, reachable folder children, exact bytes received
  by the same terminal process — not dispatched events or mocked adapters.
- Preserve unrelated worktree changes. Use `apply_patch`, short one-line commits, and no coauthor
  tags. Reports and revisions commit incrementally; the finding register is the single source of
  truth and updates in the same commits as the evidence behind each finding.
- Report severity by impact, not fix size. An absent native or remote-route environment narrows the
  audit's declared coverage, never its honesty.

## Completion definition

The goal is complete only when every scoped capability row and durability case has evidence or an
explicit recorded gap, latency has an attributed baseline with documented method and error, the
finding register is complete and prioritized, plan 05 has been revised with its dated audit note,
the handoff states whether implementation is ready or names its remaining blockers, and the
repository gates are green.

If isolation cannot be proven before fault injection, a finding requires an owner architecture or
scope decision, or a mandatory environment is unavailable, stop and report the exact conflict or
recorded gap. Do not inject failures against unproven boundaries, decide owner questions by
default, or mark the audit complete on partial evidence — plan 05 inherits whatever this goal
certifies.
