# `code` — the Oxlint rules

Read-only. Run the project's own linter; the rules live inside it.

```bash
npx oxlint                       # whatever the project's config covers
npx oxlint src/ --format=json
```

If the plugin is not installed yet, that is [`install`](install.md).

## The five rules

### `no-tautological-assertion`

An assertion whose outcome is fixed before it runs.

Catches `expect(A).toBe(A)` and the other self-comparing matchers, `expect(<constant>).toBeTruthy()`,
`assert.ok(true)`, `assert(true)`, and `assert.equal(A, A)`. Comparison is on normalised source text,
so `expect(user.name).toEqual(user.name)` is caught and `expect(a.b).toBe(c.d)` is not.

This is the purest evidence theatre: it runs, it passes, coverage counts it, and no behaviour was
checked. Agents write these when asked to add a test for code they cannot exercise.

*False positive:* a deliberate identity test — checking that a normaliser leaves already-normal input
alone. Written as `expect(normalise(x)).toBe(x)` it does not fire, because the two sides differ.
Written as `expect(x).toBe(x)` it says nothing anyway.

### `no-disabled-test`

A test committed switched off: `it.skip`, `test.todo`, `describe.only`, `xit`, `fdescribe`.

`.only` gets a harsher message than `.skip`, because it is a worse defect. `.skip` removes one test;
`.only` **silently disables every other test in the run**, so a green suite can mean one assertion
passed. Both survive review because the diff is one character.

*False positive:* a suite deliberately parked behind a skip with an issue reference. The rule has no
way to see the issue. If a project wants that, the answer is a runner-level exclusion, which is
visible in config rather than buried in a file.

### `no-swallowed-error`

Two shapes:

- an **empty catch block** — the failure leaves no trace anywhere;
- a catch that **binds the error and never uses it**, and does not rethrow.

The second is the precise one. Binding the error means the author meant to use it, so a binding that
is never referenced is evidence discarded on purpose with no note left.

`catch { return fallback }` with no binding is deliberately left alone. That is a readable fallback,
not a swallowed error, and flagging it would push people toward the empty-binding form this rule
exists to catch.

### `no-placeholder-body`

A function whose entire body throws a placeholder: `Not implemented`, `TODO`, `stub`, `placeholder`,
`coming soon`.

An agent asked for six things will sometimes build four and stub two. The stubs are syntactically
complete, they type-check, and they read as finished at a glance. This makes the stub visible at the
same moment as the work.

*Deliberately not caught:* an abstract method that throws to tell a subclass what to provide, as long
as the message says that rather than "not implemented". The vocabulary is the whole discriminator.

### `require-suppression-reason`

`@ts-expect-error`, `@ts-ignore`, `eslint-disable*`, `oxlint-disable*`, `biome-ignore`, `c8 ignore`
and friends, with fewer than three words of explanation.

A suppression is a claim that the checker is wrong. Unaccompanied, it is a claim with no evidence —
the same defect [`prose.md`](prose.md) catches in sentences. It is also the cheapest escape hatch an
agent has, which is why it should cost one sentence.

The rule follows the conventional `-- reason` separator after a rule list, so
`// eslint-disable-next-line no-console -- this is the CLI banner` passes and
`// eslint-disable-next-line no-console` does not.

**This rule never forbids suppressing.** Blocking the escape hatch outright makes an agent route
around the checker instead of the problem. Requiring the reason keeps the hatch and makes each use
reviewable.

## Verifying the plugin actually loaded

A plugin that fails to load reports nothing and exits 0 — indistinguishable from a clean run. Lint a
shipped fixture to prove otherwise:

```bash
npx oxlint tools/anti-slop/fixtures/no-tautological-assertion.fires.ts
```

Every rule ships `<rule>.fires.ts` and `<rule>.passes.ts`. The first must produce findings and the
second must produce none.

## What this does not check

Type safety — that is [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop). Complexity,
duplication, and dead exports — `eslint-plugin-sonarjs`, `jscpd`, `knip`. Whether a test asserts the
*right* thing — only mutation testing answers that, and it is not cheap. Say so when reporting.
