---
description: Run one zd session — triage feedback, do the next task, test it, commit it
argument-hint: "[session id like 1.3, or task text, or empty for the next open task]"
---

# Run one zd session

One session = **one goal, one commit, 30–60 minutes.** Not a sprint. Not "and while I'm here".

Current task list: @docs/planning/objectives/todo.txt
Feedback inbox: @docs/planning/objectives/FEEDBACK.md

The product contract is `docs/VISION.md`, visual behavior is in `docs/DESIGN.md`, and active
cross-objective sequencing is in `docs/planning/goals/`. Read the smallest relevant sections and
follow accepted ADRs for implementation boundaries.

Requested: **$ARGUMENTS** (empty means "the next open task").

---

## 1. Triage the inbox first

**Only the lines below the `---` in `docs/planning/objectives/FEEDBACK.md` are feedback** — everything above it is the
file's own instructions. If there is nothing below the rule, skip straight to step 2.

Otherwise triage before picking up new work. Real usage outranks the plan.

- Each line becomes a todo.txt task in the same format as the existing ones.
- A leading `!` means blocking → priority `(A)`, and the line goes at the **front of the live
  band** (step 2), which is what makes it this session's next task. Everything else is filed into
  the band for its own phase.
- Tag them `+fb fb:<today>` so feedback-driven work is distinguishable from planned work.
- Attach `@ctx`, `ref:F##`, and `vis:N.N` tags where you can tell.
- Then append the **raw, unedited lines** to `docs/planning/objectives/feedback-archive.md` under a `## <today>`
  heading, and reset `docs/planning/objectives/FEEDBACK.md` to just its header and the `---`.

Preserve the user's own words in the archive. Do not "clean up" their phrasing — the raw
complaint is the evidence, your task line is the interpretation.

Then do the same for `docs/planning/objectives/agent-findings.md`, the agent's own queue, tagging those `+found
found:<today>` instead. Human feedback is triaged first and outranks it.

Commit the triage on its own: `Triage feedback into tasks`.

## 2. Pick exactly one task

`CHECKPOINT` lines cut the plan into **bands**. The **live band** is every line above the first
`CHECKPOINT` that is not itself marked `x `. That band is the whole world for this session.
Nothing below that checkpoint is a candidate — not an `(A)`, not a blocking `!`, not something
that looks quicker.

- If `$ARGUMENTS` names a session id (`1.3`), take that session's tasks — they're designed to fit
  one sitting together. If it's free text, match it against task subjects. An explicit request
  outranks the band; say if it reaches past a checkpoint, then do it.
- If empty, take the **first open task in the live band, in file order**. Open means the line does
  **not** start with `x `. File order *is* the plan — phase 2 alone records three deliberate
  re-sequencings and the reasoning for each. The `(A)`/`(B)` and `+pN` tags describe a task, they
  do not re-sort the band it sits in.

`@COMPARE` and `@DECIDE` are exact todo.txt tags, not magic words in prose. An `@COMPARE` task
builds a neutral review artifact and does not choose a winner. Only take an `@DECIDE` task when
the request includes the human's answer (zdloop supplies it from the TUI); otherwise stop and ask
for that answer without implementing the task. Give comparison artifacts one `compare-<name>`
basename across `packages/app/dev/<basename>.html`, `packages/app/src/design/<basename>.ts` and
`.css`, and `packages/app/tests/e2e/<basename>.spec.ts`; zdloop uses that boundary to launch and remove
the temporary artifact after its decision. Reuse existing assets rather than adding comparison-only
files outside that boundary.

**A task you cannot do is a written decision, not a skip.** Append to its line, in the surrounding
style, what blocks it and what would unblock it. Commit that, then take the next line in the band.
The next session then reads the reasoning instead of re-deriving it, and a skip nobody wrote down
is indistinguishable from one nobody noticed.

**Skipping buys you nothing.** If every task in the live band is done or blocked, the session
**ends there**. You do not reach past the checkpoint for easier work — that is the exact move that
lets a checkpoint arrive with open tasks still above it, which is the one thing a checkpoint
exists to prevent. Name the blocked tasks and what each waits on, and hand it back. A fully
blocked band is real information about the plan, and acting on it is the user's call.

**A `CHECKPOINT` line is not work.** You only reach one with the band above it empty, and that
means it is time to go use the app for a while. Say so and stop. Do not implement past it. When
the user comes back and says it's passed, mark the checkpoint line `x <today>` like any other
line — that is what moves the live band to the next one.

State the task and its `est:` before you start. If the estimate is over 60 minutes, split the task
in todo.txt first and take the first half.

## 3. Plan it

Use TaskCreate to lay out the steps, and keep it updated as you go. This is the project
convention and it's also how the user follows along.

Read the task's current goal, vision, design, and ADR references. If it carries a historical
`ref:F##`, follow its linked evidence; do not reconstruct a missing report from memory.

## 4. Do the work

- **Bug fixes are red-first.** Write the failing test, run it, watch it fail, then fix it. A fix
  without a test that failed first is not done.
- When you are working out *what is happening* rather than building, follow the diagnosis and
  evidence rules in `docs/GOOD_ENGINEERING_H.md`: measure the actual boundary, distrust a harness
  that supplies what it claims to test, and keep unproven causes labeled as hypotheses.
- Prefer CSS over JavaScript for anything layout, type, or motion. The accepted boundary is in
  `docs/adr/suite/0001-use-tauri-with-portable-web-frontend_H.md`.
- Workbench features consume semantic design tokens. A local hardcoded color or font family in
  `packages/app/src/**` is a bug, not a shortcut.
- Only `packages/app/src/platform.ts` imports `@tauri-apps/api`.
- 500 lines is a warning, not a wall — when a file trips it, split at the nearest seam **in this
  session**, before committing.

## 5. Verify

Run the smallest sufficient thing. In rough order of cost:

```sh
npm test                          # unit — should stay under ~5s
npm run check                     # typecheck + lint + unit
npm run test:e2e                  # layout/visual claims, end of a session
cd packages/tauri && cargo test   # only if you touched Rust
```

Do not run the full ladder after every edit. Do not touch packaging, signing, coverage
thresholds, or release evidence — that is phase 5, and doing it early is what sank the first
prototype.

**A catastrophic result is the one you re-run before believing.** Two or three failures are
evidence. Two hundred are a claim about the harness, and the harness is the thing you were about
to trust. This is not optimism — it is that a mass failure and a broken change look identical from
the outside, so the cheapest way to tell them apart is to ask twice. Seen 2026-08-01: a run
reporting `11 passed` in 1.3 minutes, between four runs of `363 passed` in 19 seconds, with
nothing in the tree different. Re-running is what revealed it; a session that believed the first
number would have spent itself hunting a regression that was never there.

If it does not reproduce, **say so and leave the cause open**. The temptation is to file the most
plausible story, and a story with a date on it reads as a finding forever after. Write down what
you tried and what you could not make happen.

If something is red at 60 minutes, cut scope and commit what genuinely works. Say what you cut.

## 6. Commit and tick it off

One commit. Short one-line message, imperative, no body, no co-author trailers.

Then mark the task done in todo.txt by prefixing the line with `x ` and today's date
(`date +%F`), leaving the rest of the line untouched:

```
x 2026-07-29 (A) 2026-07-28 Wire markdown-it and transform markdown to DOM +p1 @reader sess:1.2 est:30m vis:4
```

Completed tasks stay in the file — it's the session log. `grep -v '^x '` is the open list.

**Edit that file with an exact-match replace that fails when the anchor does not match.** Never a
script that computes offsets — it will happily write whatever it computed. This has damaged the
plan twice: once writing one task line over another's subject, once truncating the file from 102
lines to 37. Both were recovered with `git checkout` only because the file was already committed.
Everything else in the repo can be re-derived from the code and the history; this file is the only
record of *why*, and of what was tried and abandoned.
`packages/scripts/tests/unit/task-format.test.ts` catches the damage after the fact, but not before
you have overwritten something.

## 7. Hand it back

End with, briefly:

1. What now works that didn't before.
2. **Exactly what to look at** — the command to run and what to check on screen. This is the part
   that closes the loop, because the user's reaction becomes the next triage.
3. What you deliberately did not do.
4. What's next in todo.txt.

## Rules that override your defaults

These repository rules exist because ignoring them previously made work expensive and difficult to
recover:

- **No subagent fanout.** Zero, or one if a search is genuinely wide. Not five.
- **New problems you notice go in `docs/planning/objectives/agent-findings.md`, not into this session.** The only
  exceptions are data loss, a crash, or a security hole. Scope that grows mid-session never
  converges. **Never write to `docs/planning/objectives/FEEDBACK.md`** — that inbox is the human's, and the value of
  `docs/planning/objectives/feedback-archive.md` as evidence depends on it holding only their words.
- **Never run this under a loop with no terminal condition.** `/loop 60s /session until you reach
  the next checkpoint` is the intended way to work — that condition is a line in `docs/planning/objectives/todo.txt`
  and you will hit it. `/goal`, or any loop that runs until "done" or "perfect", is the exact
  failure mode this workflow exists to prevent. Sessions are meant to end, and so are runs of them.
- **Leave the 60-second gap between sessions.** It starts when a session finishes and the next one
  starts after it. Do not close it and do not fill it with work: it exists so the handoff above is
  readable and so there is a moment, with the tree clean and nothing half-done, when the user can
  stop the run.
- If you disagree with the task, say so in a sentence and do it anyway, or stop and ask. Do not
  silently substitute a different task.
