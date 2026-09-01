# Summary — goal 02: Edit files and inspect Git through the one host

**Status:** Halted at a required repository gate on 2026-08-31

**Commits:** `9a15bad`, `9c988df`, `6b1a40a`, `8aeeca3`, `b4afad6`, `02ad6f1`,
`eaf87e8`, `27250cb`, `43c2d54`, `14f2154`, `c736601`, `60da5c7`, `d669912`,
`28dc0a3`

**Goal file:** [`execute-goal-02.md`](execute-goal-02.md)

## Action needed from the owner

One scope decision blocks formal completion of goal 02 and the start of goal 03.

| # | What | Why it needs you | Blocks |
| --- | --- | --- | --- |
| 1 | **Authorize a small Linux browser-gate repair outside goal 02's owned files, or provide a supported macOS run of the normal Playwright target.** The recommended choice is to authorize the repair because goal 05 must verify Linux. | The nine failing tests predate goal 02 and cover editor input, image selection, font metrics, and compact layout. The goal contract forbids silently widening its file ownership to repair them. | Moving goal 02 to `_completed/` and starting goals 03–05. |

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

The code and goal-specific evidence are complete. Formal goal completion is not delivered because
the required normal Playwright target is not green in this Linux environment.

## What I got wrong

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
- I expected the normal Playwright target to provide the final green gate. A full run and a serial
  rerun showed the same nine Linux failures. None of their source, test, configuration, or Node
  dependency files changed from goal 02's prerequisite commit.

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

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | Passed type checking, lint with 12 existing non-blocking max-line warnings, 862 Vitest tests in 96 passing files, 5 skipped tests in 1 skipped file, and version synchronization. |
| `cargo test --workspace` | Passed 205 Rust tests across Tauri, host, server, and their integration suites. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed for the complete workspace with warnings denied. |
| `cargo fmt --all -- --check` | Passed. |
| `npm run test:e2e:served` | Built the production frontend and Rust server; both real-host Chromium tests passed. |
| Served editing evidence | Chromium changed `notes.md`, saved through Rust, observed the disk bytes, removed its saved draft, created and renamed a file, persisted a PNG, and rendered real Git status, one commit, and a before/working-tree diff. |
| Restart evidence | A fresh server process used another port and secret, reused the project identity, and restored host preferences, workbench layout, an unsaved editable draft, and its review comment with empty browser local/session storage. |
| Host theme and diagnostics | Chromium selected `served.theme.config`, enabled then disabled host diagnostics, and observed a stored `diagnostics.enable` span without the secret, file name, or document text. |
| Transfer and dispatch bounds | 8 MiB decoded text, 16 MiB decoded project/clipboard images, 64 MiB aggregate socket messages, and at most 4 concurrent blocking host jobs. Client and server boundary tests passed. |
| Protocol negatives | Rejected unknown methods/fields, invalid scopes/revisions/enums, path widening, encoding/type mismatches, oversized payloads, unsupported signatures, and excluded watcher/terminal/picker/root authority. |
| Normal Playwright target | **Not green:** 426 of 435 tests passed. Nine failed in `fonts.spec.ts`, `images.spec.ts`, `line-boundary.spec.ts`, and `trailing-inset.spec.ts`. A serial run of those four unchanged files reproduced 9 failures and passed 18 tests. |
| Branch-causality check | `git diff --quiet 4abee23..HEAD` passed for the failed editor/design sources and tests, Playwright config, `package.json`, and `package-lock.json`. Those tests last changed in `000fea9`, before goal 02. |
| Changed normal-browser evidence | The complete workbench foundation spec ran in the full target, including host-diagnostic wording; all of its tests passed. |
| Anti-slop checks | The optional Oxlint plugin is not installed, so no machine-clean code claim is made. ESLint passed, and a manual changed-file scan found no disabled tests, placeholders, unexplained suppressions, tautological assertions, or swallowed-error shapes. The structure oracle limitation is recorded above. |
| `git diff --check` | Passed at the halted-goal boundary. |

## What this unblocks

- The implementation is technically ready for goal 03's watcher, PTY, reconnect, and cleanup work.
- The existing Tauri commands and served browser now exercise one non-streaming host authority.

## What remains blocked

- Goal 02 cannot be archived while its required normal Playwright target is red.
- Goal 03 cannot formally start because goal 02 is its prerequisite.
- Goals 04 and 05 remain transitively blocked.
