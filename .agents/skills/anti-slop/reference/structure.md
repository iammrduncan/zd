# `structure` — where files live and whether they are reachable

Read-only. Reports findings and writes nothing.

```bash
node <skill-dir>/scripts/structure_lint.mjs .
node <skill-dir>/scripts/structure_lint.mjs --json --fail-on warning .
```

The checker lists files with `git ls-files --cached --others --exclude-standard`, so it sees files
that exist but are not yet staged. That is deliberate: the file an agent just wrote is the one worth
checking. Outside a git repository it walks the tree and skips the usual build and dependency
directories.

Fixture trees are excluded everywhere — `fixtures/`, `testdata/`, `__snapshots__/`, `golden/`,
`corpus/`. A fixture is data that is *shaped* like code, and flagging it is a false positive rather
than a finding.

## The four rules

### `no-uncollected-test` — error, oracle `derived`

A file named like a test that the project's own runner will not collect.

The oracle is searched in this order, and the first hit wins:

1. `vitest.config.*` or `vite.config.*` — the `include` array
2. `jest.config.*` — `testMatch`
3. any `package.json` — `jest.testMatch` or `jest.roots`
4. any `package.json` — a script whose name starts with `test`, when its command names file globs
   (`tsx --test unit/*.test.ts` declares a test root as surely as a config file does)
5. `pytest.ini`, `setup.cfg`, `tox.ini`, `pyproject.toml` — `testpaths`

In a monorepo every `package.json` is consulted, and its globs are resolved relative to its own
directory.

**When no oracle is found the rule is skipped** and the run prints `not checked
[no-uncollected-test]`. It does not guess. A repository that declares nothing gets no finding,
because there is nothing to be wrong about.

Go files ending `_test.go` are exempt: Go co-locates tests by language rule and no configuration
declares a path for them.

*False positive:* a test deliberately excluded from the default run — a slow suite, an integration
tier behind a flag. The fix is to declare that tier in the runner config, which is worth doing
anyway.

### `no-orphan-script` — error, oracle `derived`

A file under `scripts/`, `tools/`, or `bin/` that nothing in the repository names. The search covers
package manifests, CI workflows, Makefiles and Taskfiles, documentation, and every source file. A
script is considered referenced if its filename, its path, or its bare stem appears anywhere.

This is the check that answers *"is this script actually needed?"* without asking anyone to judge
it. The question becomes *does anything invoke it*, which is a set difference.

*False positive:* a script invoked only by a human, from memory, or by an external system such as a
deploy runner. Both cases are fixed the same way — name it in a document that says when to run it,
which is what a reader needed anyway.

### `no-folder-in-filenames` — warning, oracle `heuristic`

A flat directory whose filenames already describe a hierarchy. Fires when a directory holds at least
20 files, has 3 or more prefix families of 3+ files each, those families cover at least 60% of the
directory, and it has at most 1 subdirectory.

**Coverage is the discriminating statistic, not entropy.** Two flat directories of similar size —
one that wants subfolders and one that is correctly flat — have similar entropy and very different
cluster coverage. The thresholds in `structure-lint.json` were fitted against four real directories,
recorded there under `calibration`. Re-fit before loosening any of them.

*False positive:* a directory whose files genuinely share a prefix for a reason the tool cannot see.
Argue with it — this is a proxy.

### `no-redundant-prefix` — info, oracle `heuristic`

The opposite finding, from the same measurement. One prefix family covering 90% or more of the
directory means the prefix repeats what the directory name already says. The remedy is renaming, not
nesting.

Directories where 80% or more of filenames start with a digit are excluded from both shape rules.
Migrations, ADRs, and dated collections are supposed to look like that.

## Reading the output

```
path:line:col: severity [rule] (proxy) message Do: … Never: …
```

`(proxy)` appears only on `heuristic` findings. The `Do:` and `Never:` clauses come from the rule
data, and the `Never:` clause names the cheap fix that would hide the finding.

The summary line reports counts and the number of files scanned. Any skipped rule is printed after
it, with the reason.

## What this does not check

Say so when reporting. The checker covers placement and reachability. It says nothing about whether
a file is well written, whether a module is deep, whether an abstraction is premature, whether a
test asserts anything, or whether a directory's contents belong together for reasons other than
their names.
