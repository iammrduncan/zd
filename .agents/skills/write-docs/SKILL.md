---
name: write-docs
description: Write and audit user-facing documentation using the Diátaxis framework. Use when drafting a tutorial, how-to guide, reference page, or explanation; when a page is confusing and its type is unclear; when a page has grown into two documents; or when deciding what kind of page a topic needs. Covers reader-goal-first drafting and the failure mode of each page type.
---

# Writing documentation

Documentation fails in four ways, and each of them is a page trying to do a job it is not shaped
for. [Diátaxis](https://diataxis.fr/) names the four jobs. Almost everything useful follows from
deciding which one a page is doing, and then not doing the other three.

## The rule that governs every command

**One page, one primary type.** A supporting section of another type is fine. A page that has become
two full documents joined together is split and linked, never merged harder.

The commonest defect is not bad writing. It is a page that answers a question the reader did not
ask, in the middle of answering the one they did.

## Commands

| Command | Purpose | Writes |
| --- | --- | --- |
| `classify [target]` | Decide which of the four types a page is, or should be | no |
| `write [topic]` | Draft a page of one declared type | yes |
| `audit [target]` | Report where a page mixes types, buries the goal, or leads with implementation | no |
| `split [target]` | Propose the split when a page serves two tasks | no |

Routing:

- **Explicit command** — load its reference and follow it.
- **A bare target** — `classify`. It is the cheapest useful thing, it changes nothing, and every
  other command depends on its answer.
- **"This page is confusing"** — `audit`. It will usually find a type problem, not a prose problem.
- **A new page** — `classify` first to fix the type, then `write`.

Never `write` without a declared type. A draft that has not decided what it is becomes all four at
once, and that is the defect this skill exists to prevent.

## Not a language standard

This skill decides what a page is **for** and how it is **shaped**. It does not constrain vocabulary
or sentence form.

If a document must meet ASD-STE100 — a procedure for readers whose first language is not English —
that is `simplified-technical-english`, invoked separately. Do not reach for it by default.
Product documentation should be *readable*, which is not the same as *controlled*, and a tutorial
written like a maintenance manual has traded one failure for another.

## Reference

| File | What it is |
| --- | --- |
| [reference/types.md](reference/types.md) | The four types, what each is for, and how each fails |
| [reference/classify.md](reference/classify.md) | Deciding the type, including when it is genuinely unclear |
| [reference/write.md](reference/write.md) | Drafting: reader-goal-first, and the shape of each type |
| [reference/audit.md](reference/audit.md) | Finding type mixing, buried goals, and implementation-first openings |
| [reference/split.md](reference/split.md) | Proposing a split without duplicating |

Before writing, read the target repository's guidance and nearby pages for local conventions: where
pages live, what is generated, and what vocabulary is banned. This skill does not choose placement.
