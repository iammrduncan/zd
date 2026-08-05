# 0003: Use a feedback-driven session loop

## Status

Accepted

## Summary

Run repository work as small committed sessions selected from durable feedback and task records.

## Motivation

The first prototype amplified changes across many agents, generated artifacts, and repeated review
rounds. Long uncommitted runs made failures expensive to isolate and recover. A small session needs
one goal, one verification boundary, and one durable handoff.

The evidence is preserved in the
[agent development postmortem](../_internal/agent-development-time-postmortem.md) and the
[path-forward record](../_internal/path-forward.md).

## Proposal

- Keep human feedback, agent findings, active tasks, and archives under `docs/_objectives/`.
- Begin a session by triaging unprocessed feedback.
- Run one scoped task at a time.
- End a successful session with a focused verification result and one commit.
- Put unrelated findings back into the queue instead of expanding the active task.
- Stop at explicit checkpoints for human use and review.
- Keep comparison tasks before decisions that need visual judgment.

## Alternatives

- Let an agent choose and expand work without a durable queue.
- Run several agents against one worktree and merge their results later.
- Keep all work uncommitted until a whole phase is complete.
- Re-run open-ended reviews until no reviewer proposes another change.

## Effects

### Positive

- Each commit has one explainable goal and verification result.
- Feedback stays attributable and recoverable.
- Checkpoints stop automation where human experience is the real evidence.
- A failed session has a small blast radius.

### Negative

- Maintaining task and feedback records adds process work.
- Large features need several independently useful slices.
- Agents must resist fixing unrelated issues immediately.

### Neutral

- The process can evolve without changing product architecture.
- The internal objective records remain visible to contributors but are not user documentation.

## If we do not adopt this proposal

Work can again grow across several goals, agents, and verification systems before reaching a stable
commit. Recovery and review costs will increase with each unfinished dependency.

## Resulting ADRs

None. This proposal changes the repository work process, not product architecture.
