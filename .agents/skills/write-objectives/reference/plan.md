# create-plan

Compile `research/` into numbered plan documents at the objective root.

Aliases: `compile-research-to-plan`.

Where a project has an exemplar plan, read it before writing your first — it shows the level of
specificity expected far better than a description can.

## Procedure

### 1. Read everything first

`objective.md`, every document in `research/`, and the direction and decision records listed in
[structure.md](structure.md). A plan written from the research summary alone inherits the summary's
compressions as if they were facts.

### 2. Decide the document set

Plan documents are numbered `NN-<TITLE>.md` at the objective root, starting at `00`. Each holds one
coherent piece of thinking. A typical set looks like:

| Number | Kind | Holds |
| --- | --- | --- |
| `00-` | Diagnosis | What is actually wrong, with evidence |
| `01-` | Vocabulary | The terms this objective uses, defined once |
| `02-` | Remediation plan | The strategic call, phases, sequencing, effort |
| `03-`… | Deep dives | One per area needing its own treatment |
| `NN-` | Decisions and gaps | Impact on ADRs, seed gaps, critiques |

Do not force this exact set. Do write a diagnosis before a remediation, and do define the vocabulary
before using it — the two commonest ways a plan becomes unfollowable are proposing fixes before
establishing what is broken, and using a term three ways.

### 3. Write each document

Every plan document states:

- **what it is deciding or describing**, in its first paragraph;
- **the evidence**, with file paths and line numbers where the claim is about code;
- **the options considered**, and why the chosen one wins;
- **the cost** of the chosen approach, stated plainly;
- **what it explicitly does not cover**.

Two things separate a usable plan from a plausible one:

**Sequencing with reasons.** Not "phase 1, phase 2" but why phase 2 cannot start first, and what
breaks if it does. An operator who understands the ordering can re-sequence under pressure; one
following a list cannot.

**Honest effort.** Give ranges, say what the estimate assumes, and name the thing most likely to
blow it. A plan whose estimates are all confident is a plan nobody has stress-tested.

Include a section on what you would deliberately **not** do and why. It is the highest-signal part
of a plan and it is almost always missing.

### 4. Reconcile with accepted decisions

If the plan needs something an ADR forbids, or reveals a decision nobody has recorded:

- say so in its own numbered document, named for the decision it examines;
- do not plan around the ADR silently;
- do not write the ADR yourself — use `write-adrs suggest`, and reference the proposal here.

A plan that quietly contradicts an accepted decision is worse than one that stops and asks.

### 5. Regenerate the README

Write the objective's `README.md` from [templates/README.md](templates/README.md): what this
objective is, its current phase, the document map, and what needs the owner.

### 6. Report

Tell the owner:

- the strategic call in two or three sentences;
- the phases and why they are ordered that way;
- the effort range and the assumption most likely to break it;
- **the decisions that are theirs**, listed, with what each blocks;
- anything that needs an ADR;
- what you deliberately excluded.

## What this command must not do

- Do not write goals. That is `create-goals`, and a plan that is really a goal list has skipped the
  thinking step.
- Do not treat the plan as authority. A plan applies accepted direction; it cannot create it. An ADR
  may not cite a plan as its reason to exist.
- Do not delete or rewrite an earlier plan document to reflect new understanding. Add a later
  numbered document that supersedes it and says so. The sequence is a record of how the thinking
  changed.
