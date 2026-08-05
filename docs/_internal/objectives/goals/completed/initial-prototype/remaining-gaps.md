# Initial prototype — remaining gaps and work

Status: **incomplete; controlled stop snapshot**

Audited: 2026-07-28  
Implementation commit: `47ec60efc528d425b5ad9159db05ce1985de6599`

This document records what remains after the current implementation and verification pass. It is
deliberately not a completion claim. `goal-summary.md` has not been written because the goal's
acceptance criteria have not yet been met.

## Audit basis

The audit compares the current repository and built application with:

- [goal.md](goal.md) and [initial_thoughts.md](initial_thoughts.md);
- the canonical [DESIGN.md](../../../../../../DESIGN.md);
- the 16 canonical Markdown BDD feature files and their evidence ledger;
- the F01–F18 user findings in [feedback.md](feedback.md);
- ADR 0001 (desktop UI stack), ADR 0002 (workspace/catalog performance), and ADR 0003
  (large-document model and rendering);
- the current unit, design, Cucumber, coverage, packaging, and native-evidence results.

The BDD counts use two distinct meanings:

- **735 canonical scenarios** are declared in the feature corpus and classified exactly once by the
  evidence ledger.
- **758 executable scenarios** result after Cucumber expands Scenario Outline example rows.

The exact inventory and fail-closed evidence classification are useful, but classification is not
proof that every behavior passes or that native-only claims have been observed.

## What is verified at this stop

- `DESIGN.md` is marked canonical and binding. It defines one suite-owned `Settings` value and one
  resolved `DesignSystem` shared by all miniapps, explicitly covers iA Writer/OmmWriter restraint,
  text-first interaction, absent chrome/titlebars, typography, motion, and the ADR 0001–0003
  boundaries.
- `cargo fmt --all --check` passes.
- `cargo clippy --workspace --all-targets -- -D warnings` passes.
- The library suite passes: **404 passed, 0 failed**.
- The former full-suite macOS XPC abort is no longer reproduced. Quick Open now consumes its own
  navigation action, and test picker interactions terminate at an injected file-picker boundary.
- The Git refresh and split-state regressions fixed in `2e8b338` pass in focused tests.
- The evidence-ledger and canonical-Gherkin tests pass, and every canonical scenario has exactly one
  classification.
- The most recent completed local production coverage measurement, taken before the final picker
  change, reported 90.32% lines, 90.27% functions, 72.22% branches, and 91.28% regions. These are
  strong prototype numbers, not whole-application coverage and not current-release evidence.
- A repository secret scan has not found committed secret values. GitHub workflow references such
  as `${{ secrets.* }}` are names, not values.

## Acceptance blockers

### 1. The executable BDD suite is not green

The final full run completed with **753/758 scenarios** and **4,413/4,418 steps** passing. Five
production-adapter assertions failed:

| Feature | Scenario / assertion | Observed result |
| --- | --- | --- |
| `column-splits.feature:163` | Raising font size clamps three columns to two | remained at 3 |
| `column-splits.feature:176` | Lowering font size restores the requested three columns | remained at 2 |
| `focus-mode.feature:579` | Outgoing focus begins below full contrast and eases for 120 ms | first sample was not below 1.0 |
| `reading-mode.feature:49` | Wide reading begins at the canonical 80 px inset | first content top was 89 px |
| `reading-mode.feature:49` | Compact reading begins at the canonical 56 px inset | first content top was 65 px |

Each failure needs an isolated red regression, a decision about whether production or the adapter is
wrong, and a fix that preserves the canonical BDD statement. The repeated +9 px top-inset result
must not be waved away as tolerance without reconciling the rendered glyph geometry with the
design token.

### 2. The current native macOS application has not been rebuilt and accepted

`dist/zd.app` was built at 16:41 local time, before `2e8b338` and `47ec60e`. It therefore cannot
verify the current implementation. Rebuild the native application from the audited commit and test
the installed bundle, not a test harness or stale debug binary.

The fresh native pass must cover:

- cold launch, Home, recent entry, folder/file pickers, and command-line launch;
- reading, Markdown editing, code editing, Focus Mode, Typewriter Mode, word wrap, splits, search,
  outline, settings, shortcuts, save/reload, links, history, and multiwindow behavior;
- `cmd+.` open/close round-trip with a populated Shortcut Reference;
- Quick Open keyboard navigation without a picker launch, blank frame, or result flash;
- internal Markdown links remaining inside the reader and permitted web links using the browser;
- root and secondary windows with no titlebar plane, title text, separator, application bar,
  persistent status chrome, or decorative controls.

The picker boundary now prevents Cucumber from invoking AppKit dialogs, but only a fresh native run
can prove that the real picker and macOS lifecycle are healthy.

### 3. F01–F18 are still open

Every user finding in `feedback.md` is intentionally still marked open. Most have deterministic
regressions and implementation references, but none has the required rebuilt-native completion
record. F13 also needs motion evidence; a static Quick Open screenshot cannot prove the absence of
flashing. F17 and F18 require evidence-quality and coverage reconciliation, not another claim that
tests merely exist.

Close each finding only after its completion record contains:

1. the exact canonical BDD scenario;
2. a passing regression/design test;
3. the implementation commit;
4. fresh native evidence where the claim is visual, interactive, platform-specific, or temporal;
5. reviewer sign-off.

### 4. Typography and graphic-design acceptance is not final

Senior typography/graphic review previously rejected or questioned Shortcut Reference density,
list-marker proportion, icon/action spacing, Home recent-entry hierarchy, and related type rhythm.
Implementation corrections and design tests exist, but there is no recorded post-fix review of a
fresh current native build.

Required work:

- capture current Home, reading, editing, code, Focus, Typewriter, settings, shortcut, Quick Open,
  find, outline, split, and secondary-window surfaces at representative compact and wide sizes;
- have the senior typography/graphic reviewer inspect hierarchy, measure, leading, baselines,
  marker scale, wrapping, spacing, color, focus contrast, and chromeless composition;
- iterate until the reviewer records acceptance against `DESIGN.md`.

### 5. The committed native images are candidate or stale evidence

The files under `evidence/native-macos/` predate the final fixes. Several were already rejected in
review, and none is a substitute for a signed-off evidence manifest tied to the current source and
binary hashes. `31-secondary-window-titlebarless.jpeg` is helpful candidate evidence, but it does
not prove every root, secondary, transient, picker, and prompt surface is titlebarless.

Replace or clearly archive rejected images. The final evidence set must identify the source commit,
application hash, OS/display settings, scenario, reviewer, and disposition so old screenshots
cannot accidentally be treated as acceptance evidence.

### 6. Harsh-critic closure has not happened

The requested build → harsh critic → revise loop happened during BDD and implementation work, but
there is no final harsh-critic acceptance of the whole current product. Run the critic only after
the five failing scenarios and native/design findings are closed. The critic must compare the
actual application with `goal.md`, `initial_thoughts.md`, `DESIGN.md`, all BDD requirements, and
F01–F18, and must be empowered to reject the release.

### 7. Coverage is below “entire app” and the final commit is unmeasured

The last local report left roughly 2,873 lines, 266 functions, and 1,205 branches unexecuted. The CI
ratchet currently enforces 75% lines and 70% functions; it measures branches but does not enforce a
branch threshold. The final file-picker changes were made after that local report.

Required work:

- rerun production-only branch coverage on the final implementation;
- inspect uncovered production regions rather than optimizing only for a percentage;
- add integration/design tests at important behavior boundaries, especially native window,
  lifecycle, dialog, rendering, input, and error paths;
- decide and document honest line, function, and branch ratchets;
- keep test support and synthetic adapters out of production coverage totals.

One hundred percent line coverage alone would still not close native visual or interaction claims.

### 8. Remote CI and cross-platform packaging are unresolved

At this snapshot, GitHub Actions run
[`30405020705`](https://github.com/iammrduncan/zd/actions/runs/30405020705) for `47ec60e` is still in
progress. Several preceding `main` runs completed with failures. Completion requires a green current
run across Ubuntu, macOS, Windows, production coverage, and both packaging jobs.

Then verify:

- a fresh universal macOS `.app`, strict code-sign verification, icon/resources, launch, file
  association, command installation, size budgets, and current native evidence;
- a fresh Windows MSI, GUI/console subsystem split, icon/file association, install/uninstall,
  titlebar behavior, launch, signing where release credentials apply, and native Windows evidence;
- the reference performance/evidence workflows on their declared clean machines.

Local macOS success cannot stand in for native Windows verification.

### 9. Performance acceptance needs release evidence

ADR 0002 and ADR 0003 have bounded-work contracts and extensive deterministic tests. Those tests do
not replace release-build observations on the declared reference hardware. Produce complete,
hash-bound measurements for launch, first meaningful frame, input latency, scrolling, large
documents, large workspaces, memory, idle CPU/wakes, display changes, and shutdown. Missing or local
ad hoc evidence must continue to fail closed.

### 10. Final security and release hygiene remain

No committed secret value was found in this pass, and the native images inspected so far contain
synthetic or abbreviated paths. Before release, repeat the repository/history and artifact scan,
dependency audit, package-signature checks, and review of captured evidence for personal paths,
tokens, environment values, and document contents.

The generated `target/` cache was recreated by this final verification run and should be cleared
again at the controlled stop. It is not tracked and must never be packaged or committed.

## Recommended closure order

1. Fix the five failing Cucumber assertions and rerun all 758 executable scenarios.
2. Obtain a green current GitHub Actions run, including current production coverage.
3. Rebuild the macOS application from the final green commit.
4. Run the full native interaction/titlebar/motion pass with synthetic documents.
5. Capture fresh, hash-bound native evidence and replace or archive stale candidates.
6. Complete senior typography/graphic review, iterate, and record sign-off.
7. Close F01–F18 individually with their full completion records.
8. Build and verify the Windows package and native behavior.
9. Produce reference-hardware performance evidence.
10. Run the final harsh critic, security/release audit, and all workspace gates.
11. Only then write `goal-summary.md` and mark the initial-prototype goal complete.

## Stop disposition

The repository contains substantial, tested prototype implementation and a canonical design/BDD
system, but it is not yet a state-of-the-art, acceptance-complete release. Work stops here as
requested, with the remaining work explicit and without relabeling candidate evidence as proof.
