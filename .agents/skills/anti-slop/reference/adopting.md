# Introducing this into a repository that already has findings

A checker that reports four hundred findings on the day it is installed gets deleted in a week. That
is the failure mode that killed most architecture-conformance tooling, and avoiding it is a design
problem rather than a discipline problem.

## The order that works

**1. Run it and read the output. Change nothing.**

```bash
node <skill-dir>/scripts/structure_lint.mjs --fail-on never .
```

`--fail-on never` always exits 0, so a first run cannot break anything.

**2. Separate the three kinds of finding.** Every finding falls into one of these, and they need
different responses:

| Kind | Response |
| --- | --- |
| The rule is right and the fix is cheap | Fix it now |
| The rule is right and the fix is large | Leave it. Record it as known, and stop the count growing |
| The rule is wrong here | Say why, in writing, where the next reader will find it |

Do not skip the third row. A rule nobody has argued with has not been tested.

**3. Wire the cheap rules only.**

Start with `--fail-on error`, which gates on `no-uncollected-test` and `no-orphan-script` — both
derived from the repository's own configuration, so neither is a matter of taste. Leave the two
directory-shape rules as warnings. They are proxies and they should stay advisory until the project
has opinions about them.

**4. Put it where the agent can still act on it.**

The useful ordering is by how much context survives:

| Where | What it catches | What it costs |
| --- | --- | --- |
| A post-edit hook | The file the agent just wrote, while it still holds the intent | Runs often; keep it fast |
| The end of a turn | Everything the turn produced, before the context is lost | One run per turn |
| Pre-commit | The same, and it cannot be forgotten | Bypassable with `--no-verify` |
| CI | Everything, unbypassably | The context that produced it is gone |

A pre-write block is **not** on this list. Blocking a tool call is guidance rather than a boundary —
a determined agent reaches the same file through a shell command, and this is documented behaviour
rather than speculation. Put the rules that matter at commit and CI, where the check applies to the
artifact instead of the actor.

## The count must not grow

Until this skill carries a baseline format, hold the line the cheap way: record the current finding
count in the repository, and treat an increase as the failure.

```bash
node <skill-dir>/scripts/structure_lint.mjs --json . | grep -c '"rule"'
```

Two cautions if you build on this:

**Gate on the set, never the count.** A count is satisfied by removing one finding and adding
another. Compare the identity of each finding — rule plus path — not how many there are.

**A baseline that only ever grows is a graveyard.** Whatever records known findings must be
reviewed, and entries must leave it. If the recorded set has never shrunk, the mechanism is
decoration.

## When to stop using this

Named plainly, because a check that has stopped earning its place is worse than none:

- Every finding for a month has been "the rule is wrong here."
- The only failure anyone has seen is that someone forgot to run it.
- Findings are being fixed by the `Never:` route — renaming tests, hedging claims, splitting
  directories in the wrong place — rather than the `Do:` route.

The last one is the serious one. A rule whose cheapest fix is the wrong fix teaches the wrong
behaviour, and it does that faster to an agent than to a person. Remove the rule rather than living
with it.
