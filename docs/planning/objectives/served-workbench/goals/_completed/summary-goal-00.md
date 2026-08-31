# Summary — goal 00: Open a real project read-only through a served zd host

**Completed:** 2026-08-31  
**Commits:** `f37f388`, `5eba738`, `3693311`, `bfa5845`, `d4938c2`, `ca65c52`,
`477388e`, `858064d`  
**Goal file:** [`execute-goal-00.md`](execute-goal-00.md)

## Action needed from the owner

Nothing in this summary needs you. The accepted loopback, single-controller, shared-host direction
was sufficient to complete the read-only walking skeleton, and no later product choice was pulled
into this goal.

## What was delivered

1. `packages/host/` is a public Tauri-free Rust library that owns project approval, grant-scoped
   resource resolution, bounded tree snapshots, and bounded file reads. The Tauri handlers call
   this library instead of retaining another implementation.
2. `packages/server/` owns a loopback HTTP/WebSocket server and the experimental entry point used by
   `npm run app:serve -- <folder>`. It retains the port-zero listener, serves only built application
   assets, and prints its credential-free URL separately from its process secret after readiness.
3. Protocol version 1 has closed authentication, response, error, and request envelopes. Its method
   set is exactly `session.describe`, `projectGrants.list`, `fileTree.snapshot`, and
   `file.readBounded`, with a read-only capability manifest.
4. The frontend now composes `WorkbenchHost` and `ClientShell` below `platform.ts`. The served
   adapter uses the shared workbench, forces all text reads to non-writable, and reports packet 0
   exclusions as unavailable.
5. The served unlock page sends the process secret only in the first WebSocket frame. One
   controller is admitted, and no project state is sent before authentication succeeds.
6. Every protocol response correlates the request ID and bounded host queue/handler durations. The
   browser records its own monotonic round trip and derives transport residual without comparing
   clocks on different machines.
7. `packages/app/tests/served/` starts the real Rust executable with a temporary approved project.
   Chromium opens its real file, proves the buffer and disk remain unchanged, exercises visible
   refusal paths, checks credential handling, and cleans up the server and fixture.
8. [The internal served-host guide](../../../../../_internal/served-host.md) records same-machine
   and SSH-forwarded developer commands, the credential flow, current exclusions, verification
   command, and selected resource limits without claiming a packaged command.

## What I got wrong

The first repository-wide gate did not pass cleanly even though the focused feature tests did:

- Adding the root Cargo workspace made ESLint traverse generated `target/` JavaScript. The lint
  scope now excludes that build-output directory.
- The macOS installer tests invoked the system `ditto` command and failed on Linux. Their harness
  now places a functional fake `ditto` in a test-local `PATH`, so the installer contract remains
  tested without depending on the host operating system.
- Strict workspace Clippy exposed Tauri-only forwarding reexports and platform-specific dead code.
  The wrappers now import the shared host implementation directly, and macOS-only code is compiled
  only on macOS or where its unit tests require it.

Without these corrections, focused served-host evidence would have hidden a failing full repository
gate and a redundant native forwarding module.

## Traps worth knowing

- A Linux Tauri check needs the GTK/WebKit development libraries and `pkg-config`; these were absent
  from the execution image and were supplied in a local toolchain prefix. This did not add a product
  dependency or change the repository contract.
- The real-browser target needs Playwright Chromium. The first run found no installed browser; the
  browser was installed locally and the unchanged target then passed.
- The anti-slop structure checker compares Playwright files with Vitest collection and therefore
  reported 63 uncollected-test findings. The served spec is explicitly collected by
  `playwright.served.config.ts` and passed in the real Playwright run. The Oxlint anti-slop plugin is
  not installed in this repository, so code judgment remained manual; no machine-clean claim is
  made for those rules.
- The server accepts a numeric-loopback Host/Origin port that differs from its bound port. This is
  required for SSH local forwarding and is not permission to trust forwarding headers.

## Evidence

| Check | Result |
| --- | --- |
| `npm run app:serve -- .` | Printed `http://127.0.0.1:<ephemeral-port>/` without a credential, printed the secret separately, returned `204` from `/healthz`, and stopped cleanly on `Ctrl+C`. |
| `npm run check` | Passed type checking, lint with 10 pre-existing non-blocking max-lines warnings, 847 Vitest tests in 94 files, 5 skipped tests in 1 skipped file, and version synchronization. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed for the host, server, and Tauri workspace with warnings denied. |
| `cargo test --workspace` | Passed 219 Rust tests: 16 host, 16 server, and 187 Tauri/shared-boundary tests. |
| `cargo fmt --all -- --check` | Passed. |
| `npm run test:e2e:served` | Built the production app and Rust server; 1 Chromium real-host test passed. |
| Real browser assertions | Rendered the temporary tree, opened `notes.md` through Rust, kept the editor and disk read-only, created no local draft, refused mutation/Git/watch/terminal/picker/recent/root operations, and returned `404` for `/notes.md` over HTTP. |
| Credential assertions | The secret was absent from the URL, requests, console messages, cookies, `localStorage`, and `sessionStorage`; no grant or path preceded successful authentication. |
| Host and protocol negatives | Refused missing/non-directory roots, traversal, absolute targets, symlink escapes, mismatched grants, invalid Host/Origin/forwarding headers, wrong or late authentication, unknown fields/methods, oversized messages, and a second controller. |
| Correlation and limits | Preserved request IDs; bounded each reported host duration to 60 seconds; capped messages at 64 KiB, pending requests at 32, and retained timing records at 128. Tree defaults are 20,000 entries, 256 ignored entries, and depth 64; file reads are 8 MiB with a 64 KiB preview. |
| Documentation anti-slop prose check | Reported 0 findings; manual review tied operational claims to commands, constants, source boundaries, or executable tests. |
| `git diff --check` | Passed before each commit and at closeout. |

## What this unblocks

- Work packet 1 can move file mutation, Git, durable state, and stable identities onto the proven
  host/protocol boundary.
- Later streaming work can extend one authenticated socket instead of inventing a separate terminal
  or watcher channel.
- The desktop wrapper can eventually supervise the same executable after native authority has moved
  fully below the host boundary.

## What remains blocked

- Served editing and Git remain blocked on work packet 1's durable authority and state migration.
- Watchers, PTYs, and reconnect remain blocked on stable identities and durable state.
- Tauri wrapper cutover remains blocked until all native authority is available through the host.
- Installed `zd serve` and release claims remain blocked on cross-platform packaging evidence.
