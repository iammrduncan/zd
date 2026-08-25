# wait-what init

Draft a `CONTEXT.md`: the vocabulary this repository already uses, collected in one place.

## Why

An agent's terminology otherwise comes from whatever it last read. The same thing acquires three
names across a session, and none of them is the one the team uses. That is the drift ADRs exist to
prevent, and a glossary is the cheap half of the fix.

The value is in **collecting terms that are already in use**, not inventing a vocabulary. A glossary
of invented terms is worse than none, because it will be cited.

## Procedure

### 1. Refuse if one exists

If `CONTEXT.md` is present, **stop and say so.** Report where it is and what it covers.

Regenerating a curated glossary is the worst thing this command can do: the corrections a human made
are exactly the part that cannot be regenerated. If it needs updating, that is an edit to specific
entries, and the human decides which.

### 2. Gather

Read, in this order:

- the root `README.md` — what this project is, in the owner's words;
- `AGENTS.md` and `CLAUDE.md` at every level — the terms already used as instructions;
- `docs/adr/` if present — architectural terms, and the decisions that gave them their meaning;
- the top-level source directories — the names the code actually uses.

Collect a term when it appears **repeatedly** and carries **specific meaning** in this project.
`entity`, `render driver`, `revision` qualify. `service`, `handler`, `manager` usually do not, unless
this project has given them a narrow meaning.

### 3. Draft

```markdown
# Context

What this project is, in two or three sentences.

## Ubiquitous language

| Term | Means here | Drawn from |
| --- | --- | --- |
| Entity | A world object addressed by stable ID | `docs/adr/framework/0001`, `packages/framework/src/entity.ts` |
| Render driver | The only thing that touches the renderer | `docs/adr/framework/0021` |

## Terms we avoid

| Avoid | Use | Why |
| --- | --- | --- |
| Object | Entity | "Object" collides with the language's own meaning |
```

**Every term names where it was drawn from.** That column is the difference between a glossary and a
guess: it lets a reader check the definition against the thing that established it, and it makes an
invented term obvious because it has no source.

### 4. Hand it over

Say plainly:

- that this is a **draft assembled from what the repository already says**, not a decision;
- which terms you were confident about and which you were not;
- which terms appear inconsistently in the source, because those are the ones worth a human ruling;
- that the file is the team's to own from here.

## Do not

- Do not overwrite an existing `CONTEXT.md`.
- Do not invent a term because a concept seems to need one. If the repository has no word for it,
  that is a finding, not a gap to fill.
- Do not include a term you found once.
- Do not present a definition you inferred as one the repository states. If you reasoned it out from
  usage, say so in the row.
