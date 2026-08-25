# `install` — putting the Oxlint plugin into a project

This is the only command that writes files. It puts the plugin into the target project and wires its
config. Nothing else in this skill modifies the project.

## Why copied in rather than installed as a dependency

The plugin is copied into the target repository, not installed from a registry. Three reasons, and
the third is the one that matters:

1. The rules are opinionated. A project should be able to edit or delete one without waiting on us.
2. There is no package to publish, version, or keep alive.
3. **The rules are visible in the repository that they govern.** A rule nobody can read is a rule
   nobody will argue with, and an unarguable rule gets routed around rather than fixed.

The cost is real: a copy does not update. Record where it came from, so a later reader can tell.
That is what the header comment in `index.mjs` is for.

## Steps

**1. Check the project has Oxlint.** JS plugins need a recent version — the API reached alpha in
March 2026.

```bash
npx oxlint --version
```

If Oxlint is absent, say so and stop. Do not install a linter into someone's project uninvited, and
do not fall back to judging the code by eye — that is exactly the substitution this skill exists to
avoid.

**2. Copy the plugin.** Somewhere the project already keeps local tooling — `tools/`, `config/`, or
`.oxlint/`. Take the whole `oxlint` directory including `fixtures/`; the fixtures are how the next
person checks a rule still does what it claims.

```bash
cp -R <skill-dir>/scripts/oxlint <project>/tools/anti-slop
```

The rules are plain `.mjs` against the ESLint-compatible API, so the project needs Oxlint and
nothing else:

```bash
npm i -D oxlint
```

**3. Register it.** In `.oxlintrc.json` or `oxlint.config.ts`:

```json
{
  "jsPlugins": ["./tools/anti-slop/index.mjs"],
  "rules": {
    "anti-slop/no-tautological-assertion": "error",
    "anti-slop/no-disabled-test": "error",
    "anti-slop/no-swallowed-error": "error",
    "anti-slop/no-placeholder-body": "error",
    "anti-slop/require-suppression-reason": "warn",

    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/no-runtime-typeof": "warn",
    "anti-slop/no-object-parameters": "warn",
    "anti-slop/no-module-mocking": "warn",
    "anti-slop/no-reflect-apply": "warn",
    "anti-slop/no-reflect-get": "warn",
    "anti-slop/no-conditional-empty-object-spread": "warn",
    "anti-slop/no-shape-in-symbol-names": "warn",
    "anti-slop/require-safety-comment-for-type-assertion": "warn"
  }
}
```

**No rule is on until it is named.** Turn on the ones the project wants and leave the rest out.
The fifteen type rules are only worth turning on in a TypeScript project; on plain JavaScript most
of them have nothing to match.

**4. Run it before you claim it works.**

```bash
npx oxlint
```

A plugin that fails to load reports nothing and exits 0, which reads exactly like a clean run. Check
that the rules actually fired by linting the shipped fixtures:

```bash
npx oxlint tools/anti-slop/fixtures/no-disabled-test.fires.ts
```

If that produces no findings, the plugin did not load. **Do not report the project clean until you
have seen a rule fire.**

## Suggested severities

`require-suppression-reason` starts as `warn`. It is the one rule that fires on existing code in
almost every repository, and starting it as an error means someone turns the whole plugin off in
their first hour.

The other four start as `error`. Each has near-zero legitimate use: an assertion that cannot fail, a
test switched off, a discarded error, and a stub with a finished signature are all defects wherever
they appear.

## Taking upstream as well

The fifteen type rules are a reimplementation, and upstream is the reference. A project that would
rather track the original can install it alongside — the rule names are identical, so turn ours off
by name where they overlap:

```bash
npx skills add dmmulroy/anti-slop --skill install-anti-slop
```

Where the two disagree in a corner case, upstream is the one to report it to.

## Where to run it

Oxlint is fast enough to run on every edit. The useful ordering is by how much context survives:

| Where | Catches | Costs |
| --- | --- | --- |
| A post-edit hook | The file just written, while the agent still holds the intent | Runs often |
| The end of a turn | Everything the turn produced, before the context is lost | One run per turn |
| Pre-commit | The same, and it cannot be forgotten | `--no-verify` skips it |
| CI | Everything, unbypassably | The context that produced it is gone |

A pre-write block is not on this list. Blocking a tool call is guidance rather than a boundary — an
agent reaches the same file through a shell command, and that is documented behaviour rather than
speculation. Put the rules that matter at commit and CI, where the check applies to the artifact
instead of the actor.
