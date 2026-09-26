# Good engineering

Status: **binding for v1 changes**

- Prefer a small working system over an abstract framework.
- Give important state one owner. Views project state; they do not duplicate it.
- Build deep modules with narrow interfaces around documents, workspaces, Markdown, review, handoff,
  images, and terminal lifecycle.
- Design important choices twice and record durable architecture choices as ADRs.
- Keep handwritten production files below 500 lines when practical. Split by responsibility.
- Keep operations bounded. Reject ambiguous paths, ranges, encodings, and external responses.
- Use exact source coordinates for edits and review. Never infer a source range from styled cells.
- Test behavior at module boundaries and through real files or processes where that is the boundary.
- Add a failing regression test before fixing a discovered error.
- Preserve terminal state, disk bytes, and document dirty state until an operation has succeeded.
- Treat clipboard data, repository files, Markdown, process output, and paths as untrusted input.
- Keep dependency and runtime ownership small. `zd` is a foreground TUI, not a service supervisor.
- Make errors specific and actionable. Do not catch and discard failures.
- Keep commits focused, green, and described by short one-line messages.
