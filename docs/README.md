# ZenSuite `zd` documentation

These documents describe the `zd` workbench, accepted architecture, released behavior, active work,
and historical context. ZenSuite is the product-family and repository identity. The application,
workbench, and command are named `zd`; the name is complete and is not expanded in product copy.

## Start here

| Need | Document |
| --- | --- |
| Product behavior and scope | [VISION.md](VISION.md) |
| Visual and interaction behavior | [DESIGN.md](DESIGN.md) |
| Accepted architecture | [Architecture Decision Records](adr/README.md) |
| Released product guidance | [User documentation](user-facing-docs/README.md) |
| Active execution | [Planning](planning/README.md) |
| Current expanded-scope plan | [Expanded-scope goal](planning/goals/expanded-scope/goal.md) |
| Frontend implementation owners | [App source map](../packages/app/src/README.md) |
| Native implementation owners | [Native source map](../packages/tauri/src/README.md) |
| Product and architecture proposals | [ZenSuite Improvement Proposals](zsip/README.md) |
| Release operations | [Releasing `zd`](planning/objectives/_internal/releasing.md) |

## Document types

- **Vision:** the binding product contract.
- **Design:** the binding visual and interaction contract.
- **ADR:** a human-owned record of one accepted architecture decision.
- **User documentation:** standalone guidance for behavior that has shipped.
- **Goal:** an active, bounded execution contract that sequences work without overriding authority.
- **Objective:** executable work state, evidence, feedback, or a bounded plan used by repository
  workflow.
- **Idea/research:** non-authoritative exploration retained for context.
- **ZSIP:** a contributor-authored proposal for a meaningful ZenSuite improvement.

## Document ownership

Some filenames end in an ownership suffix:

- **`_H`:** Human-owned. An agent changes it only at a human's direction.
- **`_A`:** Agent-owned. Agents maintain it as part of repository work.
- **`_S`:** Script-owned. A deterministic process generates or maintains it.

Files without a suffix do not declare special ownership. Historical status does not grant authority;
the document type and authority order still apply.

## Authority

When current documents disagree, use this order:

1. Human direction defines owner intent.
2. [VISION.md](VISION.md) defines product behavior and scope.
3. Accepted [architecture decisions](adr/README.md) define implementation boundaries.
4. [DESIGN.md](DESIGN.md) defines visual and interaction behavior.
5. The active [expanded-scope execution plan](planning/goals/expanded-scope/goal.md) sequences work
   without overriding product or architecture authority.
6. [User documentation](user-facing-docs/README.md) describes behavior that has shipped.
7. Source code and tests show what the current implementation can prove.

Research, ideas, historical objectives, and superseded records preserve context. They do not direct
new implementation.
