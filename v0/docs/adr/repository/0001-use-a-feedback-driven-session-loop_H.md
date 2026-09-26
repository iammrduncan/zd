# 0001: Use a feedback-driven session loop

## Status

Accepted

## Context

The first prototype amplified changes across many agents, generated artifacts, and repeated review
rounds. Long uncommitted runs made failures expensive to isolate and recover.

## Decision

We will run repository work as small committed sessions selected from durable feedback and task
records under `docs/_internal/objectives/`.

Each session will triage pending feedback, take one scoped task, verify that task, create one
focused commit, and leave unrelated findings in the queue. Explicit checkpoints will stop the loop
for human use and review.

## Consequences

- Each commit has one explainable goal and verification result.
- Feedback remains attributable and recoverable.
- Checkpoints stop automation where human experience is the real evidence.
- Large features need several independently useful slices.
- Maintaining the task and feedback records adds process work.
