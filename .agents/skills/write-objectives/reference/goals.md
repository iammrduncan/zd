# create-goals

Cut the plan into bounded, ordered goals under `goals/`.

Aliases: `compile-goals`.

Where a project has an exemplar goal, read it before writing your first. The template is [templates/execute-goal.md](templates/execute-goal.md).

## What a goal is

A contract between the plan and whoever executes it — usually an agent under `/goal`, sometimes a
person. It is finished when someone can start it without asking a question, and can tell without
argument whether it is done.

The test: **hand the goal file to someone with no context. Can they start?** If they would have to
ask what "improve the pipeline" means, which files are theirs, or whether they may change a shared
file, the goal is not written.

## Procedure

### 1. Derive goals from the plan, not from the objective

Every goal traces to a specific plan document, and cites it with a path and line range:

```markdown
This goal delivers Track A from `<objectives>/<name>/06-WORK-PACKETS.md:138-172`.
```

A goal with no plan citation is one you invented. Delete it or go back to `create-plan`.

### 2. Order them, and make the ordering explicit

Number in execution order from `00`. Then, for each, state in **Prerequisites**:

- which goals must be complete first, linked, and **what specifically** it needs from them — not
  "goal 01 first" but "needs the capture harness and green `npm test` from goal 01";
- whether the owner can release it early;
- **concurrency constraints**: which goals touch the same files and therefore must not commit at the
  same time. The owned-file list is the lock. This is the constraint most often missed and the one
  that costs the most when it is.

### 3. Bound each goal

Each goal owns a named set of files. State them. Two goals that own the same file must be
serialized, and the goal must say so.

Right size: one coherent deliverable, provable by its own tests, reviewable as one change. Signs
it is too big — more than one independent "required outcome" that could ship separately, or a
non-goals list that is mostly deferring parts of the same work. Signs it is too small — it cannot be
verified without another goal's output, or its tests are someone else's tests.

### 4. Write it

Use every section of the template. The ones that carry the weight:

**Required outcome** — a numbered list of concrete deliverables, each with the file it lands in and
the line reference where it is known. "The renderer is faster" is not an outcome. "A patch in
`scripts/patch-brometal.mjs` that replaces the nearest sampler at `webgpu.js:761`" is.

**Required tests and evidence** — open with "At minimum, prove:" and list assertions specific enough
to fail. Not "add tests" but "a 2×2 texture rendered into a larger target has an interpolated
midpoint, not equal to any source texel within 1/255". If you cannot write the assertion, you do not
yet know what the goal delivers.

**Explicit non-goals** — every "do not". Scope creep during execution is the main way a bounded goal
stops being bounded, and each `do not` closes one door. Include the tempting adjacent work.

**Engineering constraints** — repository conventions that bind here: commit style, file size limits,
what is gitignored, what must not be extracted into a shared package yet, which AGENTS.md applies.

**Completion definition** — one paragraph: complete only when all of these hold. Then the stop
condition: what should make the executor halt and report instead of pressing on. A goal without a
stop condition invites shipping a wrong thing to satisfy a checklist.

### 5. State what the operator must supply

Before the goal can start, does the human need to decide, approve, or provide anything? Say so at
the top, in Prerequisites. Examples: an art direction call, a credential, approval of a budget
threshold, a decision between two designs.

This is a hard requirement. An operator discovering mid-execution that a goal needed their input is
the exact failure this format prevents.

### 6. Report

Tell the owner:

- how many goals, and the execution order;
- which can run in parallel and which are serialized on shared files;
- **what each needs from them before it can start**;
- which plan documents are not yet covered by any goal, and whether that is deliberate;
- the goal you consider riskiest and why.

## What this command must not do

- Do not execute a goal. That is `execute`.
- Do not write a goal for work the plan does not cover. Extend the plan first.
- Do not renumber existing goals. Numbers are stable references; `_completed/` links point at them.
- Do not write a goal whose acceptance criteria you could not check yourself.
