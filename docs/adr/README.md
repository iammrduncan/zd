# Architecture Decision Records

An Architecture Decision Record (ADR) records one important Zen Suite architecture decision. It
explains why the decision was necessary and what results the project expects.

An ADR is a short, permanent record. It is not a proposal, design specification, implementation
plan, audit report, or task log.

Project maintainers write and own ADRs after they make a decision. Contributors propose broad
changes through a [Zen Suite Improvement Proposal (ZSIP)](../zsip/README.md).

## Records

### Workbench and platform

- [0001: Use Tauri with a portable web frontend](suite/0001-use-tauri-with-portable-web-frontend_H.md)
- [0002: Put native authority behind one platform boundary](suite/0002-put-native-authority-behind-platform-boundary_H.md)
- [0003: Scope file access to the launch workspace](suite/0003-scope-file-access-to-launch-workspace_H.md) — superseded
- [0004: Dispatch application commands from the suite registry](suite/0004-dispatch-application-commands-from-suite-registry_H.md) — superseded
- [0005: Own one versioned workbench state](suite/0005-own-one-versioned-workbench-state_H.md)
- [0006: Scope file access to approved project grants](suite/0006-scope-file-access-to-approved-project-grants_H.md)
- [0007: Dispatch commands from one workbench registry](suite/0007-dispatch-commands-from-one-workbench-registry_H.md)

### Editor and current file

- [0001: Use browser layout for Markdown](md/0001-use-browser-layout-for-markdown_H.md)
- [0002: Use one always-editable document surface](md/0002-use-one-always-editable-document-surface_H.md)
- [0003: Confirm writes before marking a document clean](md/0003-confirm-writes-before-marking-a-document-clean_H.md)
- [0004: Treat rendered Markdown as untrusted](md/0004-treat-rendered-markdown-as-untrusted_H.md)

### Repository

- [0001: Use a feedback-driven session loop](repository/0001-use-a-feedback-driven-session-loop_H.md)
- [0002: Publish versioned desktop releases](repository/0002-publish-versioned-desktop-releases_H.md)
- [0003: Organize docs by authority and audience](repository/0003-organize-docs-by-authority-and-audience_H.md) — superseded
- [0004: Use docs/planning for active work](repository/0004-use-docs-planning-for-active-work_H.md)

## Minimal format

Each ADR uses the five-part format from Michael Nygard:

```markdown
# NNNN: Short decision title

## Status

Accepted

## Context

Describe the facts, limits, and needs that make the decision necessary.

## Decision

State the decision in active voice. Write “We will...” when it makes ownership clear.

## Consequences

Describe benefits, costs, and other results.
```

Keep one important decision in each record. Put proposal analysis in the related ZSIP when one
exists.

## Status values

- **Accepted:** The decision controls new work.
- **Deprecated:** The project keeps the decision for history, but it no longer controls new work.
- **Superseded:** A newer ADR replaces the decision. Link the replacement in the status.

## File and writing rules

- Name records `NNNN-short-title_H.md` with the next number in the applicable area.
- Never reuse a number.
- Link the related ZSIP in the context when one exists.
- Use short active sentences and one stable term for each concept.
- Define an uncommon technical term when it first occurs.
- Keep one topic in each sentence.
- Use lists when they make complex text easier to read.
- Do not remove necessary technical detail to make a sentence shorter.

The `_H` suffix marks these as human-owned under the
[documentation ownership rule](../README.md#document-ownership). Agents need explicit human
direction before creating or changing an accepted ADR.

## Changing a decision

Do not rewrite an accepted decision in place. Add a new ADR and mark the old record as superseded.

For an owner-approved clarification, preserve the committed version before editing it:

```sh
./docs/adr/tag-hash.sh docs/adr/suite/0001-example_H.md "Clarified the platform boundary."
```

The script adds the current full Git commit hash to a revision-history section. Run it while `HEAD`
still contains the prior text. Then edit the record.
