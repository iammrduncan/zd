---
name: zd-status
description: Report the current zd phase, next eligible task, untriaged feedback, blocking-task trend, git state, and project health without making changes. Use when the user asks for project status, what is next, current phase progress, inbox counts, or repository health.
---

# Report zd status

Treat `.claude/commands/status.md` as the canonical workflow. Read it completely at the start of every invocation, then follow it exactly.

Apply these Codex translations while following the file:

- Treat `@path` references as instructions to read that repository-relative file when the workflow calls for it.
- Use the available task-plan tool to track the read-only checks and keep it current.
- Translate command references for the user as `/session` to `$zd-session`, `/triage` to `$zd-triage`, `/status` to `$zd-status`, and `/archive` to `$zd-archive`.

Keep the operation read-only. Do not fix, reformat, commit, or otherwise change anything found during the status check.
