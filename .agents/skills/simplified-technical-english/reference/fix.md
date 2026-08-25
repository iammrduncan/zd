# fix

Audit a document, then apply the corrections.

`fix` changes files. Confirm you are permitted to change this one before you start — see
"Ownership" below.

## Procedure

### 1. Audit first

Run [audit.md](audit.md) in full, including the judgement pass. You cannot correct what you have not
identified, and the linter finds less than half of it.

Do not begin editing while the audit is still running. A partial finding list produces a partial
fix and a false claim of completeness.

### 2. Sort the findings

| Class | Action |
| --- | --- |
| Mechanical, meaning preserved | Fix. A contraction, a semicolon, `e.g.`, a possessive, an unapproved word with one obvious approved alternative |
| Structural, meaning preserved | Fix. Splitting an over-length sentence, changing passive to active with a named agent, splitting a paragraph over six sentences |
| Meaning at risk | Stop and ask. Any fix that changes what the document asserts, narrows a claim, or picks between two readings |
| Not decidable | Report. A technical noun with no source, an approved word used with an unlisted meaning where the intended meaning is unclear |

The third class is the one that matters. Rewriting for STE must not change the decision a record
records. When an over-length sentence can be split two ways that mean different things, the author
decides, not you.

### 3. Apply

Work through the file in one pass. Preserve:

- the document's structure, headings, and link targets;
- code blocks, command lines, file paths, and identifiers — the linter reads them as prose, so
  findings inside them are usually false and must not be "corrected";
- quoted text and proper nouns;
- the meaning of every sentence you touch.

For an unapproved word, use the alternative the dictionary gives. Look it up rather than guessing:

```bash
node -e '
  const ste = require("<skill-dir>/scripts/ste100.json");
  for (const entry of ste.words["utilize"]) {
    for (const sense of entry.senses) console.log(sense.alternative, sense.examples?.[0]);
  }
'
```

Where an approved alternative does not fit the sentence, rewrite the sentence. Do not force a word
into a construction that no longer reads.

### 4. Verify

Re-run the linter on the changed files:

```bash
node <skill-dir>/scripts/ste_lint.mjs <file>...
```

Repeat until no error remains, or until every remaining error is one you decided not to fix for a
stated reason.

Then run `git diff` and read every changed line. Confirm that no correction altered meaning. This
step is the one that catches the damage, and it is the one that gets skipped.

### 5. Report

State:

- the command you ran and the finding counts before and after;
- what you changed, grouped by rule;
- **what you did not change, and why** — each meaning-at-risk finding, with the sentence and the
  question the author must answer;
- which rules remain unchecked.

Show the diff or point at it. A fix pass that reports only a clean linter run has hidden its own
risk.

## Ownership

Do not apply fixes to a human-owned document — an `_H` file in an Antiky repository, an accepted
ADR, or an accepted AIP — without an explicit instruction from its owner. Run `audit` and report.

For an owner-approved change to an accepted record, follow the repository's own procedure for
preserving the prior text before you edit. In Antiky documentation repositories that means running
the revision-history script while `HEAD` still holds the previous wording.

Do not rewrite a document for STE conformance only because it does not conform. Conformance work on
an existing accepted record is a decision its owner makes.
