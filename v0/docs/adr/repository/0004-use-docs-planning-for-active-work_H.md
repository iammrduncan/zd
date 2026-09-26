# 0004: Use docs/planning for active work

## Status

Accepted

Supersedes
[0003: Organize docs by authority and audience](0003-organize-docs-by-authority-and-audience_H.md).

## Context

The prior documentation decision placed active objectives below `docs/_internal/`. Repository work
later moved the records to `docs/planning/`, but workflow scripts, tests, and documentation continued
to name several old or intermediate paths.

The workbench expansion also introduced cross-objective goal plans and retained substantial research.
Contributors need one obvious active planning root whose subdirectories state whether a record directs
work or merely informs it.

## Decision

We will use these documentation areas:

- `docs/adr/` for accepted human-owned architecture decisions;
- `docs/zsip/` for contributor proposals;
- `docs/user-facing-docs/` for released product documentation; and
- `docs/planning/` for active and historical planning context.

Within `docs/planning/`:

- `goals/` owns active cross-objective execution contracts and dependency plans;
- `objectives/` owns executable queues, bounded work groups, workflow state, and completion records;
  and
- `ideas/` owns non-authoritative research and exploration.

Workflow scripts, tests, release guidance, contributor instructions, and generated references will
use `docs/planning/objectives/` as the sole objective root. New work will not recreate
`docs/_internal/objectives/` or `docs/objectives/` aliases.

Planning never outranks current human direction, product vision, accepted ADRs, or the design
contract. Historical and completed planning stays discoverable but cannot direct new implementation.

## Consequences

- Contributors and tools have one path for active work.
- Goal plans can coordinate several objective groups without being mistaken for product authority.
- Research remains available without sharing the authority of an execution goal.
- Existing scripts, tests, links, and instructions must migrate together.
- Skills or external automation that still names an old path must be updated before it can run safely.
