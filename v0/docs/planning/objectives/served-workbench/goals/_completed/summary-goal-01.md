# Summary — goal 01: Preserve host identity and work across ports and restarts

**Completed:** 2026-08-31

**Commits:** `3a6908f`, `8e9f3fb`, `895a032`, `140f7cc`, `8f1c961`, `23bd751`,
`1d67cf8`, `b3954f9`, `3d0b0de`, `07a4332`, `e306197`, `3637828`, `be78323`,
`d57bac2`, `4bf8886`

**Goal file:** [`execute-goal-01.md`](execute-goal-01.md)

## Action needed from the owner

Nothing. This goal keeps served files read-only and does not pull the editing, Git, streaming, or
desktop-wrapper decisions from later goals into the persistence layer.

## What was delivered

1. `packages/host/` now assigns random opaque project and worktree identities from a locked,
   versioned catalog. The same canonical roots reuse those identities across fresh services, while
   remembered roots do not become session grants. Trusted root recovery preserves the identities.
2. Recent workspaces now use the shared host implementation. The Tauri commands are wrappers over
   that implementation, including its legacy-root migration and the existing 20-workspace and
   32-project limits.
3. A host-owned durable store persists versioned preferences and per-project workbench snapshots,
   drafts, and review ledgers. It uses locked revision checks and atomic sibling replacement, and
   refuses corrupt, unsupported, oversized, duplicate, orphaned, or out-of-scope state.
4. Protocol version 1 now exposes only `state.describe` and `state.apply` for durable state. The
   mutation set is closed, conflicts return only the current revision, and descriptions include
   records from active project/worktree grants only.
5. The TypeScript `DurableStateAdapter` validates a loaded bundle, serves synchronous feature reads
   from memory, coalesces compatible writes, preserves live session changes after persistence
   failures, and flushes on teardown. Served and Tauri compositions use that same adapter.
6. Workbench boot loads host preferences before diagnostics and rendering, then reconciles and
   persists the workbench snapshot. File drafts and review ledgers use the same host state instead
   of origin storage.
7. The current Tauri origin has a one-time migration for legacy preferences, drafts, and reviews.
   A key is removed only after confirmed import; invalid or refused records remain in origin storage
   with a bounded local notice.
8. Read-only served buffers show a recovered draft for copying without enabling editing. This keeps
   recovery visible while Goal 02 still owns file-write authority.
9. The real-host Playwright fixture can restart the same project and isolated state directory in a
   new Rust process on a different port. The test proves a new secret, stable project identity,
   restored theme/settings/workbench/draft/review state, empty browser storage, and no persisted
   secret.

## What I got wrong

- The first restart fixture used `current-dark`, but the actual built-in theme identity is `dark`.
  The controller correctly fell back to `current-light`; the fixture now uses the real closed theme
  ID.
- The first review assertion searched inside the editor region for a header action that is its DOM
  sibling. The accessibility snapshot showed both the restored inline comment and action, and the
  test now selects the page-level accessible button.
- The first full frontend gate found one `prefer-const` error in the durable adapter test harness.
  The focused test still passed because it mutated the object's fields rather than rebinding it; the
  declaration is now immutable and the full lint gate is clean apart from existing max-line
  warnings.

## Traps worth knowing

- Stable identity is persistence, not authority. The catalog may remember canonical roots, but only
  a launch, native picker/open request, or structured worktree operation may add a live grant.
- The `--state-dir` server option is a trusted caller/test seam. Browser protocol messages cannot
  select it, enumerate its catalog, submit a root, or request migration.
- Durable preference state is global, while workbench snapshots, drafts, and review ledgers are
  project/worktree scoped. Their revisions therefore advance independently as `preferences` and
  `project` counters.
- A different loopback port is a different browser origin. Recovery must come from the host; copying
  `localStorage`, cookies, URL credentials, or process secrets would conceal a broken boundary.
- The anti-slop structure checker still treats Playwright files as uncollected because it compares
  them with Vitest collection. The real served spec is collected by
  `playwright.served.config.ts` and passed in Playwright. That heuristic is not recorded as a clean
  structure result.

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | Passed type checking, lint with 12 non-blocking max-line warnings, 860 Vitest tests in 96 files, 5 skipped tests in 1 skipped file, and version synchronization. |
| `cargo test --workspace` | Passed 254 Rust tests: 191 Tauri/shared-boundary tests, 45 host tests, and 18 server tests. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Passed for host, server, and Tauri with warnings denied. |
| `cargo fmt --all -- --check` | Passed. |
| `npm run test:e2e:served` | Built production frontend assets and the Rust server; both Chromium real-host tests passed. |
| Restart browser assertions | Used a fresh Rust process, different loopback port, and different secret; restored the same project ID, dark theme, disabled word wrap, open `notes.md`, its recovered draft, and its review comment. `localStorage` and `sessionStorage` remained empty. |
| Credential assertions | Neither process secret appeared in the persisted state tree. The restarted secret was absent from browser storage, and authentication still preceded project state. |
| Identity and authority negatives | Reused IDs for the same roots; prevented cross-root collisions; preserved IDs through trusted recovery; rejected corrupt, oversized, unsupported, duplicate, and path-colliding catalogs; and did not grant remembered roots. |
| Durable-state negatives | Refused stale revisions without returning record contents; serialized concurrent writers; preserved prior bytes on injected replacement failure; ignored bounded orphan/temp files; and filtered records outside active grants. |
| Selected persistence limits | Preferences and workbench snapshots are 1 MiB each; draft text is 8 MiB; review ledgers are 1 MiB; discovery retains at most 256 drafts and 256 ledgers, with 64 MiB and 16 MiB aggregate payload caps. |
| Recent-workspace limits | Retains 20 workspaces with at most 32 projects each; legacy roots migrate to stable project IDs without becoming grants. |
| Served capability boundary | Advertises durable state as read-write while file writes, file mutations, Git, watchers, terminals, theme files, diagnostics, picker, recent workspaces, and extra roots remain unavailable. |
| Documentation anti-slop prose check | Reported 0 findings across the goal, summary, objective index, and delivery plan. Manual review tied the summary claims to tests, commands, constants, or named source boundaries. |
| Anti-slop structure/code checks | The structure checker reported 63 Playwright specs as absent from Vitest collection, including the served spec that passed under its Playwright config, so no clean structure result is claimed. The optional Oxlint plugin is not installed; code judgment was manual. |
| `git diff --check` | Passed before each commit and at closeout. |

## What this unblocks

- Goal 02 can enable file and Git mutations without making an origin-bound draft the only recovery
  copy.
- Goal 03 can identify reconnect snapshots and terminal resources with stable project/worktree IDs.
- Goal 04 can move Tauri behind the same process boundary without losing current preferences,
  workbench layout, drafts, reviews, or recent workspaces when its origin changes.

## What remains blocked

- Served file editing, file mutations, Git/worktrees, theme discovery, and diagnostics remain Goal
  02 work.
- Watch events, PTYs, stream sequencing, disconnect grace, and reconnect snapshots remain Goal 03
  work.
- The stable installed CLI, supervised Tauri child, and removal of migrated invoke authority remain
  Goal 04 work.
- Cross-platform packaged release evidence remains Goal 05 work.
