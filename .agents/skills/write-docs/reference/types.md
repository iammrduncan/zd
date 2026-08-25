# The four types

Diátaxis separates documentation by what the reader needs. The definitions are easy and the
application is not, so each type below is given with **the way it fails** — which is what you will
actually recognise in a real page.

## The map

Two axes place the four:

|  | **Practical** (doing) | **Theoretical** (thinking) |
| --- | --- | --- |
| **Learning** (study) | Tutorial | Explanation |
| **Working** (lookup) | How-to guide | Reference |

Use the axes when a page's type is genuinely unclear: ask whether the reader is *acquiring* a
capability or *applying* one, and whether they need to *act* or to *understand*. Two questions
settle most cases.

## Tutorial

**Reader need:** learn by completing something, with a visible result.

The reader does not yet know what they do not know. They cannot make choices, because they have no
basis for choosing. Your job is to get them through a complete, safe experience so that afterwards
they have something to reason from.

- Every step is concrete. No "configure as appropriate".
- The result is visible. They should see something happen.
- It works. A tutorial that breaks halfway costs more trust than no tutorial.

**Fails when it explains.** The urge to justify a step is strong and it is wrong: the reader has no
frame for the justification yet, and it stops the momentum the tutorial depends on. Move it to an
Explanation and link it.

**Fails when it branches.** "If you are using X, do this; otherwise…" hands the reader a decision
they are not equipped to make. Pick one path. That is the tutorial's promise.

## How-to guide

**Reader need:** finish a specific real task, now.

The reader already has competence and a goal. They arrived from a search with a problem in hand.

- Named after the task, in the reader's words: "Change a point light while the game runs".
- Adaptable — they will apply it to their situation, which is not yours.
- Assumes competence. It can say "authenticate as usual".

**Fails when it teaches.** A how-to that explains the concepts first has become a tutorial with a
task-shaped title, and the reader who already knew that has to scroll past it every time.

**Fails when it is complete.** A how-to covering every variation is a reference. Cover the task.

## Reference

**Reader need:** look up an accurate fact while working.

The reader is mid-task and needs a specific value, signature, or limit. They are not reading; they
are scanning.

- Structured predictably, so the shape can be learned once. Same headings, same order, every page.
- Complete and accurate over readable. This is the one place where dryness is correct.
- States defaults, limits, and errors. Those are the facts people come for.

**Fails when it narrates.** Prose between the facts makes scanning impossible. If it has a
paragraph of context, that paragraph belongs in an Explanation.

**Fails when it advises.** "You should usually…" is an opinion, and opinions belong in
Explanation or How-to. Reference describes the machine, not the choice.

## Explanation

**Reader need:** understand why the system is like this.

The reader is not doing anything right now. They are trying to build a model — often because
something surprised them.

- Discusses alternatives and why they were not taken.
- Names the tradeoff. An explanation with no cost in it is marketing.
- Can be read away from the keyboard.

**Fails when it becomes actionable.** Steps creeping into an explanation turn it into a how-to that
is hard to follow, because its structure is argumentative rather than sequential.

**Fails when it has no position.** "There are many approaches" explains nothing. Say what this
system does and why that choice was made.

## The confusion table

What a mistyped page looks like in the wild:

| Symptom | Probably | Should be |
| --- | --- | --- |
| Steps interrupted by paragraphs of rationale | Tutorial with Explanation folded in | Two pages, linked |
| Starts by defining terms before the task | How-to with a tutorial preface | Cut the preface |
| Signature tables with "you should usually" | Reference with an opinion | Move the opinion out |
| Concept page ending in a numbered procedure | Explanation that grew a how-to | Two pages, linked |
| Page serving both a first-timer and an expert | Two documents joined together | Split |
