---
description: Where the zd workbench stands — phase, next task, untriaged feedback, health
allowed-tools: Read, Grep, Glob, Bash(git log:*), Bash(git status:*), Bash(grep:*), Bash(wc:*), Bash(npm test:*), Bash(npm run check:*)
---

# zd status

Read-only. Answer the question and stop — do not fix anything you notice, and do not start work.

Task list: @docs/planning/objectives/todo.txt
Inbox: @docs/planning/objectives/FEEDBACK.md
Agent queue: @docs/planning/objectives/agent-findings.md

Work out and report, in this order:

1. **Phase** — which `+p<N>` has open tasks, and how many done vs total in it. Lines starting
   with `x ` are done. `/archive` moves older ones to `docs/planning/objectives/todo-archive.txt`, so count done
   lines in **both** files — reading only the task list makes finished work look undone and the
   phase look younger than it is.
2. **Next up** — the next open task the way `/session` would choose it: the **first open line in
   file order inside the live band**, the live band being everything above the first `CHECKPOINT`
   not marked `x `. Name it and its `est:`. Never name a task from below that checkpoint as next
   up, however urgent it looks — `/session` cannot take it. If every line in the band is done or
   carries a written block, say so plainly: the checkpoint is next, which means it is time to go
   use the app, not to write code.
3. **Untriaged feedback** — how many lines sit below the `---` in `docs/planning/objectives/FEEDBACK.md`, and how many
   start with `!`. Report the `docs/planning/objectives/agent-findings.md` count separately; human notes outrank it.
   If there are any, say that `/triage` should run before `/session`.
4. **Blocking pile** — count of open `(A)` tasks. Note whether it is growing across recent
   commits.
5. **Health** — last few commits, whether the tree is clean, and whether the branch is ahead of
   origin. Run `npm run check` only if the tree is dirty; a clean tree at a commit was already
   verified when that commit was made.

Keep it to a screenful. This runs between sessions to decide what to do next, not to produce a
report.
