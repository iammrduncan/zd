# Summary — goal 04: Make Tauri a supervised client shell for `zd serve`

**Completed:** 2026-09-01

**Commits:** `6da5b7f`, `b9a3041`, `deec645`, `8be2144`, `aca1d9d`, `0bc5b65`,
`ab67cda`, `ad1cb83`, `02ef535`, `1454224`, `01b3be6`, `82e4d46`, `63c508b`,
`1c61f26`, `ac101a9`, `41bc075`

**Goal file:** [`execute-goal-04.md`](execute-goal-04.md)

## Action needed from the owner

Nothing. On 2026-09-01, the owner deferred native Windows execution to Goal 05. This summary does
not present Windows as tested. Goal 05 can now package and test the supported platform artifacts.

## What was delivered

1. The shipped `zd` executable owns one strict dispatcher. Desktop forms accept zero or one path.
   `zd serve [<folder>] [--bind <ip>] [--port <port>]` defaults to the current directory, all IPv4
   interfaces, and an operating-system-selected port.
2. Direct serve approves its initial root before listening, prints separate URL and secret lines
   after readiness, and stops on SIGINT or SIGTERM. It initializes no Tauri runtime.
3. A hidden wrapper-child mode in the same executable uses inherited standard input and output for
   bounded, versioned startup, readiness, control, and response records. The readiness secret does
   not enter arguments, environment variables, URLs, browser persistence, or ordinary logs.
4. The Tauri supervisor owns exactly one child generation. It drains both output pipes, enforces a
   10-second startup deadline, validates exact loopback readiness, and shuts down gracefully or
   force-terminates after 5 seconds. Every tested outcome reaps the child.
5. Tauri navigates the `main` webview only after validated readiness. The webview takes its secret
   through a one-use, exact-origin bootstrap and keeps it in memory.
6. The desktop shell now contains only viewing-computer behavior: trusted picker and native-open
   inputs, window presentation and focus, safe close, global summon, notifications and sound,
   external links, and recovery input. Each callable command checks the exact active child origin.
7. Trusted absolute paths remain between native code and the child control pipe. The child returns
   typed project grants or launch intents; ordinary browser protocol messages still cannot approve
   a root.
8. The single-instance plugin runs before every other Tauri plugin. A secondary desktop launch
   forwards one bounded path and working directory to the primary process without starting another
   host.
9. A ready child exit preserves the current workbench and shows an accessible disconnected state.
   The wrapper does not restart automatically. A failed or already exited startup can still close
   natively because no dirty workbench exists to guard.
10. All filesystem, file-tree, Git, worktree, watcher, persistence, diagnostic, theme, clipboard,
    workspace, and terminal implementations were removed from the Tauri crate. The frontend also
    has no legacy Tauri host adapter. Without the served bootstrap, host work fails instead of
    falling back to `invoke`.
11. The terminal regression covers both same-length and growing WebKit IME edits. It sends only the
    new input suffix and does not paste the hidden textarea's accumulated contents again.
12. Internal operator documentation now explains direct protected-network access, fixed-port use,
    readiness checks, one-controller behavior, desktop child topology, and failure diagnosis.

## What I got wrong

- De-registering the old Tauri handlers was not the same as removing the second backend. Dormant
  Rust modules and the frontend `invoke` adapter still implemented filesystem, Git, watcher,
  persistence, diagnostic, and terminal work. They are now deleted, and authority tests prove that
  the retired command names are absent.
- The first close guard prevented every native close request. A startup failure or ready-child crash
  then trapped the window because exact-origin shell calls correctly refuse those pages. The guard
  now defers close only while the supervisor is ready and a real workbench can own dirty-buffer
  confirmation.
- The first terminal replay regression covered WebKit replacing accumulated text with another value
  of the same length. The reported stacking behavior also needs the growing-value branch. The final
  test exercises decomposed Unicode input whose hidden value grows.
- The first Linux smoke command had a shell-quoting error before it launched the product. The
  corrected command ran in an isolated D-Bus/Xvfb session and produced the process evidence below.
- The repository-wide Prettier target still reports nine unrelated files that were already
  unformatted. Every file changed by this goal passed Prettier; the goal did not rewrite unrelated
  sources to make the global count green.

## Traps worth knowing

- Handler removal, capability removal, and source deletion are separate checks. Leaving any one of
  them behind preserves ambiguity about which backend owns host work.
- The single-instance plugin must be the first plugin. Otherwise a secondary launch can enter setup
  and create a host before arbitration runs.
- A child can block before readiness when its output pipe fills. Drain standard output and error
  from process start, even when their retained diagnostics are intentionally bounded and redacted.
- Static Tauri capability patterns cannot authorize a dynamic loopback port by themselves. Each
  shell command also needs a runtime check for the `main` label and the supervisor's exact origin.
- Native close is a workbench guard only in the ready phase. Failed, stopped, or disconnected pages
  cannot call the guarded close bridge and must remain closable.
- WebKit can report an IME edit as the hidden terminal textarea's entire accumulated value. Diff the
  prior and current values positionally; forwarding the complete value replays earlier terminal
  input.
- A direct bind is intended for an already protected private network. Exact Host and Origin checks,
  process-secret authentication, and refusal of forwarding headers do not make plain HTTP suitable
  for the public Internet.
- The anti-slop structure checker uses the Vitest configuration as its collection source and reports
  Playwright specs as uncollected. The normal and served Playwright runs are the collection evidence
  for those files.

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | Passed type checking, ESLint with 14 existing non-blocking max-line warnings, 864 Vitest tests in 95 passing files, 5 skipped tests in 1 skipped file, and version synchronization. |
| `npm run test:e2e` | All 436 Chromium tests passed in 7.6 minutes. This includes the two terminal replay branches and the complete workbench target. |
| `npm run test:e2e:served` | Built the production frontend and `zd`; all 3 real-host Chromium tests passed in 46.1 seconds. They cover real file/watch/shell work, controller-grace loss, and durable recovery in a new process and origin. |
| `cargo test --workspace` on Linux | Passed all workspace unit, integration, and documentation tests. The real-child suites cover foreground dispatch, private readiness, one-use bootstrap, trusted path approval, parent-channel loss, and listener cleanup. |
| Supervisor bounds | Executable fake-child tests rejected malformed, partial, and oversized readiness; reaped a silent child at the 10-second deadline; drained output beyond pipe capacity; preserved a ready crash without restart; and force-reaped an unresponsive child at the 5-second shutdown deadline. |
| Linux native wrapper smoke | In an isolated Xvfb/D-Bus session, primary PID 1861734 owned exactly one host PID 1861898. `/healthz` returned 204. A secondary launch approved a second project and exited while the same host PID remained. Terminating the primary reaped the host and closed its listener. |
| Direct protected-network smoke | A fresh current build listened on the host's Tailscale address. Headless Chromium loaded that non-loopback URL, submitted the separate secret through the unlock form, and reached `.zd-workbench`. The URL did not contain the secret. |
| Retired authority | Source and capability tests prove the served page cannot call retired filesystem, Git, watcher, terminal, persistence, theme, workspace, clipboard, or diagnostic-host Tauri commands. Deleting the socket leaves those features unavailable. |
| Secret boundary | Readiness validation requires one exact loopback origin and fixed-shape epoch/secret values. Browser tests keep the secret out of URL, DOM attributes, cookies, storage, console messages, and diagnostics. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed with warnings denied. |
| `cargo fmt --all -- --check` | Passed. |
| Documentation and anti-slop checks | Documentation information-architecture tests passed. The prose checker reported 0 findings across changed docs. ESLint and manual review found no disabled, placeholder, tautological, suppressed, or swallowed-error test shapes. |
| Formatting and diff hygiene | Every changed Markdown and TypeScript file passed Prettier, and `git diff --check` passed. The repository-wide formatter's nine pre-existing unrelated findings remain recorded rather than hidden. |
| Windows native execution | **Deferred to Goal 05 by the owner.** No Windows result was run or counted as Goal 04 evidence. |
| macOS native execution | Not run on this Linux host. Portable Unix lifecycle coverage ran on Linux; installed macOS wrapper and shell evidence remains a Goal 05 platform gate. |

## What this unblocks

- Goal 05 can package the final one-host executable and wrapper topology.
- Direct `zd serve` is ready for development use from a browser on a protected private network.
- The desktop application now consumes the same host protocol and no longer maintains a second
  filesystem, Git, watcher, persistence, diagnostic, or terminal backend.

## What remains blocked

- Installed macOS and Linux artifact evidence remains Goal 05 work.
- Native Windows process, wrapper, and package evidence is deferred to Goal 05 and remains
  unverified.
- Publishing user-facing install claims remains blocked until Goal 05 verifies the artifacts.
