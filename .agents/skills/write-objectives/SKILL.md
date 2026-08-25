---
name: write-objectives
description: Run Objectives end to end — scaffold an objective, plan and fan out research, compile research into a numbered plan, cut well-bounded goals, execute a goal and summarize it, audit a plan with a specialist reviewer panel, and archive a finished objective. Use when starting a large arc of work, when planning or replanning, when executing a goal from goals/, or when a piece of work needs the research→plan→execute→summarize→archive lifecycle.
---

# Objectives

An objective is a large arc of work — an epic. It owns its research, its plan, its goals, and its
closeout. Every objective moves through one lifecycle:

```
init → create-research → create-plan → create-goals → execute (× N) → complete-objective
                                            ↑                ↓
                                          audit         complete-goal
```

Smaller work uses the same lifecycle at smaller scale. See
[reference/simple-goals.md](reference/simple-goals.md).

## The rules that govern every command

**A goal is a contract, not a task.** It states its prerequisites, its required outcome, what proves
it, what it must not do, and when it is done. A goal an operator cannot start without asking you a
question is not finished — see [reference/goals.md](reference/goals.md).

**Say what the human must decide.** Every artifact names what it needs from the owner before work
can start, and every summary names what needs the owner's attention afterward. Burying a decision
the operator has to make is the failure mode this skill exists to prevent.

**Plans apply direction, they do not replace it.** Read the project's direction and engineering-principle documents, and the relevant decision
records. An objective cannot
overrule an accepted decision. If the work needs one changed, that is an ADR, not a plan — use the
`write-adrs` skill.

## Commands

| Command | Aliases | Purpose | Writes | Reference |
| --- | --- | --- | --- | --- |
| `init <name> [--simple]` | `scaffold` | Create the objective folder and an empty `objective.md` to think into. `--simple` scaffolds a single un-nested goal instead | yes | [init.md](reference/init.md) |
| `create-research` | `generate-research-plan` | Turn `objective.md` into a research plan, fan out subagents, land findings in `research/` | yes | [research.md](reference/research.md) |
| `create-plan` | `compile-research-to-plan` | Compile `research/` into numbered plan documents | yes | [plan.md](reference/plan.md) |
| `create-goals` | `compile-goals` | Cut the plan into bounded, ordered goals under `goals/` | yes | [goals.md](reference/goals.md) |
| `execute <goal>` | — | Run one goal to completion, summarize it, complete it | yes | [execute.md](reference/execute.md) |
| `audit` | — | Specialist reviewer panel critiques the plan or goals, then remediate | yes | [audit.md](reference/audit.md) |
| `complete-goal <goal>` | — | Move a finished goal and its summary into `goals/_completed/` | yes | [complete.md](reference/complete.md) |
| `complete-objective` | — | Write the archive summary and retire the folder | yes | [complete.md](reference/complete.md) |

Routing:

- **Explicit command** — load its reference and follow it.
- **No command** — work out which phase the objective is in by reading its folder (see
  [structure.md](reference/structure.md)), state that, and offer the next command. Do not guess and
  proceed.
- **A goal file named with no command** — `execute`. That is the `/goal` entry point:

  ```
  /goal /write-objectives execute execute-goal-01.md until complete
  ```

Never run `create-goals` before `create-plan`, or `create-plan` before there is research. Each phase
consumes the previous phase's output; skipping one produces goals that read plausibly and are not
grounded in anything.

## Two scales, one command set

Work too small for a full objective runs the same lifecycle with fewer artifacts. There is no second
command set — every command detects which scale it is operating at and adjusts its paths:

| Detected | Scale | Paths |
| --- | --- | --- |
| `<name>/objective.md` exists | Objective | `<objectives>/<name>/…` |
| `goals/<goal-name>/goal.md` exists | Simple goal | `<objectives>/goals/<goal-name>/…` |

At simple scale, `create-plan` and `create-goals` do not apply: the research feeds straight into
`goal.md`, which is written to the same full contract format. `execute`, `audit`, and `complete-goal`
work unchanged. `complete-objective` does not apply — a simple goal archives by moving its own
folder.

**State which scale you detected before acting.** Read [simple-goals.md](reference/simple-goals.md)
before running any command against a `goals/<goal-name>/` folder, and before choosing between the
two at `init`.

## Reference

| File | What it is |
| --- | --- |
| [structure.md](reference/structure.md) | Folder layout, file naming, phase detection, and the state of an objective |
| [init.md](reference/init.md) | Scaffolding a new objective |
| [research.md](reference/research.md) | The research plan and the subagent fan-out |
| [plan.md](reference/plan.md) | Compiling research into numbered plan documents |
| [goals.md](reference/goals.md) | Cutting bounded goals with clear acceptance criteria |
| [execute.md](reference/execute.md) | Running a goal and summarizing it |
| [audit.md](reference/audit.md) | The reviewer panel and remediation |
| [complete.md](reference/complete.md) | Completing a goal, and archiving an objective |
| [simple-goals.md](reference/simple-goals.md) | The same lifecycle for work too small for a full objective |
| `reference/templates/` | The file templates every command writes from |
