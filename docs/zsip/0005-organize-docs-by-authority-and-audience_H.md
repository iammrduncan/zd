# 0005: Organize docs by authority and audience

## Status

Accepted

## Summary

Separate accepted architecture, proposals, user guidance, internal repository records, and active
objectives into five explicit documentation areas.

## Motivation

The old `docs/` tree mixed temporary audit reports, product guidance, release operations, feedback,
and active task state. A reader could not tell which document controlled architecture or whether an
internal report was required to use the product.

Antiky demonstrates a small authority system: proposals retain deliberation, ADRs record accepted
architecture, user docs stand alone, and agent work has a separate system of record.

## Proposal

- Use `docs/adr/` for accepted human-owned architecture decisions.
- Use `docs/zsip/` for Zen Suite Improvement Proposals.
- Use `docs/user-facing-docs/` for standalone Diátaxis-oriented product documentation.
- Use `docs/_internal/` for repository meta-docs, release operations, and historical analysis.
- Use `docs/_objectives/` for zdloop tasks, feedback, goals, findings, and workflow rules.
- Remove temporary audit folders after extracting durable decisions.
- Add folder-level AGENTS and CLAUDE files where writing boundaries need automatic guidance.

## Alternatives

- Keep one flat `docs/` tree and rely on filenames to explain authority.
- Copy Antiky's complete tree, including a separate architecture-guide area that Zen Suite does not
  currently need.
- Publish only user docs and delete all decision and work history.
- Keep audit reports as permanent architecture sources.

## Effects

### Positive

- Contributors can find the authority for a decision.
- User docs no longer depend on planning or implementation history.
- Audit findings become short durable ADRs instead of permanent review dumps.
- zdloop paths clearly identify internal work state.

### Negative

- Existing links, scripts, tests, and contributor instructions must change together.
- Contributors must choose the right document type before adding a file.

### Neutral

- Internal and objective records remain in the repository.
- The structure can add a new durable product area later without changing these authority rules.

## If we do not adopt this proposal

The public documentation tree will continue mixing user tasks with repository operations and
historical evidence. Architecture authority will remain implicit.

## Resulting ADRs

None. This proposal defines documentation governance, not product architecture.
