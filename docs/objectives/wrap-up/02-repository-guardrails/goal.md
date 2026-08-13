# Goal 02: Restore repository guardrails

## Outcome

Commands, semantic definitions, repository records, and push checks each have one trustworthy
owner. The workflow prevents the specific kinds of drift recorded in the remaining reset tasks.

## Source todos

- **WU-005:** Remove the dev fixture's duplicate command list.
- **WU-006:** Teach the scroll-container padding rule in the way of working.
- **WU-007:** Reuse the exported function that already identifies a construct.
- **WU-008:** Restore trusted checks on push when the prototype is ready.
- **WU-009:** Resolve the two-day task-date offset and guard chronology.

## Acceptance criteria

1. Product and development entry points call one exported document-command registration function.
   Shortcut Reference tests exercise the same registry used by the shipped miniapp.
2. The way of working records that large vertical gutters belong on scroll content rather than a
   fixed-height scroll container, and tells tests to compare the container with its real frame.
3. Code that needs an existing semantic classification imports its owning function. An audit of
   the focus/list/inline-code cases named by the source todo finds no second hand-written opinion.
4. A human answers whether the historically offset task dates are corrected or explicitly
   annotated. The task-format guard then rejects any future completion date earlier than its
   creation date.
5. After Goal 01 makes the suite trustworthy, push CI runs the same required type, lint, test, and
   version checks used locally. Retries remain disabled unless a separate decision changes that
   policy.
6. Product, fixture, documentation, and CI checks prove these owners stay synchronized.

## Terminal condition

All five mapped source todos are closed, the command and semantic-owner audits are clean, task
chronology has a recorded answer and guard, and a pushed commit receives the restored green checks.

## Dependencies

- CI restoration depends on Goal 01's terminal evidence; enabling a known-untrustworthy gate does
  not satisfy this goal.
- The task-date correction remains human-owned because its source line is an open `@DECIDE`.

## Exclusions

- A general command framework or dependency-injection layer.
- Rewriting historical task subjects, verdicts, or evidence beyond the approved date disposition.
- New CI jobs unrelated to the existing repository check contract.

after finishing this goal write a goal-summary.md in this folder explaining how you completed the goal.
