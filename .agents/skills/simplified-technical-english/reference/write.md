# write

Draft new text in Simplified Technical English, or rewrite an existing passage into it.

## Before drafting

1. Read [ste-guide.md](ste-guide.md). All of it. It is under 400 lines and it states every rule you
   are about to apply.
2. Decide the writing mode. Procedural writing has a 20-word sentence limit (rule 5.1); descriptive
   writing has 25 (rule 6.3), and no more than six sentences in a paragraph (rule 6.6). A document
   can hold both, in different paragraphs.
3. List the technical nouns and technical verbs the text needs, before you write. Rules 1.5 and
   1.12 permit any term from the subject field, but each one needs a source: an Antiky ADR, the
   Framework documentation, or a recognized subject-field authority. Define an uncommon term where
   it first occurs. Use one term for one meaning throughout.

## While drafting

Write short declarative sentences in the active voice. One topic in each sentence. Put a condition
before its result when the reader must know the condition first.

The vocabulary is the part you cannot do from memory. Look words up:

```bash
node -e '
  const ste = require("<skill-dir>/scripts/ste100.json");
  for (const entry of ste.words["ensure"]) {
    console.log(entry.approved, entry.pos, entry.senses.map(s => s.alternative));
  }
'
```

`ste100.json` carries an STE and a non-STE example sentence for every entry, which is what you want
while writing: the example shows the approved alternative in use. `ste["forms"]` resolves an
inflected form to its headword. `ste["recurring_errors"]` is the published list of the 39 most
frequent mistakes — read it once and you will avoid most of them.

Lookup is by lowercased headword and returns a list, because one spelling can appear more than once
with different parts of speech. `CHECK (n)` is approved; `check (v)` is not.

The words that catch every writer: *ensure* (use MAKE SURE), *utilize* (use USE), *perform*,
*provide*, *require*, *via*, *e.g.*, *i.e.*, *etc.*, and every contraction.

## Before delivering

Lint your own draft. This is not optional — you wrote it from the same memory that cannot hold the
dictionary:

```bash
node <skill-dir>/scripts/ste_lint.mjs --mode <procedural|descriptive|auto> draft.md
```

Fix every error. Read each warning and info and either fix it or satisfy yourself it is a participle
adjective (rule 3.3) or a technical noun (rule 1.5). Re-run until the errors are gone.

Then do the judgement pass in [audit.md](audit.md) step 3 on your own text. The linter says nothing
about approved meanings, text structure, safety-instruction content, or consistent terminology, and
those are where a fluent draft usually fails.

## Reporting

Tell the user:

- the linter result on the delivered text, with the command you ran;
- every technical noun and technical verb you introduced, with its source;
- any term that needs the human owner's approval;
- which rules you could not check.

Do not describe the result as STE compliant. Say what you checked and what it found.

## When the text has a human owner

Some Antiky documents carry an `_H` suffix and belong to a human owner. Draft the replacement text
and show it. Do not write it into the file without an explicit instruction.
