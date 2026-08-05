# User-facing documentation guidance

## Audience and scope

These instructions apply to `docs/user-facing-docs/` and its child folders.

Write standalone product documentation for a person who wants to use `zd`. Do not require the
reader to understand this repository's plans, implementation history, release process, ADRs, or
agent workflow.

Read and follow [the documentation standards](DOCUMENTATION_STANDARDS_A.md) before you create,
reorganize, or substantially rewrite a page in this folder.

- Describe released, observable behavior.
- Lead with the normal user path.
- Put limitations and recovery guidance beside the operation they affect.
- Use public command and interface names exactly as the product exposes them.
- Keep one canonical page for each topic and cross-link instead of copying.

## Keep repository language out

Do not use objective, checkpoint, session, evidence, audit, or implementation-phase terminology in
user documentation. Those words describe repository work, not the reader's task.

User documentation must link only to other user documentation or stable root-level public files
such as `README.md`, `DESIGN.md`, `CONTRIBUTING.md`, and `SECURITY.md`.

## Verification

Update the documentation contract in
`packages/scripts/tests/unit/docs-information-architecture.test.ts` when public navigation or a
documented interface changes. Run that test and the affected product tests before committing.
