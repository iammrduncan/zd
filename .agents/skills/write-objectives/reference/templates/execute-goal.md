# Execute goal NN: <imperative statement of what this goal delivers>

<!-- Title states the outcome, not the area. "Unblock the render pipeline inside BroMetal and send
     the fixes upstream", not "BroMetal work". -->

## Prerequisites

<!-- Every condition that must hold before this starts. Link prior goals and say WHAT this needs
     from them, not just that they precede it. -->

- [Execute goal NN](_completed/execute-goal-NN.md) is complete. This goal needs <the specific thing>
  from it.
- <Whether the owner may release this ahead of a prerequisite.>
- <Concurrency: which goals own the same files and therefore must not commit at the same time.>

### Needed from the owner before starting

<!-- Required. If nothing, write "Nothing. This goal can start as written." An operator must never
     discover mid-execution that a decision was theirs. -->

| # | What | Why it needs you |
|---|---|---|
| 1 | <decision, approval, credential, or asset> | <why an agent must not decide this> |

## `/goal` objective

<!-- One or two paragraphs. What this delivers and what is blocked on it. Cite the plan document
     this comes from, with a line range. -->

This goal delivers <scope> from `<objectives>/<name>/NN-<PLAN-DOC>.md:LL-LL`.

<What is blocked on this, and what specifically goes wrong if it is done badly.>

## Required outcome

When the work is complete, the repository must have:

1. <concrete deliverable, with the file it lands in and a line reference where known>;
2. <...>;
3. <...>.

<!-- Each item must be checkable by someone else. "The renderer is faster" is not an outcome. -->

## In scope

- **<Work packet name>.** Owns `<file>`, `<file>`. <What is wrong now, what the change is, and the
  reasoning an executor needs — including any comment or prior decision they must understand before
  changing it.>
- **Serialisation.** <Which packets share files and must run in order.>
- **Evidence.** <What must be captured or recorded to show the work is real.>

## Required tests and evidence

At minimum, prove:

- <a specific, falsifiable assertion — the value, the threshold, the comparison>;
- <...>;
- <the check that the existing behaviour did NOT regress>;
- <the full test command that must be green, and any allowlist or manifest updated in the same
  commit>.

<!-- If you cannot phrase an assertion precisely enough to fail, you do not yet know what this
     goal delivers. Go back to the plan. -->

## Explicit non-goals

- Do not <the most tempting adjacent work>.
- Do not <the thing that would make this goal unbounded>.
- Do not <the shortcut that would make the tests pass without the outcome>.
- Do not <the decision that belongs to a later goal or to an ADR>.

## Engineering constraints

- <Which AGENTS.md applies, and the conventions from it that bind here.>
- <Commit style. Test requirements. File size limits.>
- <What is gitignored or LFS-tracked, and therefore what the committed artifact actually is.>
- <What must not be extracted, abstracted, or generalised yet.>
- <Preserve unrelated dirty worktree changes.>

## Completion definition

The goal is complete only when <every condition, stated as one paragraph>.

If <the condition under which the work cannot be done correctly>, stop and report the exact
conflict. Do not <the specific wrong thing that would satisfy the checklist while failing the
intent>. <What depends on this being correct rather than merely finished.>
