# Zen Suite Improvement Proposals

Zen Suite Improvement Proposals (ZSIPs) are customer- or contributor-authored proposals for
meaningful changes to Zen Suite. A ZSIP enters this folder through a pull request. Draft proposals
use draft pull requests.

Do not create a ZSIP retrospectively to explain a decision maintainers already made. Record that
decision as an [Architecture Decision Record](../adr/README.md).

Small, self-contained fixes can follow [CONTRIBUTING.md](../../CONTRIBUTING.md) without a ZSIP. Use
a ZSIP when a proposed change is broad, introduces important tradeoffs, or needs agreement before
implementation.

## Records

No ZSIPs have been submitted.

The first accepted proposal will use number `0001`.

## Submission workflow

1. Create `NNNN-short-title_H.md` with the next unused number.
2. Write the proposal using the format below.
3. Open a pull request that adds the proposal. Use a draft pull request for a draft ZSIP.
4. Revise the proposal in that pull request as customers, contributors, and maintainers discuss it.
5. A maintainer records the final status before merging or closing the pull request.

The pull request is the source of the proposal. Repository history must not be reconstructed into
ZSIPs after implementation.

## Ownership and review

- A customer or contributor authors and submits a ZSIP.
- The author owns the proposal and revises it during review.
- Project maintainers decide whether to accept it.
- Acceptance approves the direction. It does not make the ZSIP an architecture record.

The `_H` suffix marks a ZSIP as human-owned under the
[documentation ownership rule](../README.md#document-ownership).

## Lifecycle

- **Draft:** The author is developing the proposal in a draft pull request.
- **Submitted:** The proposal is ready for a decision.
- **Accepted:** Project maintainers approved the direction.
- **Rejected:** Project maintainers considered and declined it.
- **Withdrawn:** The author removed it from consideration.
- **Superseded:** A newer ZSIP replaces it. Link the replacement in the status.

Keep submitted proposals after a final decision so their alternatives and effects remain
available.

## Relationship to ADRs

An accepted ZSIP can produce zero, one, or several
[Architecture Decision Records](../adr/README.md). A ZSIP preserves the proposal and deliberation.
An ADR is the authority on an accepted architecture decision.

The usual flow is:

`Customer or contributor opens ZSIP pull request → maintainers decide → maintainers record any ADRs → implementation`

## Proposal format

Keep a proposal complete but concise. Include status, summary, motivation, proposal, alternatives,
effects, the cost of not adopting, and resulting ADRs.

```markdown
# NNNN: Short proposal title

## Status

Draft

## Summary
## Motivation
## Proposal
## Alternatives
## Effects
## If we do not adopt this proposal
## Resulting ADRs
```
