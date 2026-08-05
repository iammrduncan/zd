# Anchor documents

The commands are small because they carry no intent. They know how to pick one task, do it,
and stop. What the thing is supposed to *be* lives somewhere else — in a handful of documents that
every task line cites by tag.

This is the part people skip when they copy a workflow, and it is the part that makes it work. An
agent that has to reconstruct the point of the product at the start of every session will drift,
and it will drift confidently. An agent that is told "read §4.1, it is nineteen lines" will not.

## The convention

| Document | Answers | Cited by | Written by |
| --- | --- | --- | --- |
| `vision.md` | What this should be, and for whom | `vis:N.N` | You |
| `DESIGN.md` | What it looks and feels like, in numbers | task text, `DESIGN.md §N` | You |
| the plan | What order, what done means, and the rules we work under | `+p<N>`, `sess:N.N` | You |
| `goals/<name>/` | The thinking behind one bounded piece of work | prose | You, then the agent |
| prior findings | What a previous attempt actually got wrong | `ref:<id>` | Frozen evidence |

Two properties make a document an anchor rather than a document. It is the **source of truth** for
one class of decision — when it and the code disagree, one of them is a defect and you have to say
which. And it is **addressable** — numbered sections, so a one-line task can point at the exact
paragraph it implements and a session can read nineteen lines instead of three hundred.

---

## `vision.md` — what it should be

The product, stated as intent. Not a spec of screens, not a backlog. It is the document that says
what you are trying to make someone feel, and what you are refusing to build.

A shape worth copying, from the one this workflow came out of:

| § | | |
| --- | --- | --- |
| 1 | Why this exists | The pain, named concretely, and who has it |
| 2 | Product character | The five or six adjectives, made falsifiable |
| 3 | Context | Where it sits in a larger thing, and what that obliges |
| 4–7 | The experience | The actual sections tasks cite, broken to `4.1`, `4.2` |
| 8–10 | Constraints | Typography, platform, performance — the ones that are product decisions, not implementation ones |
| 11 | **Explicitly out of scope** | Recorded so it cannot creep back in mid-build |
| 12 | **How we know it is right** | The acceptance definition, kept deliberately small |
| A | Prior findings, folded in | A table mapping each old finding to the section that now covers it |

Sections 11 and 12 do the most work and are the two most often missing.

**11 is a fence.** "Signing, notarization, coverage ratchets, plugin systems, sync, publishing" —
written down before the build starts, so that when one of them shows up wearing a suit and calling
itself a blocker, there is a line to point at. Roughly a third of the run that produced this
workflow went into release engineering for an app nobody had used yet, and none of it was ever
decided on — it just arrived.

**12 is a terminal condition.** Three or four sentences saying how you will know. If it cannot be
finished, the work cannot be finished either. The version in this repo is: focused automated
tests, *real daily use*, and a short native checklist per phase. Notice that the middle one is a
human using the thing, and it is deliberate.

**Appendix A** matters if you are rebuilding something. Old findings get folded in as positive
requirements and mapped, so the vision stays a single readable document and nothing is lost. A bug
ledger carried alongside a vision is two sources of truth.

Rules that keep it usable:

- **The agent does not rewrite it.** `/triage` is instructed to stop and say so when feedback
  contradicts the vision, rather than quietly adjusting either one. That contradiction becomes a
  `DECIDE` task, and rewriting the section afterwards is its own task with its own commit. Both of
  those happened here on day one, and the vision is better for having changed loudly.
- **Date it and say what it supersedes.** When there are two, you must be able to tell in one line
  which is live.
- **Number everything you expect to be cited.** An unnumbered section cannot be a `vis:` tag, so
  in practice it will not be read.

## `DESIGN.md` — what it looks like, in numbers

The design system. Every size, colour, rhythm, type role, and surface contract, stated as the
thing the code has to implement.

It is separate from the vision because they answer different questions and change at different
rates. The vision says *calm, typographic, chrome-free*. `DESIGN.md` says 620px measure, the four
faces and no synthetic weights, this step between heading levels, this dim ratio for unfocused
text. One is what you are going for; the other is the number you can be wrong about.

What makes it binding rather than decorative:

- **A status line and an authority section.** Ours opens `Status: canonical and binding` and then
  says outright what wins when documents disagree. Without that, a design doc is a mood board that
  loses every argument with a deadline.
- **The code implements it, and the mapping is direct.** `DESIGN.md §5` becomes design tokens
  nearly line for line. The consequence is worth stating in the session rules: a hardcoded hex or
  px in feature code is a **defect against this document**, not a style nit — that is why one of
  `zd`'s project rules is exactly that sentence.
- **Numbered like the vision.** So a task can say `DESIGN.md 5.3 contradicts itself` and mean
  something exact — a real task line from this repo, which became a `DECIDE`, which became an
  answer written back into the line.
- **It is allowed to be wrong.** Two of the first day's tasks were "`DESIGN.md` 5.3 says both 620
  and 560" and "the anchor position is unspecified in 7.6". Contradictions inside an anchor
  document are findings, and they are cheap to fix precisely because the document is numbered.

If your project has no visual surface, do not invent one. The general form is: *the contract for
how it must behave that is not captured by "it works"* — API shape and error taxonomy, tone and
house style, latency budgets. If you cannot name one, skip the document. Most abandoned products
are abandoned over feel, though, so be honest about whether you really have no such contract.

## The plan — what order, and the rules

Phases numbered `0..N`, each broken into 30–60 minute sessions with a *done when* line. That is
what `+p<N>` and `sess:N.N` point at, and what `/status` reports progress against.

Three things belong here that people put elsewhere or nowhere:

- **A "done when" per session**, written as an observable state. Not "work on the sidebar".
- **Checkpoints, placed before you start.** One at the end of every phase, and one wherever you do
  not actually know whether the next thing is right. They become `CHECKPOINT` lines in the task
  list, and they are the terminal condition that makes it safe to run sessions in a loop. A plan
  with none of them is a plan that never asks you to look at what you built.
- **Decreasing detail with distance.** Phase 1 in sessions, phase 4 in a sentence. Planning phase 4
  in detail before phase 1 has been used is how you build things nobody wants, and real use
  reorders everything after the first checkpoint anyway.
- **The operating rules, with their evidence attached.** `/session` cites this document by name
  when it refuses to fan out or to grow its own scope. A rule with its reasoning attached survives
  contact with an agent; a bare instruction gets optimized around.

The plan is also the right place for the decision record — what stack, what got archived, what
survives and why. It is the document you hand someone who asks "why is it like this".

## `goals/<name>/` — one bounded piece of work

A folder per goal, holding the thinking that a vision section is eventually distilled from:

| | |
| --- | --- |
| `initial_thoughts.md` | Raw, unedited, yours. Half-formed is the point. Never cleaned up. |
| `goal.md` | The bounded ask: what to build, acceptance criteria, explicit exclusions. |
| `research/` | What the agent found out. Its output, kept out of your thinking. |
| `resources/` | Reference material the goal depends on. |

Most of these folders should be nearly empty for a long time. `zd` has eight of them and five are
one file of half-formed thoughts, which is correct — they are a place to put an idea so it stops
taking up room in your head, not a commitment to build it.

**This is where scope is bounded or lost, so it is worth being blunt about.** The goal file that
produced the 18-hour run behind this workflow said: *"build all features as described in bdd"*,
*"it must be utterly perfect"*, *"use a multi-agent fanout"*, *"work until all AC are completed"*.
Every one of those reads like ambition and functions like a removed brake. There is no terminal
condition in that file, so there was none in the work.

A goal file needs the two things that one lacked: a **terminal condition** you could check without
opinion, and an **explicit exclusions list**. If you cannot write the exclusions, the goal is not
bounded yet, and no amount of session discipline downstream will fix that.

## Prior findings — frozen evidence

When a previous attempt shipped and you saw what it got wrong, that list is an anchor too, and the
`ref:<id>` tag points at it. It has one rule: **it is never edited.** Findings get folded into the
vision as positive requirements and mapped in an appendix; the original list stays as it was
written, with its original ids, because it is the record of what actually happened rather than
what you now think about it.

The same goes for a postmortem. The operating rules are only followed when the cost of ignoring
them is legible, and that is what the postmortem is for. Nobody obeys "no subagent fanout". People
do think twice when the line next to it reads *74 threads sharing one worktree, colliding on the
same two files*.

## What makes a document an anchor

A checklist, if you are deciding whether something qualifies:

1. **Numbered**, so a task can cite one section.
2. **Owned by a human**, changed deliberately, in its own commit, with a visible diff.
3. **Small enough** that the cited section can be read inside a session.
4. **Opinionated enough to be contradicted** — a document nothing can conflict with decides
   nothing.
5. **Dated, and says what it supersedes.**
6. **Carries its own out-of-scope list.**
7. **Actually cited.** A section no task ever points at is decoration. Grep for its tag.

Two or three of these documents is a working system. Seven is a documentation project, and
documentation projects are how people avoid building the thing.

## When they disagree

Declare an order once, in the design document's authority section, and then hold it. In this
repo's terms: the vision says *what*, the design system says *how it looks*, the plan says *when*,
and the tests say *whether it works*.

When two anchors genuinely conflict, that is a `DECIDE` task with the answer written back into the
task line — not a judgement call made silently at 2am by whoever happens to be editing the file.
The point of writing the answer into the line is that six weeks later the question comes back, and
the line is still there with `ANSWERED` on it.
