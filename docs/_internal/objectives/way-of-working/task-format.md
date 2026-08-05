# The task line

One file holds the whole plan and the whole log: `todo.txt`. Open work and finished work live in
the same file, in the same format, and the only difference is a leading `x `.

It is [todo.txt](http://todotxt.org) with a fixed set of project tags. Plain text on purpose —
`grep` is the query language, `git diff` is the history, and no tool has to be installed or running
for the plan to be readable.

## Grammar

```
[x <done>] (P) <created> <subject> [tags...] [VERDICT <why>]
```

```
(A) 2026-07-29 Quick Open flashes a blank frame between queries +p3 @workspace +fb fb:2026-07-29 ref:F13 vis:5.2 est:30m
x 2026-07-29 (A) 2026-07-28 Wire markdown-it and transform markdown to DOM +p1 @reader sess:1.2 est:30m vis:4
```

| Part | Means |
| --- | --- |
| `x <date>` | Done, on that date. Leading `x ` is the only marker of doneness. |
| `(A) (B) (C)` | Priority. Pick three meanings and never add a fourth — e.g. **A** on the path to daily use, **B** after daily use, **C** before shipping. |
| `<created>` | The date the line was written. It stays put when the line is completed. |
| `<subject>` | What is true when this is done, in one line, no jargon. |

| Tag | Means |
| --- | --- |
| `+p<N>` | Phase, from the plan. `+p0` … `+p5`. |
| `@ctx` | Area of the codebase — `@reader`, `@editor`, `@shell`. Your seams, not a fixed list. |
| `@COMPARE` `@DECIDE` | Explicit review controls. These exact tags drive tooling; the same words in prose do not. |
| `sess:N.N` | Session id from the plan. Tasks sharing one id are meant to fit one sitting together. |
| `est:NNm` | Target duration. Over 60m means the task is really two tasks. |
| `vis:N.N` | The section of the vision this implements. This is what makes "read the spec" affordable. |
| `ref:<id>` | A finding from a previous attempt that this task is the fix for. |
| `+fb` `fb:<date>` | Came from the human inbox on that date. |
| `+found` `found:<date>` | Came from the agent's own queue on that date. |

`+fb` and `+found` are worth the redundancy with the dates: they make "how much of this plan came
from actually using the thing" a one-line `grep -c`.

## Four line shapes that are not ordinary work

**`CHECKPOINT`** — a stop. It has no priority and `est:0m`, and it means: go use the thing for a
while and file what you hit. `/session` refuses to implement past one. Checkpoints are the only
mechanism in the system that forces real usage back into the plan, so they are load-bearing.

```
(A) 2026-07-28 CHECKPOINT daily driver stop and live on it before phase 3 +p2 @reset est:0m
```

**`@DECIDE`** — marks a question only the human can answer, parked as a task so it cannot be
silently decided by whoever touches the code next. The exact tag is the control signal; writing
the word DECIDE in a subject or verdict has no special effect. It closes with `ANSWERED <the
answer>` written into the line, which is why the answer survives where a chat message would not.

```
x 2026-07-29 (A) 2026-07-29 Unify reading and editing into one mode despite vision 4 and 6 +p1 @reset @DECIDE est:20m vis:6 ANSWERED yes unify fix the vision
```

**`@COMPARE`** — marks the work that makes a visual `@DECIDE` answerable by looking. It sits
immediately before the `@DECIDE` it serves and renders every viable option side by side with the
same content, viewport, and state. Label the options, but do not recommend or silently choose one.
The comparison closes when the handoff names one command that opens it and exactly what to inspect;
the `@DECIDE` stays open until the human writes the answer. A non-visual decision does not need a
comparison. Comparison artifacts use one `compare-<name>` basename across the dev HTML, design
source and styles, and focused browser spec. `zdloop` opens that page before it asks the paired
decision, then removes those four temporary files once the answer is submitted so the decision
commit retains the chosen production behavior rather than a growing gallery of rejected options.

```
(B) 2026-08-03 Render h3 to h6 with stepped space alone and stepped type side by side +p2 @design @COMPARE est:30m vis:4.2
(B) 2026-07-30 Choose whether h3 to h6 need bigger size steps as well as stepped space +p2 @design @DECIDE est:20m vis:4.2
```

**`RECURRING …`** — a standing obligation kept visible at the bottom of the file. It never gets an
`x `.

## Verdicts

A trailing word in caps, then the story in plain words. Used when the subject alone would leave a
false impression of what happened:

| | |
| --- | --- |
| `ANSWERED` | An `@DECIDE` line, resolved. The answer follows. |
| `NOTDEFECT` | Investigated, nothing was wrong. Say what fooled you. |
| `DEFERRED` | Deliberately not done. Say who deferred it and until when. |
| `WAS` | Done, but the diagnosis in the subject was wrong. The real cause follows. |
| `SEEN` | Observed in real use, so this is not a hypothetical. |

Add your own. The rule is only that it is one caps word followed by an explanation, so `grep
NOTDEFECT` keeps working.

## Reading the file

```sh
grep -v '^x ' todo.txt              # everything still open
grep -v '^x ' todo.txt | grep '(A)' # the blocking pile
grep '^x ' todo.txt | tail -20      # what the last few sessions did
grep '+fb' todo.txt                 # everything real usage caused
grep 'CHECKPOINT' todo.txt          # where the plan expects you to stop
```

Completed lines are never deleted or rewritten. The return is that `git log` and the plan tell the
same story, and a task that turned out to be wrong is still sitting there with its verdict
attached.

The cost is a long file, and past a certain length the open list gets hard to find inside it.
`/archive` is the release valve: it moves finished lines verbatim to `todo-archive.txt`, same
format and same tags, so every query above still works — point it at the archive, or at both:

```sh
grep '^x ' todo-archive.txt | grep '+p1'   # what phase 1 actually shipped
cat todo.txt todo-archive.txt | grep '+fb' # everything real usage caused, all of it
```

Moved, not deleted. If you find yourself wanting to delete a finished line, the thing you actually
want is to write the next line saying what you learned.
