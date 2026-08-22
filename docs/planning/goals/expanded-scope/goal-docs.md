# Documentation Migration Goal

## Outcome

Repository context, architecture authority, contributor guidance, product documentation, website
copy, and active planning all describe one ZenSuite application named `zd`: a single agent
workbench. Historical prototype records stay available as history but cannot be mistaken for
current direction.

## Visual References

- [Approved overlap workbench](assets/workbench-light-overlap-v2.png) and
  [approved side-by-side workbench](assets/workbench-light-side-by-side-v2.png) are the current
  planning references for workbench composition and light-theme continuity.
- [Current reader](../../../user-facing-docs/assets/zd-reader.jpeg) and
  [current comments view](../../../user-facing-docs/assets/zd-comments.png) are retained-product
  evidence, not final workbench screenshots.
- [Current social card](../../../user-facing-docs/assets/zd-social-card.png) is migration input that
  must be replaced or regenerated from the implemented workbench before Phase B closes.

Planning concepts must be labelled as concepts anywhere they are published. Released-product docs
use verified screenshots from the implemented workbench. Apply the shared Visual Reference Contract
in `goal.md`.

## Settled Product and Platform Decisions

1. `ZenSuite` is the product-family and repository identity. The application, workbench, and
   command are named `zd`; product copy does not expand those letters into a longer name. ZenSuite
   names the product family, not a suite launcher or permission to add miniapps.
2. `zd md` is removed rather than retained as a compatibility alias. The supported launch forms are
   `zd`, `zd <folder>`, and `zd <file>`.
3. One running application process owns one root workbench window. Ordinary Dock, Spotlight, Start
   menu, or CLI activation uses that window normally. The global shortcut reuses the same window in
   a quick-access presentation that appears on the active display/Space and hides on repeated summon,
   Escape, or focus loss without closing work. The initial product does not create independent
   document windows.
4. `https://getzensuite.com` is the canonical website. Package and desktop copy use: “ZenSuite — a
   fast, local agent workbench for projects, threads, terminals, files, and Git.”
5. Retain the existing desktop bundle identifier, `com.zensuite.zd`, so the workbench inherits the
   current application identity, settings, and upgrade path.
6. The shared command registry owns these defaults on macOS / Windows: Focus
   `Cmd+Shift+F` / `Ctrl+Shift+F`; current-file Find `Cmd+F` / `Ctrl+F`; projects
   `Cmd+1`…`Cmd+9` / `Ctrl+1`…`Ctrl+9`; terminal/thread focus `Cmd+J` / `Ctrl+J`; command list
   `Cmd+Shift+P` / `Ctrl+Shift+P`; global summon `Cmd+Shift+Space` / `Ctrl+Shift+Space`.
7. `docs/planning/` is the sole active planning root. `docs/planning/objectives/` owns objective and
   session-loop state; `docs/planning/goals/` owns active cross-objective execution plans; and
   `docs/planning/ideas/` owns non-authoritative exploration.

## Acceptance Criteria

### Phase A: Authority and Implementation Context

Phase A is a sequential gate before feature fanouts begin.

1. Rewrite `docs/VISION.md` as a dated workbench vision that explicitly supersedes the `zd md` and
   growing-miniapp directions while retaining ZenSuite as the product-family identity.
2. Rewrite `docs/DESIGN.md` for projects, Threads, current-file Markdown/code, Files/Changes tabs,
   terminals, notifications, installable themes, responsive regions, and Focus Mode off by default.
   Preserve applicable typography, semantic token, accessibility, safety, and editor contracts.
3. Make `docs/README.md`, `VISION.md`, and `DESIGN.md` publish one identical authority order and
   naming contract, and point contributors to the active planning location.
4. Preserve accepted ADR history. Add successor ADRs and mark invalid records superseded rather
   than rewriting their original decisions in place. Re-index still-valid Markdown ADRs as
   current-file/editor decisions.
5. Replace the single-launch-workspace authority ADR with a least-privilege multi-project/worktree
   grant decision before Projects implementation. Preserve the platform boundary and atomic-save
   decisions that remain valid.
6. Decide and document the successor to suite/miniapp boot, ownership, and command-registration
   language. Keep the one-command-registry decision where it remains applicable.
7. Formally adopt `docs/planning/` or restore the previous objective paths. Update documentation,
   scripts, tests, release tooling, and session-loop/archive consumers together so one path is
   authoritative.
8. Replace or retire active contributor guidance such as `packages/app/src/miniapps/README.md` so
   no implementation agent is instructed to add another miniapp.

### Phase B: Released Product and Repository Completion

Phase B follows feature behavior and can be drafted in parallel, but it closes only after the
implemented workbench is stable.

9. Update the root README and user-facing tutorial, how-to, reference, architecture, install, and
   development pages. Public docs describe released behavior; unfinished workbench behavior is
   clearly labeled and never presented as available.
10. Update website home/layout copy, documentation fallbacks, SEO and JSON-LD metadata, keywords,
    site name, canonical domain, package metadata, and desktop metadata to the approved identity.
11. Update or regenerate the social card, screenshots, captions, and alt text from the actual
    workbench. Deterministic asset sources remain the owner of generated images.
12. Reconcile active goals and objective indexes with the pivot. Archive or supersede obsolete
    miniapp acceptance criteria without rewriting completed summaries, dated research, fixtures,
    or historical evidence.
13. Add a scoped stale-context check that rejects attempts to treat `zd` as an abbreviation,
    product-level `zd md`, and miniapp implementation framing in canonical, public, contributor,
    and active-planning files. Explicit naming-contract statements, labeled historical records,
    and literal compatibility tests use a reviewed allowlist. `ZenSuite` itself remains valid.
14. Audit source comments, UI copy, test names, package descriptions, Tauri CLI help, release
    workflows, and generated-site inputs for misleading current-product terminology.
15. Documentation links, information-architecture tests, objective/archive/session-loop tests,
    website build, CLI/title tests, package metadata checks, and relevant release checks pass.

## Terminal Condition

No authoritative, public, contributor, source-adjacent, or active-planning document gives a person
or agent a plausible instruction to add another miniapp, present `zd md` as the current product, or
present a spelled-out expansion for `zd`. Historical records remain discoverable and clearly
historical, and all generated and tested documentation uses ZenSuite for the product family and
`zd` for the application, workbench, and command.

## Dependencies

- Phase A uses the Workbench Reorganization Goal's product decisions and must finish before its
  runtime implementation fanout.
- Phase B depends on the actual behavior and naming produced by all feature goals.
- Human-owned ADR changes follow the repository revision/supersession procedure.

## Exclusions

- Rewriting historical research, completed summaries, or test fixtures merely to remove an old
  phrase.
- Claiming an unfinished feature in user-facing documentation.
- Changing the bundle identifier, canonical domain, or compatibility behavior without the required
  owner decision and migration plan.
