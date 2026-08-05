---
description: Move completed tasks out of the task list into an archive, changing nothing else
argument-hint: "[optional filter, e.g. +p1 — archives only finished lines matching it]"
---

# Archive completed tasks

Bookkeeping only. **Write no product code, and change no open task.** This command moves finished
lines out of the way and does nothing else — not re-prioritising, not re-tagging, not tidying.

Task list: @{TODO}

Archive only lines matching this, if given: $ARGUMENTS

## Why this exists

`{TODO}` is the plan and the session log in one file, and finished lines are never deleted. That is
right, and it also means the file grows forever — by the time a phase is done, the open list is a
handful of lines buried under a hundred finished ones, and the thing you read every day gets harder
to read every day. Archiving keeps both: the log survives, the plan stays short.

## What to do

1. **Count first.** `grep -c '^x ' {TODO}` and `grep -vc '^x ' {TODO}`. State both numbers before
   touching anything — they are what proves nothing was lost.
2. Take every line starting with `x `. If `$ARGUMENTS` is given, take only those that also contain
   it — `/archive +p1` archives phase 1's finished lines and leaves the rest alone.
3. Append them **verbatim and in file order** to `{TODO_ARCHIVE}`, under a `## <today>` heading
   (`date +%F`). Create the file with this header if it does not exist:

   ```
   # {PROJECT} — completed tasks, moved out of {TODO} by /archive
   # Same format as the task list. Newest block last. Nothing here is edited or deleted.
   ```

4. Remove exactly those lines from `{TODO}`. Everything else stays untouched and in its original
   order: the `#` legend, the `# ---` phase headers, blank lines, `CHECKPOINT` lines, and every
   open task.
5. If removing lines left a phase header with nothing under it, leave the header — an empty phase
   is information. Collapse a run of three or more blank lines to one. Change nothing else.

## Before you commit

- Open-task count is identical to step 1. **This is the check that matters**: if it moved, you
  deleted live work — `git checkout {TODO}` and stop.
- Lines added to `{TODO_ARCHIVE}` equal lines removed from `{TODO}`.
- `grep -c '^x ' {TODO}` is 0, or exactly the finished lines a filter excluded.
- Every `CHECKPOINT` line that was there is still there. A lost checkpoint means a loop runs
  straight past the point where a human was supposed to look.

Then commit on its own: `Archive completed tasks`.

## Report back

Two lines. How many moved and how many open tasks remain, then which phase is live and what
`/session` would pick next.
