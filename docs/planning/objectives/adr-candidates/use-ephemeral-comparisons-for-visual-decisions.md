# Candidate: Use ephemeral comparisons for visual decisions

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: Repository.

## Context

Text descriptions did not give the human owner enough evidence to choose between visual options.
The session log introduced paired `@COMPARE` and `@DECIDE` tasks, then found that decision screens
could lose the comparison context, ask an already-answered decision again, or leave temporary
galleries in the product tree.

The feedback-driven session ADR defines small tasks, verification, commits, and checkpoints. It
does not define the lifecycle for a decision whose required evidence is visual and human-owned.

## Decision

The proposed decision is to require a neutral, labeled, same-state side-by-side comparison before
a visual `@DECIDE` task.

The comparison session will create a tested development artifact and record its review command in
the session handoff. When the paired decision becomes eligible, `zdloop` will open that artifact,
show the saved handoff in the decision screen, and wait for the human answer without invoking a
work session.

After the answer, the loop will stop the temporary development server, remove the comparison
artifact and its dedicated test files, and pass the answer and removals into the implementation
session. A decision line carrying an `ANSWERED` verdict will run without asking again.

## Consequences

- Visual decisions are made from inspectable evidence instead of prose alone.
- The human answer remains attributable in the durable task and session records.
- Comparison code does not become permanent product or dev-surface inventory.
- The workflow adds one comparison session and artifact lifecycle before implementation.
- Nonvisual decisions do not need a comparison artifact.

## Evidence and ADR overlap

- Session evidence: `Define COMPARE task workflow` at 2026-08-03 16:43; the comparison/decision
  pairs that follow; decision-context work at 22:07; and `Launch and retire comparisons` at
  2026-08-04 13:41.
- Current evidence: `packages/scripts/session-loop/decision.mjs`,
  `comparison.mjs`, and `index.mjs` preserve handoffs, launch reviews, remove
  artifacts, and skip answered prompts.
- Related accepted ADR: repository 0001 defines the surrounding session loop. This candidate adds
  the human visual-evidence gate without replacing that loop.
