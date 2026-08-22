# Goal 01: Make verification trustworthy

Status: **superseded on 2026-08-22** by the [expanded-scope execution plan](../../../goals/expanded-scope/goal.md).
This file is retained as a historical planning snapshot and does not direct current implementation.

## Outcome

The automated suite observes the product behavior named by each test. A green run means the root
app boots, editor constructs were actually rendered or edited, asynchronous layout has settled,
and preferences use a valid browser-storage harness.

## Source todos

- **WU-003:** Make `/` load the styled app in end-to-end runs.
- **WU-004:** Make editor specs identify and assert the intended construct.
- **WU-010:** Stop editor specs from querying bare tags that match CodeMirror buffers.
- **WU-011:** Scroll and wait for virtualized constructs before asserting them.
- **WU-012:** Justify or narrow specs that iterate the complete document.
- **WU-013:** Replace frame-counting focus tests with assertion-based settling.
- **WU-014:** Fix the unit-test localStorage harness.

## Acceptance criteria

1. Root-route end-to-end coverage loads `/` and proves the styled `zd md` surface appears. The
   intermittent blank-page report is either reproduced red-first and fixed, or closed with a
   repeatable diagnostic showing the existing assertion covers the report and no failure evidence
   remains.
2. Editor assertions locate the exact semantic construct by stable identity or unique fixture
   text. Range claims exercise their boundaries, line claims read one line, and rendering claims
   include a visible or computed-style assertion.
3. No editor test uses a bare element selector where a CodeMirror buffer or unrelated widget can
   satisfy it. Rendered content is located through its product-owned host or semantic class.
4. One shared helper scrolls the editor surface until an off-viewport line is materialized and
   waits for that target's parse/decorations before the test asserts it.
5. Every complete-document sweep has a written reason that needs full coverage; other sweeps use
   representative positions or a unit-level range test.
6. Focus and motion tests poll the state they assert until it settles. They do not pass or fail
   based on a fixed number of animation frames.
7. The unit-test environment provides working `localStorage` methods, isolation, and cleanup, and
   all preference tests run under the normal test command.
8. The complete repository check passes repeatedly without an unexplained root-route, focus, or
   storage failure.

## Terminal condition

All seven mapped source todos are closed with focused regression or audit evidence, and the full
check passes in three consecutive runs without a retry masking failure.

## Exclusions

- Product behavior changes that are not required to expose or fix a reproduced defect.
- Increasing global timeouts, viewport height, or retries as a substitute for waiting on the
  asserted state.
- Rewriting every test to use one universal helper.

after finishing this goal write a goal-summary.md in this folder explaining how you completed the goal.
