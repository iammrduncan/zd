# Zen Suite documentation

These documents describe Zen Suite direction, accepted architecture, proposals, product use, and
active work. Start with the kind of information you need.

## Table of contents

| Area | Contents |
| --- | --- |
| [Architecture Decision Records](adr/README.md) | Human-owned records of accepted architecture decisions. |
| [Zen Suite Improvement Proposals](zsip/README.md) | Proposals for meaningful product, process, governance, and architecture changes. |
| [User documentation](user-facing-docs/README.md) | Standalone tutorials, how-to guides, reference, and explanation for people using `zd`. |
| [Internal records](_internal/README.md) | Release operations, implementation history, promotion material, and repository meta-docs. |
| [Objectives](_objectives/README.md) | The zdloop work queue, feedback, findings, goals, session rules, and archives. |

## Document types

- **ZSIP:** A contributor-authored proposal for a meaningful Zen Suite improvement.
- **ADR:** A human-owned record of one accepted architecture decision.
- **User documentation:** A standalone page that helps a reader use or understand a released tool.
- **Internal record:** Repository information that does not define product behavior or active work.
- **Objective:** Agent work state, evidence, feedback, or a plan used by the zdloop workflow.

## Document ownership

Some filenames end in an ownership suffix:

- **`_H`:** Human-owned. An agent changes it only at a human's direction.
- **`_A`:** Agent-owned. Agents maintain it as part of repository work.
- **`_S`:** Script-owned. A deterministic process generates or maintains it.

Files without a suffix do not declare a special owner.

## Authority

When documents disagree, use this order:

1. Human direction and the current [product vision](_objectives/vision.md) define product intent.
2. Accepted [ADRs](adr/README.md) define architecture decisions.
3. [DESIGN.md](../DESIGN.md) defines the visual and interaction system.
4. [User documentation](user-facing-docs/README.md) describes released behavior.
5. Source code and tests show the current implementation.

A ZSIP preserves a proposal and its tradeoffs. It is not architecture authority. An accepted ZSIP
can result in zero, one, or several ADRs.
