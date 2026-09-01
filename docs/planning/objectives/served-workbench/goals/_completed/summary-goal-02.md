# Summary — goal 02: Edit files and inspect Git through the one host

**Completed:** 2026-08-31

**Commits:** `9a15bad`, `9c988df`, `6b1a40a`, `8aeeca3`, `b4afad6`, `02ad6f1`,
`eaf87e8`, `27250cb`, `43c2d54`, `14f2154`, `c736601`, `60da5c7`, `d669912`,
`28dc0a3`, `cc1b799`, `797c41c`, `270c2d7`, `65c62d4`, `2a9dbce`, `612040d`

**Goal file:** [`execute-goal-02.md`](execute-goal-02.md)

## Action needed from the owner

Nothing. The current developer target starts on the remote host with `npm run app:serve -- .`; open
the printed host URL in a browser. The client needs no SSH tunnel, forwarding command, helper,
extension, native application, or network-specific setup. Goal 04 still owns stable installed
`zd serve` dispatch.

## What was delivered

1. `zd-host` owns bounded text listing, reads, atomic writes, stamps, project-image reads,
   clipboard-image writes, and file-tree mutations. Tauri commands now adapt framework state and
   call the same host functions.
2. `zd-host` owns fixed Git status, history, comparison, and diff operations. It retains the
   established revision validation, entry/page limits, output limits, timeouts, rename handling,
   and grant resolution.
3. Structured worktree creation moved below `HostService`. It derives a sibling destination,
   disables hooks, validates the name/branch/base revision, and persists the new stable worktree
   identity before it reports success.
4. Validated direct `*.theme.config` discovery and opt-in diagnostic sessions moved below the host.
   The Settings UI now calls them **Host diagnostics**, which is accurate for both a local Tauri
   client and a remote browser.
5. Protocol version 1 exposes the exact closed goal 02 methods and advertises their access in a
   16-entry capability manifest. Watchers, terminals, project picking, recent workspaces, and other
   roots remain unavailable.
6. Text and raster data use bounded base64 fields. Both peers enforce a 64 MiB aggregate message
   limit before JSON decoding, while the product limits remain 8 MiB for text and 16 MiB for each
   image. Raster data is not sent as JSON number arrays.
7. Blocking host requests use a four-permit queue and `spawn_blocking`. Response timing separates
   queue, handler, and serialization work, and serialization does not run on the async socket
   executor.
8. Each eligible protocol request can write one privacy-safe diagnostic span after the owner opts
   in. Records use validated request/method tokens and timing classes; they contain no source text,
   path, credential, preference value, terminal data, or raw error.
9. The served `WorkbenchHost` adapter now uses the same editor, Files, Changes, worktree, theme,
   draft, review, and diagnostic feature contracts as Tauri. Transport and method names stay below
   the feature layer.
10. The real Rust/Chromium fixture now creates a temporary Git repository and host theme. It proves
    a disk save, no retained saved draft, create/rename, clipboard-image persistence, Git
    status/history/diff, host theme selection, diagnostic enable/record/disable, terminal refusal,
    project-file HTTP `404`, credential hygiene, and draft/review recovery after a new process,
    port, origin, and secret.
11. The served host now listens on all IPv4 interfaces by default and accepts an optional numeric
    `--bind` address. HTTP and WebSocket requests remain exact same-authority and reject forwarding
    headers, foreign or malformed origins, pre-authentication access, and a second controller.
12. The real served-browser fixture selects a non-loopback host address and connects directly. The
    Linux browser gate also now measures the intended macOS keymap, independent image-selection
    gestures, shipped font contracts, compact notation geometry, and stable editor-scroll targets.

## What I got wrong

- The first remote-access design kept the listener on loopback and required SSH forwarding. That
  contradicted the owner's actual contract: `zd serve` must run on any remote host and the browser
  must connect directly. ADR 0009 supersedes ADR 0008's loopback-only transport decision, and the
  server now uses a direct same-origin listener over the protected network the operator already
  chose.
- I treated the measured Linux gate repair as a new owner decision after the owner had already told
  me to continue and had corrected the product contract. The four-file repair was narrow and
  evidence-backed; stopping there added process without protecting scope.
- The goal 02 prerequisite link initially still pointed to the open-goal location after goal 01 was
  archived. The repository link test found it, and `c736601` points it to `_completed/`.
- The first real-browser rewrite expected a new Git file to be `added`. The actual fixed Git model
  correctly reports a file that has not entered the index as `untracked`; the assertion now checks
  that state.
- The first clipboard assertion searched the editor's text content for `Screenshot`. Rendered
  Markdown replaces the source with an accessible image widget, so the correct evidence is the
  visible `img`, the host-created PNG, and the saved Markdown bytes.
- The first host-theme selector used a partial accessible-name match and also selected every
  per-surface theme group. It now selects the exact global `Theme` group.
- After the nine measured Linux failures were repaired, the full run exposed two intermittent
  editor-motion failures. One was a setup trace that admitted the final two pixels of an earlier
  animation. The other was a real destination bug: a late selection scroll was misclassified as a
  document-height correction and shifted the reading anchor. A deterministic 70px regression
  failed at 69.83px before the fix and now lands within 0.5px.

## Traps worth knowing

- A stable identity catalog is not live authority. Worktree creation must add and persist the grant
  before returning, while remembered roots alone must not become accessible.
- A 16 MiB decoded image needs more transport space after base64 and JSON framing. Keep the product
  limit separate from the 64 MiB aggregate socket limit and enforce both sides.
- A rendered Markdown image does not appear in `.cm-content` text. Verify its accessible widget and
  the underlying saved source instead.
- Git `untracked` and `added` are distinct states. A create/rename flow does not stage the file.
- Automatic protocol diagnostics run only after the explicit host session is enabled. Disabling the
  session closes the writer before the disable request can record itself.
- The anti-slop structure checker selects `vitest.config.ts` as its only collection oracle and then
  reports all 63 Playwright specs as uncollected. The normal and served Playwright configurations
  do collect them, so that output is not a valid clean or failing repository-structure result.
- The line-boundary implementation is deliberately macOS-only, but its Playwright spec uses
  `ControlOrMeta`, which sends Linux `Ctrl+Arrow` word motion. Overriding `navigator.platform` to
  `MacIntel` before module load and sending `Meta+Arrow` exercised the intended keymap: all three
  heading/code/list probes moved monotonically and settled at their correct line boundaries.
- The image-drag spec starts its second pointer drag inside the range selected by its first drag.
  Linux Chromium treats that as a native move and relocates `Before ` to the end of the document.
  Collapsing the fixture caret between the three independent gestures preserved the exact source
  and produced forward `0..93` and backward `93..0` selections across the image.
- The bold-width test also asserts that the italic face has the regular face's width, although that
  claim is outside the test name and bold contract. Linux Chromium measured regular/bold at 95px
  and italic at 94px. The shipped faces all loaded and the separate pixel tests selected the correct
  outlines.
- At the 600px compact viewport, an 8px notation gap places the H6 marker 3px outside the surface.
  A read-only style probe measured a 5px gap at exactly 0px with the heading text edge still at 0px;
  4px left 1px of spare room. The narrow repair is a compact-only gap adjustment, not a change to
  the 72px inset or straight prose measure.
- A changed `scrollTop` does not say why it changed. A selection scroll leaves the target's document
  coordinate fixed, while an estimated-height correction moves that coordinate. Re-read the target
  only when another writer appears and translate the journey by the measured target shift, not by
  the raw scroll delta.
- Binding directly does not mean trusting a proxy. Same-authority Host and Origin validation stays
  meaningful because the browser reaches the host itself; forwarded request headers remain a hard
  refusal. Public-Internet TLS and proxy identity remain separate future decisions.

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | Passed type checking, lint with 12 existing non-blocking max-line warnings, 862 Vitest tests in 96 passing files, 5 skipped tests in 1 skipped file, and version synchronization. |
| `cargo test --workspace` | Passed 205 Rust tests across Tauri, host, server, and their integration suites. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed for the complete workspace with warnings denied. |
| `cargo fmt --all -- --check` | Passed. |
| `npm run test:e2e:served` | Built the production frontend and Rust server; both real-host Chromium tests passed. |
| Direct remote access | The fixture bound the server to a real non-loopback IPv4 address and Chromium unlocked through that URL. A manual host run also returned readiness and opened the workbench through its Tailscale address without a proxy or SSH tunnel. |
| Served editing evidence | Chromium changed `notes.md`, saved through Rust, observed the disk bytes, removed its saved draft, created and renamed a file, persisted a PNG, and rendered real Git status, one commit, and a before/working-tree diff. |
| Restart evidence | A fresh server process used another port and secret, reused the project identity, and restored host preferences, workbench layout, an unsaved editable draft, and its review comment with empty browser local/session storage. |
| Host theme and diagnostics | Chromium selected `served.theme.config`, enabled then disabled host diagnostics, and observed a stored `diagnostics.enable` span without the secret, file name, or document text. |
| Transfer and dispatch bounds | 8 MiB decoded text, 16 MiB decoded project/clipboard images, 64 MiB aggregate socket messages, and at most 4 concurrent blocking host jobs. Client and server boundary tests passed. |
| Protocol negatives | Rejected unknown methods/fields, invalid scopes/revisions/enums, path widening, encoding/type mismatches, oversized payloads, unsupported signatures, and excluded watcher/terminal/picker/root authority. |
| Normal Playwright target | All 435 Chromium tests passed in the complete two-worker target. The prior nine Linux failures and both later motion regressions passed in that run. |
| Focused motion repetition | The typewriter Enter trace passed 20 consecutive serial runs. The complete caret-return, scroll-easing, and typewriter group passed all 18 tests, including the deterministic competing-scroll case and the older estimated-height correction case. |
| Linux repair evidence | Mac platform emulation made every line-boundary sequence settle; collapsing the caret preserved the image source across all three drag directions; regular/bold widths agreed while separate tests selected the shipped italic outlines; the 5px compact notation gap kept the H6 marker inside the frame without moving its text edge. |
| Changed normal-browser evidence | The complete workbench foundation spec ran in the full target, including host-diagnostic wording; all of its tests passed. |
| Documentation and anti-slop checks | ADR governance and objective information-architecture checks passed. The prose checker reported 0 findings across changed documentation. The optional Oxlint plugin is not installed, so no machine-clean code claim is made; ESLint passed and a manual changed-test scan found no disabled, placeholder, tautological, suppression, or swallowed-error shapes. |
| Formatting and diff hygiene | Every changed file passed Prettier and `git diff --check`. The repository-wide formatter still reports nine unrelated pre-existing files, which this goal did not rewrite. |

## What this unblocks

- Goal 03 can now begin its watcher, PTY, reconnect, and cleanup work.
- The existing Tauri commands and served browser now exercise one non-streaming host authority.
- Goal 04 can later make Tauri supervise this same host without retaining a second filesystem, Git,
  theme, diagnostic, or durable-state implementation.

## What remains blocked

- Watch events, PTYs, reconnect sequencing, disconnect grace, and descendant cleanup remain goal 03.
- Stable CLI dispatch and the literal supervised Tauri wrapper remain goal 04.
- Cross-platform installed artifact evidence remains goal 05.
