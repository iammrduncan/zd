---
name: write-adrs
description: Write and propose Architecture Decision Records. Use when someone has made an architecture decision and wants it recorded, when a decision needs superseding, when an ADR's format, status, or index entry needs checking, or when work reveals an undocumented decision that should become an ADR. Covers the five-part Nygard format, numbering, ownership, and the supersede rule.
---

# Write ADRs

An Architecture Decision Record captures one important decision about a system's architecture, why
it was necessary, and what follows from it. It is a short permanent record — not a proposal, a
design specification, or an implementation plan.

Accepted decision records are what a team holds AI accountable to. They are inspected line by line
precisely so the code built on them does not have to be. Write them accordingly.

## The rule that governs every command

**ADRs are human-owned.** People write, approve, and own them; many projects mark this in the
filename. Do not create or change an ADR without an explicit instruction from its owner, and
never change an accepted decision in place — see [reference/format.md](reference/format.md).

An ADR must stand on facts and requirements. It must not cite an objective, goal, feedback record,
or implementation plan as its authority. A planning document may link to an ADR; an ADR must not
link back to one.

## Commands

| Command | Purpose | Writes files? | Reference |
| --- | --- | --- | --- |
| `write [decision]` | Record a decision the owner has already made | yes, on instruction | [reference/write.md](reference/write.md) |
| `suggest [topic]` | Draft an ADR that does not exist yet, with why it should and what it would change | no | [reference/suggest.md](reference/suggest.md) |

Routing:

- **Explicit command** — load its reference and follow it.
- **"We decided X, write it up"** — `write`. The decision exists; you are recording it.
- **"Should this be an ADR?", "what are we missing?", an undocumented decision found during other
  work** — `suggest`. The decision is not yet made or not yet owned.
- **Neither is clear** — ask which. The difference is whether a human has already decided, and you
  cannot infer that from the code.

`write` records a decision. `suggest` proposes one. Never let `suggest` file an Accepted record:
proposal and review belong in a proposal document or a pull request, not in the ADR tree.

## Language

Write for someone reading this years later who was not there: short active sentences, one topic
each, one term for one meaning.

Some projects require a controlled language such as ASD-STE100. Where that applies, their own
repository guidance states it, and `simplified-technical-english` carries the standard and its
linter. Do not assume it applies, and never claim conformance from a linter run alone.

## Reference

| File | What it is |
| --- | --- |
| [reference/format.md](reference/format.md) | The five-part template, statuses, naming, per-area numbering, the index, and the supersede rule |
| [reference/write.md](reference/write.md) | Recording a decision an owner has made |
| [reference/suggest.md](reference/suggest.md) | Drafting a record that does not exist yet, with rationale and impact |

Before writing, read the target repository's guidance and surrounding ADRs for local conventions:
areas, numbering, filename patterns, the index, and the proposal process. This skill does not choose
their placement.
