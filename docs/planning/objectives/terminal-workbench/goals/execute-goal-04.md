# Execute goal 04: Verify and hand off the v1.0.1 prototype

## Prerequisites

- [Goal 00](_completed/execute-goal-00.md), [Goal 01](_completed/execute-goal-01.md),
  [Goal 02](_completed/execute-goal-02.md), and [Goal 03](execute-goal-03.md) are complete.
  This goal needs the full release binary and all automated feature tests.
- This goal owns final user docs, acceptance records, workflow tightening, and fixes found by the
  release/Herdr checks. No other goal may commit concurrently.

### Needed from the owner before starting

Nothing for Linux/Herdr verification. The owner must later run the supplied Ghostty/clipboard
checklist; that follow-up is an acceptance item, not permission needed to prepare the prototype.

## `/goal` objective

This goal delivers Phase 4 from [`02-DELIVERY-PLAN.md:64-74`](../02-DELIVERY-PLAN.md#phase-4--make-the-prototype-testable-by-the-owner)
and the handoff contract at [`04-ACCEPTANCE-PLAN.md:27-49`](../04-ACCEPTANCE-PLAN.md#live-environment-evidence).

Turn the implemented slice into something the owner can build, launch, understand, and test without
reverse-engineering the repository or mistaking an unavailable platform capability for a bug.

## Required outcome

When the work is complete, the repository must have:

1. all release-blocking tests and quality gates from the acceptance plan green in a clean locked
   release build;
2. a recorded PTY and live Herdr 0.9.1 smoke covering launch, tree, edit/save, find/replace,
   Markdown modes/selection, comments, safe fake handoff, unavailable image path, and teardown;
3. user documentation with install/build/run commands, full key/mouse reference, feature workflow,
   storage locations, bounds, and precise current limitations;
4. an owner Ghostty/Herdr checklist for enhanced keys, mouse bypass/capture, text paste, local image
   paste, resize, handoff, and clean exit;
5. root CI that runs the complete locked Rust gate and cannot build or publish v0; and
6. a version/help surface and changelog that identify this build as the v1.0.1 prototype without
   creating a tag or release claim.

## In scope

- **Verification.** Owns final integration/PTY fixtures and proportional regression fixes across v1
  files, with a failing regression test before each found-error fix.
- **Documentation.** Owns root README, changelog, contributing guide, user guide/reference, and
  acceptance record.
- **Workflow.** Owns new root CI/release verification only; no package publication.
- **Objective state.** Owns the goal summary, objective README updates, and completion audit.

## Required tests and evidence

At minimum, prove every row at [`04-ACCEPTANCE-PLAN.md:10-22`](../04-ACCEPTANCE-PLAN.md#automated-release-blocking-evidence)
and record every observation at lines 29–42. Also prove:

- a clean checkout can follow the documented build/test/run path without Node, WebKit, Tauri, or an
  installed `rg`;
- `zd --version` reports `1.0.1` and `zd --help` names no server, desktop, PTY, or agent-runtime mode;
- README feature claims link to executable tests or a recorded live observation;
- help/key reference exactly matches the production command registry;
- the live Herdr smoke does not prompt the active real agent; and
- `git status`, strict Clippy, format, locked tests, release build, link checks, and `git diff --check`
  are clean.

## Explicit non-goals

- Do not create or push a Git tag, publish an artifact, or change an external release.
- Do not claim macOS Ghostty or clipboard evidence from the Linux/headless environment.
- Do not add a feature merely because the acceptance run exposes an adjacent opportunity.
- Do not weaken or skip a gate to make the prototype appear ready.

## Engineering constraints

- Follow root instructions. Every found error gets a failing test before its fix.
- Keep verification deterministic; interactive observations supplement but never replace core tests.
- User docs describe shipped behavior only and put capability limitations next to the command they
  affect.
- Make focused one-line commits without coauthor tags and preserve unrelated state.

## Completion definition

The goal is complete only when every automated acceptance row is green, the release binary has been
exercised safely inside the live Herdr session, the exact result and unverified Ghostty items are
recorded, documentation is sufficient for the owner to launch and evaluate v1.0.1, and no tag,
publication, or unsupported platform claim was made.

If a release-blocking gate fails or the Herdr smoke cannot be performed without risking the active
agent/session, stop and report the exact unsatisfied evidence. Do not call the prototype ready based
on unit tests alone.
