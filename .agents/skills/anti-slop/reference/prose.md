# `prose` — assertions a document cannot support

Read-only. Reports findings and writes nothing.

```bash
node <skill-dir>/scripts/prose_lint.mjs docs/*.md
node <skill-dir>/scripts/prose_lint.mjs --json --fail-on warning README.md
cat draft.md | node <skill-dir>/scripts/prose_lint.mjs -
```

Fenced code, inline code, link targets, HTML comments, and table rows are blanked before matching,
with positions preserved. Headings and list markers are stripped so the sentence inside them is
still checked.

## The two rules

### `no-unsupported-claim` — warning

A sentence fires when it does all three of these and none of the fourth:

1. names a **quality attribute** — `robust`, `scalable`, `maintainable`, `performant`, `secure`,
   `seamless`, and similar;
2. uses an **assertion verb** — `is`, `ensures`, `guarantees`, `provides`, `improves`, `enables`…;
3. has an **artifact subject** — `this`, `our`, `the system`, `the architecture`, `the design`…;
4. contains **no referent** — no digit, no link, no `ADR-nnnn`, no URL, and no evidence token
   (`measured`, `benchmark`, `profiled`, `p99`, `throughput`).

Sentences opening with an imperative or definitional word are excluded, because instructional prose
legitimately uses these adjectives without asserting anything. "Prefer a modular layout when the
boundary is obvious" is advice; "our design is modular" is a claim.

All four conditions are required. Removing any one of them produces false positives on ordinary
technical writing — the constraint that matters most is the artifact subject, without which the rule
fires on every definition and word-mention in the document.

**What this catches.** The defect in an AI-written architecture document is not vocabulary. It is
confident assertion with no referent. Nothing else checks this: `proselint` has no such rule, and
`write-good`'s entire weasel-word check is a 26-word list.

**Two ways to fix a finding, and one that is not allowed.** Add the referent, or delete the claim.
Do not hedge it. "Reasonably robust" is the same sentence with less courage and it still tells the
reader nothing.

### `no-time-estimate` — error

A duration offered as a prediction. Fires only when a duration and an estimate cue appear in the
same sentence, so "the request timed out after 30 seconds" and "cache entries expire after seven
days" stay clean while "this should take about three days" does not.

`GOOD_ENGINEERING_H.md` states this as an absolute: never report estimated time to complete a goal,
feature, or objective. State what is done, what is left, and what blocks it.

## What the prose rules do not mean

**It is not an AI-authorship detector, and must never be described as one.** It reports one
property: an assertion with no referent. A human writes these too, and an AI often does not.

This distinction decides whether the rule is fair. Tools that classify authorship misfire badly on writing by people
whose first language is not English — one study of seven commercial detectors found a mean false
positive rate above 60% on non-native essays. A structural check for "this sentence carries no
referent" makes a narrower claim and levels no accusation at anyone.

For the same reason, **do not extend the word lists with fashionable vocabulary.** Style markers
turn over with each model generation and are wrong within a year; the tokens in `prose-lint.json`
are grammatical scaffolding for a structural test, not a slop dictionary. The provenance block in
that file records the method, the calibration, and this constraint.

## Calibration

Measured over 32,483 words of this repository's prose: **0 findings.** Over an AI-slop probe
document: **3 of 3 claims caught.** Over a deliberately well-written architecture document: **0
findings.**

Recall is untested against a large corpus of real architecture records. Precision is the measured
property. Report it that way.

## What this does not check

Whether the claim is *true* — only whether the sentence offers anything to check it against. A
sentence can carry a number and still be wrong. Say so when reporting.
