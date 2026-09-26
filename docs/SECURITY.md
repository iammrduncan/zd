# Security boundary

`zd` opens one canonical project selected by the user. File traversal, search, review storage, and
image installation stay beneath that root and do not follow symlinks. Text and external output are
bounded and terminal control characters are sanitized before display.

Markdown is untrusted data. Raw HTML does not execute and remote images are not fetched. Agent
handoff uses separated process arguments and never interpolates selected text into a shell command.
Submission requires an explicit target and confirmation.

Clipboard image access is local and capability-gated. Unsupported, headless, or remote sessions fail
without changing the document. `zd` does not offer network listeners, browser endpoints, shell/PTY
hosting, or agent-session control.

Report vulnerabilities privately to the repository owner. Do not include secrets or private project
content in a public issue.
