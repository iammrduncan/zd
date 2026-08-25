# complete-goal and complete-objective

Closing out, at two scales.

## complete-goal

Move a finished goal and its summary into `goals/_completed/`.

### Procedure

1. **Check it is actually complete.** Walk the goal's own **Completion definition**. Every clause,
   not most of them. A goal halted at its stop condition is not complete — it stays open, and the
   summary records where it stopped.

2. **Check the summary exists.** `goals/summary-goal-NN.md`, written per [execute.md](execute.md). A
   goal completed without a summary loses everything learned in it.

3. **Move both files together:**

   ```bash
   git mv <objectives>/<name>/goals/execute-goal-NN.md \
          <objectives>/<name>/goals/_completed/
   git mv <objectives>/<name>/goals/summary-goal-NN.md \
          <objectives>/<name>/goals/_completed/
   ```

   Use `git mv` so history follows the file.

4. **Fix the links the move broke.** Relative links from the moved files to plan documents now need
   an extra `../`. Links from open goals to this one now need `_completed/`. Check both directions:

   ```bash
   grep -rn "execute-goal-NN" <objectives>/<name>/
   ```

   A prerequisite link that 404s is how an executor ends up guessing what a prerequisite required.

5. **Regenerate the objective README** — move the goal from open to completed, update the phase.

6. **Report** what is now unblocked, and what the summary says needs the owner.

### Do not

- Do not complete a goal whose tests are failing, whose deliverables are partial, or that stopped at
  its stop condition. Leave it open and say why.
- Do not edit the goal's content while completing it. It is a record of what was asked.
- Do not renumber anything.

## complete-objective

Write the durable archive summary and retire the objective folder.

### Procedure

1. **Check every goal is complete.** `goals/` holds no open goals. If any remain, either they are
   complete and were not moved, or the objective is not finished. Say which.

2. **Read the whole objective**: `objective.md`, every plan document, every goal summary in
   `_completed/`. The archive summary is written from the whole arc, not from the last goal.

3. **Write `<objectives>/_archives/<name>-summary.md`.** One durable document. The exemplar is
   `_archives/studio-summary.md`. It records:

   | Section | Contents |
   | --- | --- |
   | Opening | What the objective was, when archived, what it established |
   | Delivered outcome | What now exists, concretely — packages, boundaries, capabilities |
   | Durable decisions | The rules that outlive the objective, and where they are recorded |
   | What was learned | Findings worth keeping, including what turned out wrong |
   | What was not done | Deliberately excluded, deferred, or dropped, with the reason |
   | Follow-on work | What this created the conditions for, if anything |

   Write it for someone arriving in a year with no memory of the work. Their questions are "what do
   we have", "what may I not change", and "why is it like this".

   Include what the objective got wrong and corrected. An archive that reads as unbroken success
   teaches nothing and is not what happened.

4. **Remove the objective folder.** The summary replaces it, so finished plans and closeout material
   do not linger in the active tree — this is the convention `_archives/studio-summary.md` states.
   Use `git rm -r`, so the history remains reachable.

   If any part of the folder must survive — a reference document other work depends on — move it to
   its permanent home first, and say in the summary where it went.

5. **Update the objectives index:** remove the row from active, add it to archived.

6. **Report**: the summary path, what shipped, the durable constraints created, and anything that
   needs the owner before the folder is deleted.

### Do not

- Do not archive an objective with open goals.
- Do not delete the folder before the summary is written and reviewed — it is the only thing that
  survives.
- Do not write a summary that lists only successes.
