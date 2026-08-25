# ADR format and placement

The shared conventions. `write.md` and `suggest.md` both depend on this file.

## The five parts

Based on Michael Nygard's original format. Every ADR has exactly these, in this order:

```markdown
# NNNN: Short decision title

## Status

Accepted

## Context

Describe the facts, limits, and needs that make the decision necessary.

## Decision

State the decision in active voice. For example, write "We will..."

## Consequences

Describe the benefits, costs, and other results of the decision.
```

Keep it small. Add links, or a short list of options, only when the Context does not already carry
what a reader needs.

Where a project has a separate proposal document, the options analysis usually belongs there rather
than in the ADR. Include it in the record only when a reader cannot follow the decision without it.

## What belongs in each part

| Part | Holds | Does not hold |
| --- | --- | --- |
| Title | One decision, stated as an outcome | A topic area, a question, a ticket id |
| Status | One of the three values below | A date, an author, a review note |
| Context | Facts, limits, requirements, the conflict being resolved | The decision itself, or advocacy |
| Decision | What we will do, in active voice, present or future | Justification — that is Context |
| Consequences | Benefits, costs, follow-on obligations, accepted losses | Only the benefits |

Consequences that list only benefits are the most common defect. A decision with no cost was not a
decision. State what gets worse, and what the team is accepting.

## Status values

| Status | Meaning |
| --- | --- |
| `Accepted` | The decision controls new work |
| `Deprecated` | Kept for history. Does not control new work |
| `Superseded` | A newer ADR replaces it. Name and link that ADR in the status |

New records are usually `Accepted`: the owner decides before the record is written. There is no
`Proposed` status — a proposal is not yet a decision, and belongs wherever the project reviews them.

When a record supersedes another, say so under its own status too:

```markdown
## Status

Accepted

Supersedes [0006: Route all writes through the session](0006-session-writes.md).
```

## Naming and numbering

Records are numbered and the number never changes. A common convention is `NNNN-short-title.md` with
a four-digit number, a lowercase hyphenated title, and a suffix marking ownership.

**Decide whether numbering is global or per area, and be consistent.** A project with separate areas
usually numbers within each, so two records can share a number across areas. Read the area before
choosing a number rather than taking the highest number in the tree — that is the mistake that
collides.

Numbers are never reused, including for a superseded record. A gap in the sequence is information.

Read the target repository's guidance and nearby records for its areas, exact filename pattern,
ownership suffix, and index format. This file covers what is true of ADRs anywhere.

## The index

Most projects keep a list of every record. Add the entry in the same change that adds the record — a
record missing from the index is invisible to a reader browsing the tree.

## Changing a decision

**Never edit an accepted decision in place.** An accepted ADR is a historical record.

When a decision changes:

1. Write a new ADR with the next number in that area.
2. Under the new record's status, add `Supersedes [NNNN: title](link)`.
3. Change the old record's status to `Superseded by` and link the new record.
4. Do not delete the old record. Do not reuse its number.

For an owner-approved clarification that must happen in place, **preserve the committed text
first**. A project usually has a procedure for this — a revision-history entry recording the commit
hash of the prior wording, so the change is auditable. Follow it before editing, not after.


## Writing standard

An ADR is read years later by someone who was not there. Write for them: short active sentences, one
topic each, one term for one meaning throughout, and an uncommon term defined where it first occurs.

Some projects require a controlled language such as ASD-STE100. Read the repository guidance; do not
assume it applies.


## Verification

Before delivering ADR work:

- The record has Title, Status, Context, Decision, and Consequences.
- The status is one of the three permitted values.
- The number is the next unused one, following the project's numbering scheme.
- The filename follows the project's pattern.
- The record appears in the ADR index.
- Every local link resolves.
- `git diff --check` is clean.
- The STE audit is reported separately from the format and link checks.

Where a controlled-language standard applies, never report the record as compliant with it when you
ran only format, link, sentence-length, or automated checks.
