# 0003: Organize docs by authority and audience

## Status

Superseded by
[0004: Use docs/planning for active work](0004-use-docs-planning-for-active-work_H.md)

## Context

The old `docs/` tree mixed temporary audit reports, product guidance, release operations, feedback,
and active task state. A reader could not tell which document controlled architecture or whether an
internal report was required to use the product.

## Decision

We will separate documentation into four top-level areas, with active objective records nested under
internal records:

- `docs/adr/` for accepted human-owned decisions.
- `docs/zsip/` for customer- or contributor-authored proposals submitted through pull requests.
- `docs/user-facing-docs/` for standalone product documentation.
- `docs/_internal/` for repository meta-docs and historical analysis.
- `docs/_internal/objectives/` for zdloop tasks, feedback, goals, findings, and workflow rules.

We will remove temporary audit folders after extracting durable decisions. Folder-level AGENTS and
CLAUDE files will provide automatic writing guidance where a documentation boundary needs it.

## Consequences

- Contributors can identify the authority for a decision.
- User documentation does not depend on planning or implementation history.
- Audit findings become durable ADRs instead of permanent review dumps.
- ZSIPs represent actual submitted proposals rather than reconstructed project history.
- Existing links, scripts, tests, and contributor instructions must move with their documents.

## Revision history

- `5699c1e33b88eb0e6d34a8303e71b33e90f99bdf` — Prior accepted version before adopting docs/planning as the active work root.
