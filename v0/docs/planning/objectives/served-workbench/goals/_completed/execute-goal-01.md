# Execute goal 01: Preserve host identity and work across ports and restarts

## Prerequisites

- [Execute goal 00](execute-goal-00.md) is complete. This goal needs its Tauri-free
  `HostService`, authenticated protocol, client adapter, request correlation, and real-host browser
  harness.
- The owner may not release this goal as served editing. It makes state durable while project files
  remain read-only through the served adapter.
- This goal is serialized with goals 02–05. They share `packages/host/`, `packages/server/`,
  `packages/app/src/platform.ts`, Cargo metadata, and the real-host harness.

### Needed from the owner before starting

Nothing. This goal can start as written. Stable opaque identities and host-owned durable recovery
are already required by VISION, DESIGN, ADRs 0005/0006/0008, and work packet 1.

## `/goal` objective

This goal delivers the persistence and identity half of work packet 1 from
[`02-DELIVERY-PLAN.md:29-41`](../../02-DELIVERY-PLAN.md#work-packet-1-durable-file-and-git-authority).

Make a served workbench independent of its browser origin before enabling writes. Starting the same
approved project on a different loopback port or in a new process must reuse its opaque project and
root-worktree identities and restore its validated preferences, workbench snapshot, drafts, and
review ledgers. The frontend remains the only workbench transition owner; Rust stores records and
applies closed persistence mutations.

## Required outcome

When the work is complete, the repository must have:

1. a Tauri-free persistence module under `packages/host/src/` that uses a caller-selected platform
   configuration directory, versioned schemas, atomic sibling-file replacement, bounded record
   discovery, and cross-process coordination instead of origin storage or a new database;
2. an identity catalog that assigns operating-system-random opaque project/worktree IDs, reuses them
   for the same canonical roots across processes, preserves a project ID through trusted root
   recovery, and never treats a persisted root as current session authority without an explicit
   launch, picker, open, or structured worktree approval;
3. host-owned recent workspace records keyed by stable project identities, moved out of
   `packages/tauri/src/workspaces.rs`, with the existing 20-workspace and 32-project bounds and
   Tauri wrappers calling the shared implementation during migration;
4. one closed durable-state contract for a versioned preference snapshot, a versioned
   `WorkbenchState` snapshot, file drafts, and review ledgers, scoped so a one-project served launch
   cannot load or disclose records for an unapproved project;
5. exact protocol operations `state.describe` and `state.apply`, where `state.describe` returns one
   revisioned session-scoped bundle and `state.apply` accepts only preference replacement,
   workbench-snapshot replacement, draft put/remove, or review-ledger replacement; an expected
   revision conflict must return a typed reload-required outcome rather than silently overwrite;
6. a `DurableStateAdapter` below `packages/app/src/platform.ts` that loads state before the first
   state-dependent render, keeps synchronous feature reads backed by validated in-memory state,
   batches writes, reports persistence failure without undoing the live session, and flushes on
   teardown;
7. a one-time migration on the current Tauri origin that reads the existing versioned preferences,
   drafts, and review keys, writes their validated equivalents through host persistence, and removes
   each legacy key only after the host confirms it; malformed or failed records remain untouched and
   produce a bounded local notice; and
8. a real browser-to-Rust restart test that writes durable records through the authenticated
   protocol, stops the host, starts the same project and state directory on a different port, and
   proves that stable IDs and records return without using cookies, browser persistence, or a URL
   credential.

## In scope

- **Host persistence.** Owns new cohesive modules under `packages/host/src/`, host Cargo
  dependencies, and focused host tests. Reuse the existing atomic-write behavior; do not keep one
  implementation in Tauri and another in the host.
- **Stable grant identities.** Owns `packages/host/src/grants.rs`, `service.rs`, and their tests. A
  catalog may remember canonical roots at rest, but a session grant set contains only roots approved
  for that process.
- **Durable workbench records.** Owns the persistence-facing parts of
  `packages/app/src/workbench/preferences.ts`, `settings-preferences.ts`, `state-codec.ts`,
  `boot.ts`, `current-file/drafts.ts`, and `review.ts`, plus narrowly named modules and their existing
  unit suites. Keep parsing and state transitions in TypeScript.
- **Migration adapters.** Owns the temporary Tauri persistence commands/wrappers and the served
  protocol/client adapter. These are migration paths to one host implementation, not permanent
  parallel storage owners.
- **Evidence.** Owns host/server contract fixtures and an extension of
  `packages/app/tests/served/`. Test-only constructors may select a temporary state directory; an
  ordinary browser request may not.
- **Serialization.** Goals 02–05 must not edit or commit these shared integration files while this
  goal is in flight.

## Required tests and evidence

At minimum, prove:

- the same canonical project opened through two fresh host services reuses both project and root
  worktree IDs, while two different roots never collide and IDs do not encode a path or monotonic
  counter;
- trusted recovery can move a missing project to a new canonical root without changing its ID, but
  ordinary socket input cannot submit a root, recover a grant, enumerate the catalog, or activate a
  persisted workspace;
- a corrupt, oversized, unknown-version, duplicate-identity, path-colliding, or partially written
  catalog fails closed and is not overwritten by a default; a valid older fixture either migrates
  explicitly or returns a named unsupported-schema result;
- concurrent host processes serialize catalog/state changes so one successful write cannot erase
  another; a stale durable revision is refused and the current revision is returned without record
  contents;
- preference and workbench records are at most 1 MiB each; one draft is at most the existing 8 MiB
  editable-file limit; one review ledger is at most 1 MiB; discovery retains at most 256 drafts and
  256 review ledgers, with total retained draft/review payloads capped at 64 MiB and 16 MiB;
- durable records are atomic: an injected failure before rename leaves the prior complete record,
  no successful response precedes durable replacement, and stale temporary files are ignored and
  bounded;
- session-scoped load returns only records whose project/worktree IDs are in the active grants and
  contains no canonical root in ordinary errors, diagnostics, or pre-authentication traffic;
- current Tauri workspace tests pass through the shared host implementation, and legacy browser
  keys are removed only after confirmed import; a failed or malformed key remains available for
  recovery and cannot poison valid records;
- a new browser origin restores theme/settings, a workbench snapshot, one draft, and one review
  ledger from Rust before mounting their consumers, while `localStorage` and `sessionStorage` remain
  empty in the served page;
- the served capability manifest advertises `durableState: "read-write"` but still advertises file
  writes, mutations, Git, watchers, and terminals as unavailable; the real editor therefore remains
  read-only in this goal;
- the different-port restart test uses a new Rust process, preserves the request/response timing
  contract, and leaves the process secret absent from persisted files and browser state; and
- `npm run check`, `npm run test:e2e:served`, `cargo test --workspace`,
  `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and
  `git diff --check` are green, with exact counts and selected limits recorded in the summary.

## Explicit non-goals

- Do not enable served file editing, file mutation, Git, worktrees, theme-file discovery,
  diagnostics, watchers, or terminals; goal 02 or 03 owns those capabilities.
- Do not make Rust a second workbench transition owner or serialize live editor buffers, terminal
  process objects, DOM state, credentials, or diagnostic contents.
- Do not expose a generic key/value, filesystem-path, SQL, command, argv, environment, catalog-list,
  or arbitrary migration method on the protocol.
- Do not derive stable IDs directly from paths, use grant IDs as authentication, or auto-authorize
  every root remembered by the catalog.
- Do not silently reset, quarantine-and-continue, or overwrite an unknown/corrupt schema. Preserve
  the bytes and return a specific unavailable result.
- Do not add cloud synchronization, accounts, encryption-at-rest claims, multi-controller merging,
  or cross-device preference semantics.
- Do not change the default Tauri launch topology or package an installed `zd serve` command.

## Engineering constraints

- Follow the repository `AGENTS.md`, [`GOOD_ENGINEERING_H.md`](../../../../../GOOD_ENGINEERING_H.md),
  [`DESIGN.md`](../../../../../DESIGN.md), and accepted ADRs 0005, 0006, and 0008. Write a failing
  regression first for every discovered error and make small green commits.
- Keep handwritten production files below 500 lines when practical; decompose the existing storage
  and integration owners by responsibility instead of adding another oversized facade.
- Use standard filesystem operations plus the narrowest existing or audited dependency needed for
  cross-process locking and opaque IDs. Do not add SQLite, an embedded database, or a migration
  framework for four record families.
- Bound serialized byte length before allocation/write and bound directory enumeration before
  decoding records. Validate at the Rust trust boundary and again in the TypeScript owner that knows
  the product schema.
- Keep persistence errors content-free. They may include record kind, schema version, revision, and
  stable IDs; they must not include source text, comments, preferences, secrets, or canonical roots.
- Preserve unrelated dirty worktree changes. Use `apply_patch` for edits, short one-line commits,
  and no coauthor tags.

## Completion definition

The goal is complete only when stable opaque grant identities and all recovery-critical non-runtime
work survive a fresh Rust process and different browser port; every persisted record is versioned,
bounded, atomic, conflict-aware, and scoped to active grants; the current Tauri path delegates its
workspace/state persistence to the same host code; a real served browser restores state without
origin storage; file authority remains read-only; and every required gate is green.

If preserving current work requires exposing arbitrary state keys, loading unapproved roots, making
the server own frontend transitions, accepting silent data loss on corrupt/migration failure, or
raising an unbounded protocol payload, stop and report the exact conflict. Do not enable editing to
make persistence look exercised; goal 02 depends on this recovery boundary being trustworthy first.
