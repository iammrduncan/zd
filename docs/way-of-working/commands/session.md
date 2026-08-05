---
description: Run one {PROJECT} session — triage feedback, do the next task, test it, commit it
argument-hint: "[session id like 1.3, or task text, or empty for the next open task]"
---

# Run one {PROJECT} session

One session = **one goal, one commit, 30–60 minutes.** Not a sprint. Not "and while I'm here".

Current task list: @{TODO}
Feedback inbox: @{INBOX}

The product spec is `{VISION}`. Do not read all of it — every task carries a `vis:N.N` tag naming
the exact section it implements. Read that section.

Requested: **$ARGUMENTS** (empty means "the next open task").

---

## 1. Triage the inbox first

**Only the lines below the `---` in `{INBOX}` are feedback** — everything above it is the file's
own instructions. If there is nothing below the rule, skip straight to step 2.

Otherwise triage before picking up new work. Real usage outranks the plan.

- Each line becomes a todo.txt task in the same format as the existing ones.
- A leading `!` means blocking → priority `(A)`, and it goes to the front of this session's
  candidates.
- Tag them `+fb fb:<today>` so feedback-driven work is distinguishable from planned work.
- Attach `@ctx`, `ref:<id>`, and `vis:N.N` tags where you can tell.
- Then append the **raw, unedited lines** to `{ARCHIVE}` under a `## <today>` heading, and reset
  `{INBOX}` to just its header and the `---`.

Preserve the user's own words in the archive. Do not "clean up" their phrasing — the raw complaint
is the evidence, your task line is the interpretation.

Then do the same for `{FINDINGS}`, the agent's own queue, tagging those `+found found:<today>`
instead. Human feedback is triaged first and outranks it.

Commit the triage on its own: `Triage feedback into tasks`.

## 2. Pick exactly one task

- If `$ARGUMENTS` names a session id (`1.3`), take that session's tasks — they're designed to fit
  one sitting together.
- If `$ARGUMENTS` is free text, match it against task subjects.
- If empty, take the highest-priority open task in the lowest phase. Open means the line does
  **not** start with `x `.
- **A `CHECKPOINT` line is not work.** If it's next, stop and tell the user it's time to go use
  the thing for a while. Do not implement past a checkpoint.

State the task and its `est:` before you start. If the estimate is over 60 minutes, split the task
in the task list first and take the first half.

## 3. Plan it

Use the task tool to lay out the steps, and keep it updated as you go. This is the project
convention and it's also how the user follows along.

Read the `vis:N.N` section of the vision. If the task has a `ref:<id>`, that's a defect a previous
attempt actually shipped — read what went wrong in `{PRIOR_FINDINGS}` before you rebuild it.

## 4. Do the work

- **Bug fixes are red-first.** Write the failing test, run it, watch it fail, then fix it. A fix
  without a test that failed first is not done.
- When you are working out *what is happening* rather than building, read
  [`diagnosis.md`](../diagnosis.md) first. Four rules, each one paid for: measure the round trip,
  distrust a harness that supplies what you are testing, file a suspect as a question, and read
  the file once a bisect has named it.
- {PROJECT_RULES}
- 500 lines is a warning, not a wall — when a file trips it, split at the nearest seam **in this
  session**, before committing.

## 5. Verify

Run the smallest sufficient thing. In rough order of cost:

```sh
{CHECK_FAST}      # unit — should stay under ~5s
{CHECK_FULL}      # typecheck + lint + unit
{CHECK_SLOW}      # end-to-end; only for claims the fast checks cannot make
```

Do not run the full ladder after every edit. Do not touch packaging, signing, coverage thresholds,
or release evidence — that is the last phase, and doing it early is what sinks prototypes.

**A catastrophic result is the one you re-run before believing.** Two or three failures are
evidence. Two hundred are a claim about the harness, and the harness is the thing you were about
to trust. This is not optimism — it is that a mass failure and a broken change look identical from
the outside, so the cheapest way to tell them apart is to ask twice. Seen in this repo: a run
reporting `11 passed` in 1.3 minutes, between four runs of `363 passed` in 19 seconds, with
nothing in the tree different. Re-running is what revealed it; a session that believed the first
number would have spent itself hunting a regression that was never there.

If it does not reproduce, **say so and leave the cause open**. The temptation is to file the most
plausible story, and a story with a date on it reads as a finding forever after. Write down what
you tried and what you could not make happen.

If something is red at 60 minutes, cut scope and commit what genuinely works. Say what you cut.

## 6. Commit and tick it off

One commit. Short one-line message, imperative, no body, no co-author trailers.

Then mark the task done in the task list by prefixing the line with `x ` and today's date
(`date +%F`), leaving the rest of the line untouched:

```
x 2026-07-29 (A) 2026-07-28 Wire markdown-it and transform markdown to DOM +p1 @reader sess:1.2 est:30m vis:4
```

Completed tasks stay in the file — it's the session log. `grep -v '^x '` is the open list.

**Edit that file with an exact-match replace that fails when the anchor does not match.** Never a
script that computes offsets — it will happily write whatever it computed. This has damaged the
plan twice in one repo: once writing one task line over another's subject, once truncating the file
from 102 lines to 37. Both were recovered with `git checkout` only because the file was already
committed. Everything else can be re-derived from the code and the history; this file is the only
record of *why*, and of what was tried and abandoned.

A grammar check over the task list is worth the twenty lines it costs — exactly one priority and
exactly one `est:` per line catches two merged lines, which is what a bad replace produces.

## 7. Hand it back

End with, briefly:

1. What now works that didn't before.
2. **Exactly what to look at** — the command to run and what to check. This is the part that
   closes the loop, because the user's reaction becomes the next triage.
3. What you deliberately did not do.
4. What's next in the task list.

## Rules that override your defaults

These come from `{RULES}`, where ignoring them cost real time:

- **No subagent fanout.** Zero, or one if a search is genuinely wide. Not five.
- **New problems you notice go in `{FINDINGS}`, not into this session.** The only exceptions are
  data loss, a crash, or a security hole. Scope that grows mid-session never converges. **Never
  write to `{INBOX}`** — that inbox is the human's, and the value of `{ARCHIVE}` as evidence
  depends on it holding only their words.
- **Never run this under a loop with no terminal condition.** Looping sessions until the next
  `CHECKPOINT` is the intended way to work — that condition is a line in the task list and you
  will hit it. A loop that runs "until done" or "until perfect" is the exact failure mode this
  workflow exists to prevent. Sessions are meant to end, and so are runs of them.
- **Leave a 60-second gap between sessions when looping** (`/loop 60s /session …`). The gap starts
  when a session finishes and the next one starts after it. Do not close it and do not fill it
  with work: it exists so the handoff above is readable and so there is a moment, with the tree
  clean and nothing half-done, when the human can stop the run.
- If you disagree with the task, say so in a sentence and do it anyway, or stop and ask. Do not
  silently substitute a different task.
