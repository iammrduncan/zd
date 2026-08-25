# Objective structure

The layout every command reads and writes. Learn this before running any of them.

## Layout

An objective owns a folder. Inside it, four things, whatever a project names them:

```
<objective>/
  <intent>          the owner's raw intent. Input, never generated
  <plan documents>  numbered, at the root
  research/         findings, and the raw subagent returns behind them
  goals/            open goals, and a completed/ for finished ones
```

The **shape** is what matters and it is the same everywhere: intent feeds research, research feeds
the plan, the plan feeds goals, goals produce summaries, and the whole thing collapses into one
archived summary at the end.

Read the target repository's guidance and existing objective tree for exact paths, filename patterns,
and the archive location.

## Naming

Two rules hold anywhere:

- **Numbers increase and are never reused**, including after a document is superseded. A gap is
  information.
- **A goal and its summary share a number**, so a completed pair is obvious.

The exact patterns are a project convention. Read the repository guidance and nearby files before
creating a file.

## Phase detection

Read the folder to decide where an objective stands. Do not ask the owner what phase it is in when
the folder already says.

| Folder state | Phase | Next command |
| --- | --- | --- |
| No folder | Not started | `init` |
| `objective.md` exists, empty or nearly | Waiting on the owner | Ask them to fill it in |
| `objective.md` has content, no `research/` | Ready to research | `create-research` |
| `research/` exists, no numbered plan documents | Research done | `create-plan` |
| Plan documents exist, no `goals/` | Planned | `create-goals` |
| `goals/` has open goals | Executing | `execute <goal>` |
| `goals/` empty, `_completed/` populated | All goals done | `complete-objective` |

State the phase you detected and the evidence for it before acting.

## What each file is for

**`objective.md`** is the owner's. It holds raw intent — what they want, why, what they are worried
about, what "done" might look like. It is unstructured on purpose. Never rewrite it, never tidy it,
and never generate it with content the owner did not supply. `init` creates it with prompts and
leaves it to them.

**`README.md`** is generated. It says what the objective is, where it stands, what the plan
documents are, and which goals are open. Regenerate it whenever a phase completes.

**Plan documents** are the thinking: diagnosis, options, sequencing, effort, what is deliberately
not being done. They are numbered so later documents can supersede earlier ones without deleting
them.

**`research/`** holds compiled findings. **`research/subagent_outputs/`** holds the raw output each
subagent returned, kept even when the compiled document supersedes it — the compiled version is an
interpretation, and the raw output is the evidence for it.

**`goals/`** holds contracts. Open goals sit at the top level; a goal and its summary move into
`_completed/` together.

## Index

the objectives index lists active objectives and archived ones. Update it when an objective
starts and when it is archived. An objective missing from the index is invisible.

## Reading before planning

Before planning or cutting goals, read the project's own direction and decision records — whatever
they are called. A plan **applies** accepted direction; it does not replace it, and it cannot
overrule an accepted decision record.

If the work requires a decision to change, that is an ADR. Use `write-adrs suggest` and say
so in the plan rather than planning around it.

A project's repository guidance supplies its required reading list.
