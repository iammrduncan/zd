---
name: anti-slop
description: Find and remove AI slop — tests that cannot fail, tests committed switched off, errors caught and discarded, placeholder bodies shipped as finished, suppressions with no stated reason, scripts nothing invokes, and prose that asserts a system is robust or scalable with nothing a reader could check. Use when reviewing an agent's changes, before committing generated code, when a repository feels untidy, or when a document reads as confident and says nothing. Ships a twenty-rule Oxlint plugin and two deterministic checkers that need nothing but Node.
---

# anti-slop

Slop is not bad spelling or a fashionable adjective. It is **anything shaped like evidence that is
not evidence.**

- A test that cannot fail looks like coverage. It is not.
- A test committed with `.only` looks like a green suite. It disabled every other test.
- A caught error that is never used looks like handling. It destroyed the only record of a failure.
- A function that throws `Not implemented` looks finished. Its signature type-checks.
- A suppression with no reason looks considered. It is a claim that the checker is wrong, with
  nothing behind it.
- "The architecture is robust and scalable" looks like a description. It carries no information.

Every rule here rejects one of those. That is the whole idea, and it is why code, prose, and
repository layout are one skill rather than three.

## The rule that governs every command

**Never report a codebase clean when you only ran the checkers.** They decide twenty-eight named
rules.
Whether an abstraction is premature, whether a module is deep, whether a test asserts the *right*
thing — none of that is here, and no run of these tools says anything about it. Report the machine
result and the judgement result separately, and name what you did not check.

**Say which findings are proxies.** The structure checker labels every finding with its oracle:
`derived` means it was read from the project's own configuration and is a fact; `heuristic` prints
`(proxy)` and is arguable. A proxy dressed as a proof is worse than no check.

**Never edit a rule to make a finding go away.** Fix the code, or say why the finding is wrong. A
checker that can be edited to pass enforces nothing.

## Setup

Resolve `<skill-dir>` to the base directory the runtime reports for this skill. When the runtime
reports none, use `.claude/skills/anti-slop/` or `.agents/skills/anti-slop/`. Keep
cwd at the user's project.

The two checkers need Node and nothing else. Each finds its data file automatically, beside the
script:

```bash
node <skill-dir>/scripts/prose_lint.mjs <file>...     # documents, or "-" for stdin
node <skill-dir>/scripts/structure_lint.mjs .         # a repository root
```

The code rules are an **Oxlint plugin**, so they run inside the linter the project already has.
They are copied into the target repository rather than installed as a dependency — see
[reference/install.md](reference/install.md).

Both accept `--json` and `--fail-on {error,warning,info,never}`. Exit 1 means findings at
or above the threshold; exit 2 means the tool could not run.

## Commands

| Command | Purpose | Writes files? | Reference |
| --- | --- | --- | --- |
| `install` | Vendor the Oxlint plugin into a project and wire its config | yes | [reference/install.md](reference/install.md) |
| `code [path]` | Run the Oxlint rules over source | no | [reference/code.md](reference/code.md) |
| `prose [target]` | Report claims with no referent, and time estimates | no | [reference/prose.md](reference/prose.md) |
| `structure [root]` | Report uncollected tests, orphan scripts, and directory shape | no | [reference/structure.md](reference/structure.md) |

Routing:

- **Explicit command** — load its reference and follow it.
- **A bare document** — `prose`. **A bare repository or directory** — `structure`.
- **"Review these changes", "is this slop", "clean this up"** — run every command that applies, and report
  them separately. They measure different things and a clean run of one says nothing about the
  others.
- **No command and no target** — ask which, and on what.

`install` is the only command that writes. The other three are read-only by construction: moving a
test, deleting a script, and rewriting a claim all have consequences a checker cannot see, so
propose the change and let the user decide.

## The rules

Twenty-eight, each independently toggleable, each named for the defect. Twenty run in Oxlint;
eight need only Node.

| Rule | Catches | Where |
| --- | --- | --- |
| `no-tautological-assertion` | An assertion whose outcome is fixed before it runs | Oxlint |
| `no-disabled-test` | `.skip`, `.only`, `xit`, `todo` committed | Oxlint |
| `no-swallowed-error` | An empty catch, or an error bound and never used | Oxlint |
| `no-placeholder-body` | `throw new Error("Not implemented")` under a finished signature | Oxlint |
| `require-suppression-reason` | `@ts-expect-error` or `eslint-disable` with no reason | Oxlint |
| `no-uncollected-test` | A test file the project's own runner will not collect | `structure_lint.mjs` |
| `no-orphan-script` | A script nothing in the repository invokes | `structure_lint.mjs` |
| `no-folder-in-filenames` | A flat directory whose filenames describe a hierarchy | `structure_lint.mjs` |
| `no-redundant-prefix` | A prefix on every file that the directory name already carries | `structure_lint.mjs` |
| `no-unsupported-claim` | A quality asserted of an artifact with no referent | `prose_lint.mjs` |
| `no-time-estimate` | A duration offered as a prediction | `prose_lint.mjs` |
| `no-empty-metaphor` | A metaphor standing in for a mechanism — `load-bearing`, `seam`, `smoking gun` | `prose_lint.mjs` |
| `no-ai-tell` | A structural tic that carries no information | `prose_lint.mjs` |

Plus **fifteen TypeScript rules** in the same plugin, adapted from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop):
`no-chained-type-assertions`, `no-unknown-returns`, `no-unknown-parameters`,
`no-unknown-type-aliases`, `no-unsafe-dictionary-type`, `no-known-value-widening`,
`no-widen-then-assert`, `no-runtime-typeof`, `no-object-parameters`, `no-module-mocking`,
`no-reflect-apply`, `no-reflect-get`, `no-conditional-empty-object-spread`,
`no-shape-in-symbol-names`, `require-safety-comment-for-type-assertion`.

They carry no dependency beyond Oxlint itself, and they ship the same `Do:`/`Never:` messages and
fixture pairs as every other rule here.

Every rule ships a fixture that makes it fire and one that keeps it quiet, and the test suite fails
if either is missing. A rule that has never been shown to fire is not a check.

**The prose metaphor and tic rules are editable data**, as are all fifteen TypeScript rules. Their words and phrases live in the `patterns` array of
`scripts/prose-lint.json`, and adding one needs no code change:

```bash
# edit scripts/prose-lint.json, then prove the entry works
node <skill-dir>/scripts/prose_lint.mjs --self-test
```

Each entry carries an `unless` guard, because these words have legitimate uses: a "seam" in Michael
Feathers' sense is a term of art, and a load-bearing wall is a real thing. See
[reference/adding-rules.md](reference/adding-rules.md).

## Acting on a finding

Every message carries two clauses, and both matter:

- **`Do:`** the correction that addresses the cause.
- **`Never:`** the cheap fix that makes the finding disappear without fixing anything.

Each of these rules has a mechanical suppression that costs seconds and makes the codebase worse —
deleting the error binding, renaming a test so the runner stops seeing it, hedging a claim instead
of evidencing it. **Follow `Do:`, or argue that the finding is wrong. Do not take the third path.**

## Boundaries

- **Type safety.** The fifteen rules adapted from
  [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) cover low-evidence *type* patterns
  for TypeScript — chained assertions, `unknown` returns, known-value widening. Use upstream
  directly when its TypeScript plugin and runtime dependencies fit the target project better.
- **Complexity, duplication, dead exports.** Already shipped by `eslint-plugin-sonarjs`, Ruff, and
  `knip`. Do not rebuild them here.
- **What a document is for.** Page type and reader goal belong to `write-docs`.
- **Controlled language.** ASD-STE100 belongs to `simplified-technical-english`. The prose
  rules here are not a language standard and are **not an authorship detector** — they make no claim
  about who wrote the text.

## Reference

| File | What it is |
| --- | --- |
| [reference/install.md](reference/install.md) | Vendoring the Oxlint plugin and wiring its config |
| [reference/code.md](reference/code.md) | The five Oxlint rules and their false positives |
| [reference/prose.md](reference/prose.md) | The two prose rules, and what they do not mean |
| [reference/structure.md](reference/structure.md) | The four structural rules and their oracles |
| [reference/adding-rules.md](reference/adding-rules.md) | Adding a word, a phrase, or a new prose rule |
| [reference/adopting.md](reference/adopting.md) | Introducing this into a repository that already has findings |
| `scripts/oxlint/` | The plugin: one file per rule, plus a fixture pair for each |
| `scripts/prose_lint.mjs`, `scripts/structure_lint.mjs` | The two checkers. Node standard library only |
| `scripts/oxlint/rules/` | Twenty rules, one file each, with a fixture pair beside every one |
