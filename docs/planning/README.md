# Planning

`docs/planning/` is the sole active planning root for `zd`.

Planning records sequence or inform work. They never override current human direction,
[`VISION.md`](../VISION.md), accepted [ADRs](../adr/README.md), or [`DESIGN.md`](../DESIGN.md).

## Areas

| Area | Ownership |
| --- | --- |
| [Goals](goals/) | Active cross-objective execution contracts and dependency plans |
| [Objectives](objectives/) | Executable work queues, bounded work groups, workflow state, and completion records |
| [Ideas](ideas/) | Non-authoritative research, alternatives, and product exploration |

The current product expansion is coordinated by the
[expanded-scope execution plan](goals/expanded-scope/goal.md).

## Historical snapshots

- The [prototype wrap-up goals](objectives/wrap-up/README.md) are superseded planning records.
- The [early application-surface ideas](objectives/mini-apps/README.md) are superseded exploration.

Both indexes point back to the current workbench plan and must not be used as execution queues.

## Rules

- A goal states an outcome, dependencies, verification, and a real terminal condition.
- Objective workflow tools read and write only `docs/planning/objectives/`.
- Ideas must identify themselves as non-authoritative and link current authority when relevant.
- Completed and historical records remain available but do not direct new implementation.
- Moving a planning path requires updating scripts, tests, contributor guidance, and release tooling
  in the same change.
