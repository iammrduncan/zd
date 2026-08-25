# Adding a prose rule or a word

Everything in this file is a data change. No code, no rebuild, no install.

This covers the **prose** rules. A TypeScript rule is code, not data: write it against the
[Oxlint plugin API](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html) in
`scripts/oxlint/rules/`, with a fixture pair beside it in `scripts/oxlint/fixtures/`. The suite
discovers both: a rule with no fixture pair fails the build, and a fixture pair with no rule fails
it too.

Word and phrase rules live in the `patterns` array of
[`scripts/prose-lint.json`](../scripts/prose-lint.json). Add an object, run the self-test, done.

## The loop

```bash
# 1. edit scripts/prose-lint.json
# 2. prove the entry works
node <skill-dir>/scripts/prose_lint.mjs --self-test
# 3. run it on real prose
node <skill-dir>/scripts/prose_lint.mjs docs/*.md
```

`--self-test` runs every example in the file and exits 1 if any is wrong. It is the whole safety net:
an entry whose own example does not fire is not a rule, and an entry that fires on its own
counter-example is a false-positive generator.

## The smallest possible entry

Three fields. `id`, `match`, and one example that must fire.

```json
{
  "id": "smoking-gun",
  "match": "smoking gun",
  "instead": "state the evidence and what it proves",
  "fires": ["That log line is the smoking gun."],
  "passes": []
}
```

`match` may be a plain phrase or a regular expression. Either way it gets word boundaries, so
`seams?` matches "seam" and "seams" and not "seamless". That default is deliberate: without it every
entry silently becomes a substring search, which is the fastest way to make a wordlist useless.

## The field that does the real work: `unless`

Most words worth flagging have a legitimate technical use, and a bare list fires on correct prose.
`unless` lists words that, appearing in the same sentence, mean the term is being used properly.

```json
{
  "id": "seam",
  "match": "seams?",
  "unless": ["test", "testing", "refactor", "legacy", "inject", "substitute"],
  "instead": "name the boundary: the module, the interface, or the file it runs along",
  "fires": ["The seam between the two services is where it gets messy."],
  "passes": ["A seam lets you change behaviour without editing the code under test."]
}
```

A "seam" in Michael Feathers' sense is a real term of art. A "load-bearing wall" is a real thing.
The entry has to let those through, and `passes` is where you prove it does.

**Write the `passes` example first.** Thinking of the legitimate use is what stops the entry being a
blunt ban, and if you cannot think of one — `smoking gun`, `north star`, `secret sauce` — then an
empty `passes` array is the honest answer and the word can be flagged everywhere.

## Quoted text is never flagged

A document about writing quotes the writing it describes. Anything inside double quotation marks is
skipped, so this file, and any style guide, can name the words it bans without tripping over them.

## Which rule an entry reports as

`rule` picks the bucket, and defaults to `no-empty-metaphor`.

| Rule | Severity | For |
| --- | --- | --- |
| `no-empty-metaphor` | warning | A metaphor standing in for a mechanism: `load-bearing`, `seam`, `smoking gun` |
| `no-ai-tell` | info | A structural tic that carries no information: negative parallelism, empty pivots |

To add a bucket, add an object to `rules` with an `id`, `severity`, `message`, `next`, `never`, and
a `fixtures` pair. Then point entries at it with `"rule": "<id>"`.

## Fields

| Field | Required | Purpose |
| --- | --- | --- |
| `id` | yes | Names the entry. Appears in self-test output |
| `match` | yes | A phrase, or a regular expression if it contains regex syntax |
| `fires` | yes | Sentences that must produce a finding. At least one |
| `passes` | no | Sentences that must not. Empty means the term has no legitimate use |
| `unless` | no | Words that exempt the sentence when present |
| `instead` | no | Fills the `Do:` clause. Say what to write instead |
| `rule` | no | Which bucket to report under. Defaults to `no-empty-metaphor` |
| `boundaries` | no | Set `false` only for a pattern that must end on punctuation. Word boundaries are added by default, which is what keeps `seams?` from matching "seamless" |

## What not to add

**Do not add fashionable vocabulary.** `delve`, `tapestry`, `testament` turn over with each model
generation and are wrong within a year. One is included as a worked example; the rest of the
`no-ai-tell` patterns are *shapes* rather than words, because structure does not decay. If you add a
vocabulary entry, expect to delete it.

**Do not add a word you cannot write a `fires` example for.** If you cannot produce a sentence where
it is wrong, the entry is a preference rather than a rule.

**Do not raise these above `warning`.** Vocabulary and phrasing rules are the weakest signals in this
skill and they must never gate a build. The two evidence rules — `no-unsupported-claim` and
`no-time-estimate` — are the ones worth failing on.

**Do not describe any of this as AI detection.** These are writing defects. A human writes them too,
and tools that classify authorship misfire badly on writing by people whose first language is not
English. The rule says a sentence reaches for an image instead of naming a mechanism. It says
nothing about who wrote it.

## Adding a rule that needs code

Three of the rules — `no-unsupported-claim`, `no-time-estimate`, and the pattern engine itself —
are functions in `prose_lint.mjs`, because they combine several conditions rather than matching one
phrase. Add one the same way the others are built: a `check*` function returning findings, called
from `checkText`, with its vocabulary in the `words` block and its examples in `fixtures`.

The bar for reaching for code: **a single pattern with an `unless` guard cannot express it.** Almost
everything worth adding can be.
