---
description: Where {PROJECT} stands — phase, next task, untriaged feedback, health
allowed-tools: Read, Grep, Glob, Bash(git log:*), Bash(git status:*), Bash(grep:*), Bash(wc:*), Bash({CHECK_FULL})
---

# {PROJECT} status

Read-only. Answer the question and stop — do not fix anything you notice, and do not start work.

Task list: @{TODO}
Inbox: @{INBOX}
Agent queue: @{FINDINGS}

Work out and report, in this order:

1. **Phase** — which `+p<N>` has open tasks, and how many done vs total in it. Lines starting
   with `x ` are done. `/archive` moves older ones to `{TODO_ARCHIVE}`, so count done lines in
   **both** files — reading only the task list makes finished work look undone and the phase look
   younger than it is.
2. **Next up** — the next open task the way `/session` would choose it: highest priority, lowest
   phase. Name it and its `est:`. If it is a `CHECKPOINT`, say so plainly — that means it is time
   to go use the thing, not to write code.
3. **Untriaged feedback** — how many lines sit below the `---` in `{INBOX}`, and how many start
   with `!`. Report the `{FINDINGS}` count separately; human notes outrank it. If there are any,
   say that `/triage` should run before `/session`.
4. **Blocking pile** — count of open `(A)` tasks. Note whether it is growing across recent
   commits.
5. **Health** — last few commits, whether the tree is clean, and whether the branch is ahead of
   origin. Run `{CHECK_FULL}` only if the tree is dirty; a clean tree at a commit was already
   verified when that commit was made.

Keep it to a screenful. This runs between sessions to decide what to do next, not to produce a
report.
