---
name: simplified-technical-english
description: Write, audit, and correct documentation against ASD-STE100 Simplified Technical English, Issue 9. Use when drafting or reviewing an ADR, AIP, README, procedure, safety instruction, or any text that must follow the STE writing rules and controlled vocabulary. Includes a deterministic linter and the controlled vocabulary, so an audit checks the text rather than guessing at it.
---

# Simplified Technical English (ASD-STE100 Issue 9)

STE is a controlled natural language for technical documentation. It restricts the vocabulary to
about 875 approved words and the grammar to 53 rules, so a reader who does not speak English as a
first language cannot misread the text.

This skill carries a deterministic linter and the controlled vocabulary. Use them. Do not judge STE
conformance from memory: the dictionary decides which words are approved, and no one holds 2,197
entries in their head.

## The rule that governs every mode

**Never report that text is STE compliant when you ran only the linter.**

The linter decides 14 checks. About half of the 53 rules need a word's part of speech in context,
and a human. Report the machine result and the judgement result separately, and name what you did
not check. `reference/ste-guide.md` lists exactly which rules fall on each side.

## Setup

Resolve `<skill-dir>` to the base directory the runtime reports for this skill. When the runtime
reports none, use `.claude/skills/simplified-technical-english/` or
`.agents/skills/simplified-technical-english/`. Keep cwd at the user's project.

Run the linter directly. It needs Node and nothing else — no install, no network, no model:

```bash
node <skill-dir>/scripts/ste_lint.mjs <file>...
```

The data file sits next to the script and is found automatically.

## Commands

| Command | Purpose | Writes files? | Reference |
| --- | --- | --- | --- |
| `write [target]` | Draft new text in STE, or rewrite a passage into it | yes | [reference/write.md](reference/write.md) |
| `audit [target]` | Report conformance findings. Change nothing | no | [reference/audit.md](reference/audit.md) |
| `fix [target]` | Audit, then apply the corrections | yes | [reference/fix.md](reference/fix.md) |

Routing:

- **Explicit command** — load its reference and follow it.
- **No command, but a target** — run `audit`. It is the only mode that cannot damage the target.
  Offer `fix` afterward.
- **No command and no target** — ask which of the three the user wants, and on what.
- A request to "check", "review", or "lint" means `audit`. A request to "clean up", "correct", or
  "make it STE" means `fix`. A request to draft, rewrite, or produce new text means `write`.

Never run `fix` on a document the user asked you to `audit`. The modes differ in what they are
permitted to change, and that is the point of separating them.

## Document ownership

Some documents are human-owned and carry an `_H` suffix in Antiky repositories. Do not rewrite an
`_H` document for STE conformance without an explicit instruction from its human owner. `audit` it
and report. This holds even when the findings are certain.

The same restraint applies to any accepted decision record: correcting the language must not change
the decision. When a fix would alter meaning, stop and ask.

## Reference material

| File | What it is |
| --- | --- |
| [reference/ste-guide.md](reference/ste-guide.md) | The 53 rules and 8 general recommendations, condensed. Read before writing or judging |
| [reference/ste-checker.md](reference/ste-checker.md) | Linter options, finding severities, and how to read output |
| `scripts/ste_lint.mjs` | The checker. Node standard library only, deterministic |
| `scripts/ste100-lint.json` | The controlled vocabulary, the 61 rules, the numeric limits |
| `scripts/ste100.json` | The same vocabulary plus an STE and non-STE example for each entry |

The skill is not a substitute for the standard. ASD-STE100 is free from
<https://www.asd-ste100.org>. When a decision turns on the exact wording of a rule, read the
standard.
