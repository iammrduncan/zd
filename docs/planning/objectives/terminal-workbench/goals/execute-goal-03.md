# Execute goal 03: Connect source review, Herdr handoff, and image paste

## Prerequisites

- [Goal 01](_completed/execute-goal-01.md) is complete and supplies document revisions, source
  ranges, edit transactions, and safe project paths.
- [Goal 02](_completed/execute-goal-02.md) is complete and supplies visible selection, overlays,
  commands, and Markdown Read/Edit modes.
- This goal owns review, handoff, image modules and the app/UI wiring for them. Goal 04 must not edit
  the same command/help/docs paths concurrently.

### Needed from the owner before starting

Nothing. A real prompt will not be sent to the owner's active agent without an explicit interactive
approval; automated evidence uses a fake target.

## `/goal` objective

This goal delivers Phase 3 from [`02-DELIVERY-PLAN.md:52-62`](../02-DELIVERY-PLAN.md#phase-3--add-review-herdr-handoff-and-image-paste).

Use the one source selection for the three differentiating workflows: persistent comments, an
explicit agent handoff, and transactional image-link insertion.

## Required outcome

When the work is complete, the repository must have:

1. a bounded, versioned `.zd/review-v1.json` store with revision/range/exact/context anchors,
   deterministic re-anchoring, detached state, and atomic writes;
2. comment UI/commands available for Edit and selectable Read ranges, with visible attached/detached
   state and no silent ambiguous reassignment;
3. Herdr 0.9.1 agent discovery, explicit target and payload preview, separated-argument submission,
   bounded/control-safe content, reported failures, and a manual prepared-prompt fallback;
4. an image adapter that validates decoded RGBA, encodes content-hashed PNG, refuses escape/symlink/
   collision errors, installs under the active document's `zd-images/`, and returns a relative link;
5. one undoable Markdown insertion that occurs only after image installation, with cleanup or reuse
   semantics for partial failure; and
6. tests using fake review files, Herdr process, clipboard images, and filesystem failures.

## In scope

- **Review.** Owns `src/review/**`, its persistence/anchor tests, and comment UI wiring.
- **Handoff.** Owns `src/handoff/**`, agent selection/submission UI wiring, and fake-executable tests.
- **Images.** Owns `src/image/**`, clipboard/platform adapter wiring, PNG fixtures/tests, and the
  Markdown insert command.
- **Shared UI.** May update app/actions/UI/help and manifests after Goal 02; serialization is required.

## Required tests and evidence

At minimum, prove the Review, Handoff, Image, and Clipboard unavailable rows at
[`04-ACCEPTANCE-PLAN.md:18-20`](../04-ACCEPTANCE-PLAN.md#automated-release-blocking-evidence), including:

- same-revision, shifted-exact, unique-context, unique-exact, ambiguous, deleted, malformed, oversize,
  and project-escape review cases;
- selected metacharacters, newlines, ESC/NUL, large payloads, missing Herdr, no agents, non-zero exit,
  and deliberate submit behavior without a shell;
- checked image dimensions, valid decoded length, encoded-size cap, content-hash reuse, symlinked
  `zd-images`, filename collision, write refusal, and document insertion failure;
- all failure paths leave document content unchanged and no partial new image or review temp file;
- image insertion and link removal round-trip as one undo/redo group; and
- locked tests, format, strict Clippy, release build, and `git diff --check` pass.

## Explicit non-goals

- Do not start, stop, attach, or infer the state of agent sessions.
- Do not send a live prompt during automated or unattended verification.
- Do not implement tmux/Zellij pane guessing, OSC 5522, remote clipboard transfer, or Kitty image
  rendering.
- Do not fetch remote Markdown images or preserve animated clipboard formats.
- Do not auto-edit `.gitignore` or silently follow review anchors across file renames.

## Engineering constraints

- Follow root instructions and test every behavior change.
- Never concatenate source text into a shell command. Use a fake executable in tests and separated
  argv or typed IPC in production.
- Treat clipboard pixels, review JSON, paths, agent output, and selected text as untrusted and
  bounded.
- The document-local `zd-images` directory must remain beneath the canonical project and must not be
  a symlink.
- Keep the user's active Herdr session untouched unless they explicitly confirm a target/payload.

## Completion definition

The goal is complete only when an exact source selection can create and reopen a truthful comment,
prepare and explicitly submit or manually copy a bounded agent prompt, and paste a valid local image
as one safe Markdown edit; every ambiguity/unavailable/error path is specific and non-mutating; and
the full automated gates pass without touching a live agent.

If the local clipboard API cannot compile or operate safely on a supported build target, keep image
paste capability-gated and report the platform evidence. Do not weaken validation, intercept ordinary
paste, or claim remote image support to preserve the checklist.

