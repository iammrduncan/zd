---
name: zd-archive
description: Safely move completed zd task lines from docs/_internal/objectives/todo.txt to docs/_internal/objectives/todo-archive.txt while preserving open work, checkpoints, ordering, and counts. Use when the user asks to archive completed tasks, shrink todo.txt, or archive finished work with an optional tag filter such as +p1.
---

# Archive completed zd tasks

Treat `.claude/commands/archive.md` as the canonical workflow. Read it completely at the start of every invocation, then follow it exactly.

Apply these Codex translations while following the file:

- Treat text supplied with `$zd-archive` as `$ARGUMENTS`. With no supplied text, use an empty value.
- Treat `@path` references as instructions to read that repository-relative file when the workflow calls for it.
- Use the available task-plan tool to track the count, move, verification, and commit steps and keep it current.
- Translate command references for the user as `/session` to `$zd-session`, `/triage` to `$zd-triage`, `/status` to `$zd-status`, and `/archive` to `$zd-archive`.

Keep the operation bookkeeping-only. Change no product code and no open task.
