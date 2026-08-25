# Simple goals

Work too small for a full objective, run through the same lifecycle at smaller scale.

## When to use one

A simple goal fits when the work is one bounded deliverable: a single research question and a single
change, reviewable as one unit. "Add motion capture to the inspection harness" is a simple goal.
"Make the demos best-in-class" is an objective.

Test: **would this produce more than one goal?** If yes, it is an objective — use `init <name>`.

Getting this wrong in the cheap direction is fine. A simple goal that grows can be promoted; an
objective scaffolded for a two-hour change is dead weight.

## Layout

Simple goals live beside the objective folders rather than inside one:

```
<objectives>/
  goals/
    <goal-name>/
      goal.md                      the contract, same format as execute-goal-NN.md
      research/
        00-<finding>.md
        subagent_outputs/
          00-<agent-name>.md
      summary.md                   written on completion
    _completed/
      <finished-goal-name>/
        goal.md
        research/
        summary.md
```

Differences from a full objective:

| | Objective | Simple goal |
| --- | --- | --- |
| Folder | `objectives/<name>/` | `objectives/goals/<goal-name>/` |
| Intent file | `objective.md` | folded into `goal.md` |
| Plan documents | `NN-<title>.md` at root | none — the goal is the plan |
| Goals | many, `goals/execute-goal-NN.md` | one, `goal.md` |
| Archive | `_archives/<name>-summary.md` | `goals/_completed/<goal-name>/` |
| Numbering | two-digit sequence | none — the folder name is the identity |

The archive difference matters: a completed simple goal keeps its whole folder, moved into
`_completed/`. There is no separate durable summary, because the goal and its summary together are
short enough to keep whole.

## Lifecycle

The same five phases, compressed:

```
init --simple → create-research → (goal.md written directly) → execute → complete-goal
```

1. **`init <goal-name> --simple`** creates `objectives/goals/<goal-name>/goal.md` from
   [templates/execute-goal.md](templates/execute-goal.md), with the owner's intent at the top under
   a `## Intent` heading. There is no separate `objective.md`.

2. **`create-research`** works as in [research.md](research.md), writing into the goal's own
   `research/`. Usually one or two subagents. Skip it only when the change is genuinely understood
   already — and say you skipped it, in `goal.md`.

3. **No `create-plan` or `create-goals`.** The research feeds straight into `goal.md`, which is
   written to the full contract format in [goals.md](goals.md). Every section still applies:
   prerequisites, required outcome, required tests and evidence, explicit non-goals, engineering
   constraints, completion definition. A simple goal is smaller in scope, not looser in contract.

4. **`execute`** works as in [execute.md](execute.md). The summary is `summary.md` in the goal's own
   folder.

5. **`complete-goal`** moves the whole folder:

   ```bash
   git mv <objectives>/goals/<goal-name> <objectives>/goals/_completed/
   ```

   Then fix the relative links the move broke, and update the index.

`audit` applies unchanged, and is worth running on a simple goal whose blast radius is larger than
its size — a small change to a shared boundary deserves the panel more than a large change to an
isolated one.

## Promoting a simple goal

When research shows the work is really several goals, stop and promote it rather than growing
`goal.md` into an objective in disguise:

1. `init <name>` for a real objective folder.
2. Move the research across, keeping `subagent_outputs/` intact.
3. Write `objective.md` from the simple goal's `## Intent` section and what research found.
4. Continue with `create-plan`.
5. Remove the simple goal folder, and say in the objective's README where it came from.

Tell the owner you promoted it and why. Discovering the work is bigger than it looked is a finding,
and it is one they need.

## Routing

The commands are the same. `init` takes `--simple`; every later command detects which layout it is
in by looking for `goal.md` versus `objective.md` and adjusts its paths. State which layout you
detected before acting.
