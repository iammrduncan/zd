# Architecture Decision Record instructions

## Scope and ownership

These instructions apply to `docs/adr/` and its child folders.

Read [README.md](README.md) before creating or changing an ADR. ADRs are human-owned records. An
agent can create or change an `_H` ADR only when a human gives explicit direction. Preserve the
human owner's decision and intent.

## ADR workflow

1. Confirm that the human owner made one architecture decision.
2. Find the next unused number in the applicable area.
3. Use the five-part format in `README.md`.
4. Link a source ZSIP when one exists.
5. Write Context, Decision, and Consequences with short active sentences.
6. Add the record to the ADR index.
7. Validate status, numbering, local links, and `git diff --check`.

## Changes to accepted ADRs

Do not change an accepted decision in place. Create a new ADR and set the old status to
`Superseded`.

For an owner-approved clarification, run `docs/adr/tag-hash.sh` while `HEAD` contains the prior
text. Then make the clarification.

## Verification

- Confirm Title, Status, Context, Decision, and Consequences sections exist.
- Confirm the status is permitted by `README.md`.
- Confirm the record appears in the ADR index.
- Confirm all local links resolve.
- Run the documentation governance test, which exercises `docs/adr/tag-hash.sh`.
- Run `git diff --check`.
