# The STE checker

A deterministic Simplified Technical English checker. Node standard library only — no install,
no network, no model.

| File | What it is |
| --- | --- |
| `scripts/ste_lint.mjs` | the checker |
| `scripts/ste100-lint.json` | the controlled vocabulary: 2,197 entries, the 61 rules, the numeric limits |
| `scripts/ste100.json` | the same vocabulary plus an STE and a non-STE example for every entry |
| `reference/ste-guide.md` | the rules condensed to under 400 lines, for a writer or a model to read |

`ste_lint.mjs` loads `ste100-lint.json` from beside itself, so it runs with no configuration.
`ste100.json` adds the example sentences, which is what you want when writing STE or showing a
writer what a rule looks like in practice.

The example sentences are **not** the standard's. Every one was written fresh for this package and
verified against `ste_lint.mjs`, so the examples conform to the rules they illustrate.

## Use

```bash
node <skill-dir>/scripts/ste_lint.mjs manual.txt
node <skill-dir>/scripts/ste_lint.mjs --mode procedural steps.txt
node <skill-dir>/scripts/ste_lint.mjs --json docs/*.md
cat draft.txt | node <skill-dir>/scripts/ste_lint.mjs -
```

Findings come out in the usual `file:line:column:` form, each naming the rule it came from:

```
manual.txt:1:1: error [1.1] "Ensure" (v) is not approved in STE and is one of
                the most frequent errors. Use MAKE SURE (v).
manual.txt:3:59: error [8.1] the semicolon (;) is not permitted. Write two
                sentences.
```

Exit status: 0 when nothing at or above `--fail-on` (default `error`) is found, 1 when something is,
2 on a usage or data error. `--json` gives the same findings as structured output for a CI step or
an agent to consume.

| Option | Effect |
| --- | --- |
| `--mode auto\|procedural\|descriptive` | which sentence and paragraph limits apply. Default `auto`, decided per paragraph |
| `--json` | structured output: `version`, `issue`, `counts`, and `findings[]` with path, line, column, severity, rule, message, and the source text |
| `--strict` | also list words absent from the dictionary. Noisy on technical text — see below |
| `--fail-on error\|warning\|info\|never` | lowest severity that makes the exit status 1 |
| `--data PATH` | use a different vocabulary file |

## What it checks

| Rule | Check | Severity |
| --- | --- | --- |
| 1.1 | A word the dictionary lists as not approved, with its alternatives | error |
| 1.5 | A word the dictionary offers elsewhere as a technical noun or verb | warning |
| 1.5 | A word rejected only as a verb, but used here as a noun | info |
| 2.1 | A possible multi-word noun of more than three words | warning |
| 3.2 | The "-ing" form used as a verb | error |
| 3.6 | Passive voice with a named agent | error |
| 3.6 | Passive voice with no agent — may be a participle adjective (rule 3.3) | warning |
| 4.2 | Contractions | error |
| 5.1 / 6.3 | Sentence over 20 words (procedural) or 25 (descriptive) | error |
| 5.3 | An instruction that does not start with an approved verb | warning |
| 6.6 | A paragraph of more than six sentences | error |
| 8.1 | Semicolon | error |
| GR-6 | Latin abbreviations (`e.g.`, `i.e.`, `etc.`) | error |
| GR-8 | The possessive form | warning |

Word counting follows rules 8.4 through 8.7 exactly: parenthesized text counts as one word, so does
quoted text, so does a number with its unit, and so does a hyphenated word. A colon ends a sentence.

## Reading findings

Severity says how much the tool actually knows:

- **error** — the dictionary or a numeric limit settles it.
- **warning** — real but needs a look. Passive voice with no named agent may be a past participle
  used as an adjective, which rule 3.3 permits.
- **info** — probably fine, shown so you can confirm. Usually a word rejected as a verb that is
  being used as a noun.

Two things are deliberate, and matter when acting on output:

- **A word missing from the dictionary is not an error.** Rules 1.5 and 1.12 let a writer use any
  technical noun or technical verb from their subject field, and those are absent from the
  dictionary by definition. Only words the dictionary explicitly lists as not approved are reported.
  This is why `--strict` is wrong for most Antiky documents: `entity`, `shader`, and `manifest` are
  technical nouns.
- **Around half the rules are not checkable here.** Approved meanings, technical noun selection,
  text structure, safety-instruction content, and consistent style need a word's part of speech in
  context, and a human. [ste-guide.md](ste-guide.md) lists exactly which rules are checked and which
  are not.

The checker is deterministic: the same input plus the same data gives the same findings in the same
order, always.

## Using the vocabulary directly

```js
import ste from "<skill-dir>/scripts/ste100-lint.json" with { type: "json" };

ste.words["ensure"];        // [{ approved: false, pos: "v", senses: [...] }]
ste.forms["connects"];      // "CONNECT" — inflected forms resolve to headwords
ste.limits.max_words_per_procedural_sentence;   // { value: 20, rule: "5.1" }
ste.rules;                  // 61 entries: 53 rules + 8 general recommendations
ste.recurring_errors;       // the 39 most frequent mistakes, with replacements
ste.approved_verbs;         // the 208 approved verbs
```

The linter also exports its own API, so a script can reuse the checker rather than parse its output:

```js
import { checkText, Dictionary } from "<skill-dir>/scripts/ste_lint.mjs";

const dictionary = Dictionary.load();
const findings = checkText(text, "draft.md", dictionary, "procedural");
```

Lookup is by lowercased headword. The value is a list because one spelling can appear more than once
with different parts of speech — `CHECK (n)` is approved while `check (v)` is not.

## About the standard

ASD-STE100 Simplified Technical English is a controlled natural language for technical
documentation, published by the Aerospace, Security and Defence Industries Association of Europe
(ASD) and maintained by the Simplified Technical English Maintenance Group (STEMG). This package
targets **Issue 9 (2025-01-15)**.

ASD-STE100 is the property of ASD and its name is an EU registered trade mark (No. 017966390). The
standard itself is free from <https://www.asd-ste100.org> and this package is no substitute for it:
`ste-guide.md` is a summary, and the JSON holds the controlled vocabulary and rule statements
without the standard's explanatory text or its example sentences.
