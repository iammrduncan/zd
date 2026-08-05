# Zen Suite Improvement Proposals

Zen Suite Improvement Proposals (ZSIPs) are how contributors propose meaningful changes to Zen
Suite. A ZSIP can address a feature, product direction, development process, governance rule,
architecture, or another improvement that benefits from discussion and alignment.

Small, self-contained fixes can go directly through the process in
[CONTRIBUTING.md](../../CONTRIBUTING.md). Use a ZSIP when a change is broad, introduces important
tradeoffs, or needs agreement before implementation.

## Records

- [0001: Rebuild zd md on a browser text engine](0001-rebuild-zd-md-on-a-browser-text-engine_H.md)
- [0002: Make rendered Markdown always editable](0002-make-rendered-markdown-always-editable_H.md)
- [0003: Use a feedback-driven session loop](0003-use-a-feedback-driven-session-loop_H.md)
- [0004: Publish versioned macOS releases](0004-publish-versioned-macos-releases_H.md)
- [0005: Organize docs by authority and audience](0005-organize-docs-by-authority-and-audience_H.md)

## Ownership and review

- Any contributor can write and submit a ZSIP.
- The author owns the proposal and revises it during review.
- Project maintainers decide whether to accept it.
- Acceptance approves the direction. It does not make the ZSIP an architecture record.

The reconstructed accepted proposals in this folder use `_H` because the human owner directed and
approved the decisions. The suffix follows the [documentation ownership rule](../README.md#document-ownership).

## Lifecycle

- **Draft:** The author is developing the proposal and seeking early feedback.
- **Submitted:** The proposal is ready for a decision.
- **Accepted:** Project maintainers approved the direction.
- **Rejected:** Project maintainers considered and declined it.
- **Withdrawn:** The author removed it from consideration.
- **Superseded:** A newer ZSIP replaces it. Link the replacement in the status.

Keep proposals after a final decision so their alternatives and effects remain available.

## Relationship to ADRs

An accepted ZSIP can produce zero, one, or several
[Architecture Decision Records](../adr/README.md). A ZSIP preserves the proposal and deliberation.
An ADR is the authority on an accepted architecture decision.

The usual flow is:

`Contributor proposes a ZSIP → maintainers decide → maintainers record any ADRs → implementation`

## File and content rules

- Name proposals `NNNN-short-title_H.md` when the human owner controls the proposal.
- Always increase record numbers. Never reuse a number.
- Keep a proposal complete but concise, preferably under 500 lines.
- Include status, summary, motivation, proposal, alternatives, effects, the cost of not adopting,
  and resulting ADRs.
- Link evidence that helps a reviewer understand the tradeoff.

Use this shape:

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
