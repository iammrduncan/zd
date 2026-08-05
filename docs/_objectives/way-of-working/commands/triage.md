---
description: Turn raw {INBOX} notes into todo.txt tasks, without doing any of the work
argument-hint: "[optional extra notes to triage alongside the inbox]"
---

# Triage the feedback inbox

Capture only. **Write no product code in this command** — if something looks like a two-minute
fix, it still becomes a task. The point is to empty your head onto the list and stop.

Inbox: @{INBOX}
Task list: @{TODO}

Also triage this, if present: $ARGUMENTS

## What to do

**Only the lines below the `---` in `{INBOX}` are feedback.** Everything above it is the file's
own instructions. If there is nothing below the rule, say so and stop — do not invent work, and do
not treat the header as a finding.

For each line below the rule:

1. Decide if it is a **defect** (something is wrong), a **request** (something is missing), or a
   **note** (an observation, praise, or an idea with no action). Notes get archived, not listed.
2. Write it as a todo.txt task matching the surrounding format:

   ```
   (A) 2026-07-29 Quick Open flashes a blank frame between queries +p2 @workspace +fb fb:2026-07-29 ref:F13 vis:5.2
   ```

   - `!` in the raw note → `(A)`. Otherwise `(B)`, or `(C)` if it is polish.
   - `+fb` and `fb:<today>` on everything from the inbox, so real-usage findings stay visible as a
     class.
   - Add `+p<N>` for the phase, `@ctx` for the area, `vis:N.N` for the spec section, and
     `ref:<id>` if it matches a known prior finding in `{PRIOR_FINDINGS}`.
3. If it duplicates an open task, do not add a second one — say which task already covers it.
4. If it contradicts `{VISION}`, say so rather than silently rewriting the vision. That is a
   decision for the user.

Then:

- Append the **raw, unedited lines** to `{ARCHIVE}` under a `## <today>` heading (`date +%F`).
  Their words, not your summary — the raw complaint is the evidence.
- Reset `{INBOX}` to its header and the `---`.
- Then triage `{FINDINGS}` the same way, tagging those `+found found:<today>`. It is the agent's
  own queue; human feedback is triaged first and outranks it. Never write findings into
  `{INBOX}` — keeping the archive purely human is what makes it evidence.
- Commit: `Triage feedback into tasks`.

## Report back

A short list: what became a task and at what priority, what was already covered, what you read as
a note rather than an action. Then the count of open `(A)` tasks, so the user can see if the
blocking pile is growing.
