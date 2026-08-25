# create-research

Turn `objective.md` into a research plan, run it with subagents, and land the findings in
`research/`.

Aliases: `generate-research-plan`.

## Procedure

### 1. Read the objective and the ground truth

Read `objective.md` in full. If it is empty or still only prompts, stop and say so — there is
nothing to research against.

Then read what constrains the answer before you go looking for one:

- the project's direction and engineering-principle documents
- the decision records that touch this area
- the repository `AGENTS.md`, and the nearest one to the code in question

Research that rediscovers something an accepted ADR already settles is wasted, and worse, it invites
a plan that contradicts a decision.

### 2. Write the research plan

Before dispatching anything, write the plan as `research/00-research-plan.md`. It states:

| Section | Contents |
| --- | --- |
| Questions | The specific questions this research must answer, numbered |
| Why each matters | What decision each question unblocks. A question that unblocks nothing is cut |
| Lines of inquiry | One per subagent: its scope, its sources, and what it must return |
| Out of scope | What this research deliberately will not cover |
| Known constraints | The ADRs, AIPs, and direction documents that bound the answers |

A question that cannot change what the plan says is not a research question. Cut it.

### 3. Fan out subagents

One subagent per line of inquiry. Give each:

- **a narrow scope** — one area, one question set. Two agents on the same area produce two
  overlapping documents and no more information;
- **its sources** — the directories, files, or external material to read;
- **the return format** — findings, evidence for each, and explicit gaps;
- **the standing rule** that an unverifiable claim must be labelled as such rather than dropped or
  asserted.

Run them concurrently. They are read-only research; nothing serializes them.

Land each agent's raw return in `research/subagent_outputs/NN-<agent-name>.md`, unedited. That file
is evidence. Keep it even after the compiled document supersedes it, because the compiled document
is your interpretation and this is what it was built from.

### 4. Compile findings

Turn the raw outputs into numbered documents in `research/`, one per coherent finding area:

```
research/00-research-plan.md
research/01-<finding-area>.md
research/02-<finding-area>.md
```

Compiling is not concatenating. For each document:

- state what is **established** — verified against a primary source, with the source named;
- state what is **claimed** — asserted by a maintainer, a document, or a subagent, unverified;
- state what is **inferred** — your reasoning from the above, marked as reasoning;
- state the **gaps** — what nobody could answer, and what it would take to answer it.

Where two subagents disagree, say so and say which you believe and why. A contradiction resolved
silently is a contradiction that resurfaces during execution.

### 5. Write the summary

`research/README.md` maps the documents: what each answers, what the headline conclusions are, and
which questions from the plan remain open.

### 6. Report

Tell the owner:

- what the research concluded, in a few sentences;
- which questions are answered and which are still open;
- **what needs their decision before planning can start** — the open questions that are theirs, not
  yours;
- anything found that contradicts an existing ADR or the stated direction, called out plainly. This
  is the most valuable thing research produces and the easiest to bury.

## Evidence standard

- Popularity, star counts, and install counts are discovery signals, not quality evidence.
- A project's own tests and its own demo are not independent validation.
- Date fast-moving claims.
- Distinguish what you read from what you ran. "The README says X" and "I ran it and observed X" are
  different facts and must not be written the same way.

## What this command must not do

- Do not write plan documents. That is `create-plan`, and it reads what this produces.
- Do not write goals.
- Do not edit `objective.md`.
- Do not install, run, or add a dependency to answer a research question without saying so and
  getting agreement. Research is read-only by default.
