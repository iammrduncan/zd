# Summary — goal 03: Keep watches and terminals coherent through reconnect

**Status:** Halted at the Windows completion gate on 2026-09-01

**Commits:** `44f06ac`, `8b2e552`, `2d49200`, `fae262c`, `93104f3`, `765d9ce`

**Goal file:** [`execute-goal-03.md`](execute-goal-03.md)

## Action needed from the owner

One item needs the owner. It blocks Goal 03 completion and the start of Goal 04.

| # | What | Why it needs you | Blocks |
| --- | --- | --- | --- |
| 1 | **Get a native Windows result for `cargo test --workspace`, or approve a contract change that moves this result to Goal 05.** | This Linux host cannot run the Windows Job Object descendant test. The goal says that a gated Windows test is not evidence on Unix. A contract change is an owner risk decision. | Goal 03 completion, Goal 03 archival, and Goal 04 |

## What was delivered

1. `packages/host/src/file_tree_watch.rs` owns bounded, approved-scope file watches. The host sends
   path-free scope signals and keeps the existing 150 ms debounce.
2. `packages/host/src/terminal/` owns structured PTY sessions. It applies session, input, viewport,
   output, and process-tree limits before native work starts.
3. Tauri watcher and terminal code delegates to the host owners. The repository does not have a
   second watcher or PTY implementation.
4. The authenticated socket carries closed watcher, terminal, snapshot, resume, and heartbeat
   methods. It also carries one versioned event envelope with an epoch and sequence.
5. The server retains a replay journal of no more than 1,024 events and 1 MiB of metadata. A gap or
   epoch change causes a full authoritative snapshot.
6. The protocol sends a heartbeat each 10 seconds. Three missed intervals use the disconnect path.
   In-flight host work also has a bounded deadline.
7. The host keeps watches and PTYs for a 30-second controller grace period. A valid reconnect uses
   the same resources. Grace expiry stops watches, terminates PTY process trees, and keeps terminal
   tombstones for the next snapshot.
8. The served client reconnects with bounded backoff and its memory-only secret. It resumes by
   epoch and sequence, or replaces runtime knowledge from a snapshot.
9. A page reload asks for the secret again and attaches the recorded terminal handle. It does not
   start a second shell.
10. The desktop terminal no longer replays accumulated input after a WebKit IME edit. The browser
    regression enters the reported text, sends an IME edit, and receives only the new character.
11. Rapid ArrowDown input now follows the live caret during an edge-return animation. The prior
    test setup also waits for the setup journey instead of passing after a line 3 to line 22 jump.
12. A post-grace terminal loss remains visible when a later viewport resize also fails. The surface
    reports the output loss and does not replace it with only an input error.

The Windows implementation and its native test are present. The test
`terminal::tests::disposal_terminates_the_session_job_and_its_descendant` is compiled only on
Windows and was not run on this host. Thus, item 10 of the required outcome is not fully satisfied.

## What I got wrong

- The first reconnect implementation authenticated against a sequence value taken before the
  server subscribed to events. A boot-time event could then fall between authentication and the
  snapshot. The server now subscribes first and returns the exact baseline sequence.
- I first treated the caret browser failure as a stale timing test. The corrected setup still failed
  in 3 of 10 runs. The active return used the caret position from the start of the journey. It now
  resolves the live caret when another scroll writer appears.
- The former caret test passed before the scroll-target fix for the wrong reason. Its first
  ArrowDown moved from line 3 to line 22 because the setup caret was still off-screen.
- The first final served run passed the host loss through the adapter but failed the UI assertion.
  A later resize error replaced the explicit loss message. A deterministic unit test reproduced
  the order before the surface fix.
- The first final served command used a non-login shell without the local Rust toolchain path. The
  frontend built, but no Rust or served browser test ran. The command was repeated with the explicit
  repository toolchain environment.
- I reached the closeout stage before I compared the available platform results with the goal's
  Windows stop condition. The Windows code and test do not replace a native Windows result.

## Traps worth knowing

- A socket sequence is a subscription boundary. Take the event subscription before the snapshot
  sequence, or a client can miss an event during unlock.
- A changed `scrollTop` does not identify its writer. A selection scroll keeps one target coordinate
  stable, but a height correction moves it. The scroll code measures the target after another writer.
- An edge-return target can move while the journey runs. Resolve the current caret, not the range
  that started the journey.
- A terminal tombstone must reach the terminal session after its output listener exists. The initial
  refresh supplies that state for a reattached project terminal.
- A later input or resize error must not erase a more specific terminal loss. The status surface can
  show the two facts together.
- Page reload does not persist the process secret. The user unlocks again, and the host can then
  attach the same live terminal during the grace period.
- The anti-slop structure checker reads the Vitest configuration as its only collection source. It
  reports Playwright files as uncollected although the normal and served Playwright runs collect them.

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | Passed type checking, lint with 16 non-blocking max-line warnings, 878 Vitest tests in 96 passing files, 5 skipped tests in 1 skipped file, and version synchronization. |
| `npm run test:e2e` | Passed all 436 Chromium tests in 7.5 minutes at `93104f3`. The later terminal-status change passed its 8 focused Chromium tests at `765d9ce`. |
| `npm run test:e2e:served` | Built the production frontend and Rust server. All 3 real-host Chromium tests passed in 46.0 seconds at `765d9ce`. |
| Real reconnect | The browser ran a shell probe, survived a socket interruption, kept the same shell PID, reloaded, unlocked again, and attached the same terminal session ID without another `terminal.start`. |
| Real post-grace loss | The browser closed, the shell PID stopped within the 30-second grace boundary, and a new unlocked page showed `Terminal output stopped unexpectedly.` |
| Terminal input replay | The focused browser test passed with one initial phrase and only the new IME character in the second write. |
| Caret navigation | The repaired test passed 10 consecutive runs. The caret, edge-return, easing, and typewriter group passed all 29 tests. |
| `cargo test --workspace` on Linux | Passed 216 Rust tests. This includes Unix shell child cleanup, watcher ownership, terminal bounds, replay journal bounds, grace cleanup, heartbeat, and socket security. |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed with warnings denied. |
| Windows descendant cleanup | **Not run.** The Windows Job Object implementation and native descendant test exist, but this host has no Windows runner. This unsatisfied result stops goal completion. |
| Secret and content boundary | Real browser checks kept the secret out of URLs, cookies, local storage, session storage, console messages, and persisted host state. Terminal commands and bytes stay outside durable state and diagnostics. |
| `git diff --check` | Passed at the halt point. |

## What this unblocks

- The Linux implementation is ready for direct remote use and for Goal 04 development after the
  prerequisite decision.
- The stable CLI and Tauri wrapper can reuse one bounded watcher, terminal, event, reconnect, and
  cleanup implementation.

## What remains blocked

- Goal 03 cannot move to `_completed/` until the owner supplies native Windows evidence or changes
  the goal contract.
- Goal 04 cannot start while its Goal 03 prerequisite is open.
- Goal 05 remains behind Goal 04.
