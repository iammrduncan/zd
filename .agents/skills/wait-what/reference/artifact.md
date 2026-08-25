# wait-what &lt;path&gt;

Something written in a file does not read. Work out **why**, say so, and hand it to the skill that
owns the fix.

## This routes. It does not rewrite.

A confusing file is rarely fixed by re-pitching a sentence. The prose is usually the symptom:
either the thinking underneath was never pinned down, or the document is the wrong shape for what it
is trying to do. Rewriting the sentences leaves both causes in place and makes the next reader
believe the problem is solved.

So this command produces a diagnosis and a hand-off, not an edit.

## Procedure

### 1. Read it back

Read the file. Then state, in one or two sentences, **what you believe it is saying**. This is the
step that finds the problem: if you cannot state the claim, the file has no claim, and that is the
finding.

Do not read the surrounding code or the linked documents yet. The reader of this file will not have
done that either, and their experience is what is being diagnosed.

### 2. Name the failure

Work down this list and stop at the first that holds:

| Failure | Looks like | Hand to |
| --- | --- | --- |
| **The thinking is unresolved** | Contradicts itself, hedges the central claim, or describes two incompatible things as one | `engineering talk-it-out` |
| **The decision is undocumented** | Depends on a choice nobody recorded, and the file is quietly re-deciding it | `write-adrs suggest` |
| **The shape is wrong** | Mixes reference with tutorial, buries the goal under implementation, serves two readers at once | `write-docs classify` then `audit` |
| **The prose is the problem** | The claim is clear and the structure is right, but the sentences are long, passive, or full of unapproved vocabulary | `simplified-technical-english audit` |

Only the last one is a writing problem. Reach for it last, because it is the one that looks like the
answer and usually is not.

### 3. Hand it over

Say all three:

1. **What you understood it to say** — from step 1, so the author can see where it diverged;
2. **Which failure it is** and the evidence, quoting the file;
3. **Which skill takes it from here**, and what you would ask that skill to do.

Then stop. Do not run the other skill in the same breath unless asked — the author may disagree
with the diagnosis, and that disagreement is cheap now and expensive after an edit.

## Do not

- Do not edit the file. Not even the obvious typo — an edit signals the diagnosis was accepted.
- Do not reach for the writing skill first because prose is visible and structure is not.
- Do not produce a list of every small thing. One diagnosis: the one the others follow from.
- Do not say "this could be clearer". That is the complaint, not the diagnosis.
