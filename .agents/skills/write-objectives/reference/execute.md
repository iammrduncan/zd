# execute

Run one goal to completion, write its summary, and complete it.

This is the `/goal` entry point:

```
/goal /write-objectives execute execute-goal-01.md until complete
```

## Procedure

### 1. Read the goal, then check you can start

Read the goal file in full, then its prerequisites:

- Are the prerequisite goals complete? Check `goals/_completed/`.
- Does it need something from the owner that has not been supplied? **Stop and ask.** Do not start a
  goal whose stated operator input is missing, and do not substitute your own judgement for a
  decision the goal says is theirs.
- Is a goal that shares its owned files currently in flight? If so, wait or say so.

Read the plan documents it cites. The goal is a contract; the plan is why the contract says what it
says, and you will need that when reality does not match.

### 2. Work the goal

Follow **Required outcome** as the specification and **Explicit non-goals** as the boundary.

- Write the failing test first where the goal calls for tests. Watch it fail. Then make it pass.
- Stay inside the owned file set. Touching a file the goal does not own is a scope breach — stop and
  report instead.
- Keep to the repository conventions in **Engineering constraints**: commit style, file limits, what
  is gitignored, which `AGENTS.md` applies.

### 3. Honour the stop condition

Every goal has one. When you hit it, stop and report. Do not:

- weaken a test to make it pass;
- widen scope to route around a blocker;
- ship a partial deliverable described as complete;
- decide an owner question yourself because stopping is inconvenient.

A goal halted at its stop condition with a clear report is a success. It is what the condition is
for.

### 4. Verify against the goal's own criteria

Work through **Required tests and evidence** item by item. For each, record what you ran and what it
produced. An item you cannot satisfy is stated as unsatisfied — not omitted, and not reinterpreted
into something you did satisfy.

Then check **Completion definition** as a whole. All of it, or the goal is not complete.

### 5. Write the summary

`goals/summary-goal-NN.md`, from [templates/summary-goal.md](templates/summary-goal.md). The
project's own completed summaries are the best exemplar; read one before writing your first.

The summary leads with **Action needed from the owner** — a table of what needs them, why it needs
them specifically, and what it blocks. If nothing does, say that explicitly. Burying an owner
decision at the bottom of a summary is the failure this format exists to prevent.

Then record:

- what was delivered, with commits;
- **what you got wrong and corrected**, including anything a later check disproved. A summary that
  reports only success is not a record, it is a press release. A good summary will supersede its own
  headline finding when a later check disproves it;
- traps found: bugs, surprises, and stale comments worth knowing about even though they are fixed;
- what is now unblocked, and what remains blocked.

### 6. Complete the goal

Move both files into `goals/_completed/` — see [complete.md](complete.md). Fix the relative links
that the move breaks.

### 7. Regenerate the objective README

Update the phase, the open-goal list, and anything now awaiting the owner.

### 8. Report

Point at the summary rather than repeating it. State plainly:

- whether the goal is complete, partially complete, or halted at its stop condition;
- what needs the owner;
- what is unblocked.

## When the goal turns out to be wrong

A goal is written from a plan, and a plan is written from research that may be incomplete. When
execution shows the goal is wrong — its outcome is impossible, its premise is false, its tests
cannot mean what they say — stop.

Report the conflict precisely: what the goal requires, what is actually true, and what you found.
Do not rewrite the goal to match what you managed to do. Either the owner adjusts it, or `audit`
looks at it, or the plan changes. All three are better than a goal quietly redefined to be
achievable.
