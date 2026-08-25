# audit

Report how far a document conforms to ASD-STE100 Issue 9. Change nothing.

`audit` is read-only. If the user wants the findings applied, that is [fix.md](fix.md). Do not
drift from one into the other because the corrections look obvious.

## Procedure

### 1. Establish the target and the writing mode

Identify the files. When the user names a directory, audit the Markdown and text files in it.

Decide which limits apply:

| Mode | Sentence limit | Use for |
| --- | --- | --- |
| `procedural` | 20 words (rule 5.1) | Numbered steps, instructions, safety instructions |
| `descriptive` | 25 words (rule 6.3) | Prose, ADR context sections, README body text |
| `auto` | decided per paragraph | Mixed documents. The default |

Leave it on `auto` unless the whole document is one kind. A procedure audited as descriptive hides
real violations.

### 2. Run the linter

```bash
node <skill-dir>/scripts/ste_lint.mjs --json <file>...
```

Use `--json` when you will process the findings; use the default format when you will read them.
Add `--fail-on never` so a non-zero exit does not stop a multi-file audit. Add `--mode procedural`
or `--mode descriptive` when step 1 decided one.

Do not add `--strict` for a normal audit. It lists every word absent from the dictionary, and rules
1.5 and 1.12 permit any technical noun or verb from the subject field. On Antiky documents that is
mostly noise: `entity`, `renderer`, `shader`, and `manifest` are technical nouns, not defects.

Read [ste-checker.md](ste-checker.md) before you interpret the output. Severity states how much the
tool knows:

- **error** — the dictionary or a numeric limit settles it. Report as a defect.
- **warning** — real, but needs a look. Passive voice with no agent may be a participle adjective,
  which rule 3.3 permits.
- **info** — usually a word rejected as a verb that is being used as a noun. Confirm and dismiss.

A warning or an info that you confirm is fine is not a finding. Dismiss it in your own reading
rather than passing it to the user as work.

### 3. Audit the rules the linter cannot check

This is the part that makes the audit worth anything. Read
[ste-guide.md](ste-guide.md), then check the document against the rules the linter does not decide:

| Area | Rules | What to look for |
| --- | --- | --- |
| Approved meaning | 1.3 | An approved word used with a meaning the dictionary does not list |
| Part of speech | 1.2 | An approved spelling used as the wrong part of speech |
| Technical nouns | 1.8–1.11 | A technical noun that is not from a recognized source, or is not used consistently |
| Long technical nouns | 2.2 | A three-word-plus technical noun that has no short form on first use |
| Text structure | 6.1, 6.2, 6.4, 6.5 | Paragraph topic, connected sentences, sequence, one idea for each paragraph |
| Safety instructions | 7.1–7.3 | The warning before the step, the condition before the result, the consequence stated |
| Punctuation use | 8.2, 8.3 | Hyphens and parentheses used as the rules permit |
| Phrasal verbs | 9.3 | A phrasal verb used where a single approved verb exists |
| Consistency | 9.4 | One term for one meaning across the whole document |

For each term you accept as a technical noun or verb, name the authority: an Antiky ADR, the
Framework documentation, or a recognized subject-field source. A term you cannot source is a
finding, not an exemption.

### 4. Report

Give the user four sections, in this order:

1. **Machine findings** — the linter output, grouped by rule, with the counts by severity. State
   the exact command you ran.
2. **Judgement findings** — what step 3 found, each naming its rule and quoting the sentence.
3. **Not checked** — the rules you could not decide and why. GR-1 through GR-5 and GR-7 need the
   document's purpose and audience; say so rather than passing over them silently.
4. **Verdict** — one of:
   - *Conforms as far as this audit can decide*, naming what was not checked.
   - *Does not conform*, with the error count.

Do not write "STE compliant". Compliance is a claim about all 53 rules and the full dictionary
audit. State what you checked and what you found.

## When the linter cannot run

If `node` is absent, say so and stop. Do not substitute your own judgement for the dictionary
and then present the result as an audit — the vocabulary is exactly the part that cannot be
recalled reliably. Report which checks are unavailable and offer the judgement audit alone, clearly
labelled.
