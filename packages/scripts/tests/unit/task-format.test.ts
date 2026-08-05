import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * `docs/_objectives/todo.txt` is the plan and the session log in one file, and it is the one
 * file in this repo where a careless write costs work that cannot be rebuilt from
 * the code. Everything else can be re-derived: the tests describe the behaviour,
 * git describes the history. Only this holds *why* a thing was done, what was
 * tried and abandoned, and which reports it answered.
 *
 * It has been damaged twice by an agent editing it with a script that computed
 * offsets instead of matching text. On 2026-07-31 one task line was written over
 * another's subject, leaving the victim's tags trailing behind the intruder. On
 * 2026-08-01 index arithmetic truncated the file from 102 lines to 37. Both were
 * recovered with `git checkout`, and the second only because an unrelated commit
 * had landed minutes before.
 *
 * So this checks the shape of every line against the grammar in
 * docs/_objectives/way-of-working/task-format.md, and it runs in `npm test` — which every
 * session runs before it commits.
 *
 * **Both incidents were reproduced against a copy and both are caught.** The
 * clobber trips the one-priority rule and names the line: two task lines merged
 * into one carry two priority markers and two `est:` tags, and every one of the
 * 176 lines across both files carries exactly one of each today. A truncation to a
 * fragment trips the control below and the checkpoint check together.
 *
 * What would still slip through is a *partial* truncation — one that left more
 * than twenty well-formed lines and at least one checkpoint. Nothing here can see
 * that, because a test cannot know how long the file ought to be, and the defence
 * is that the file is committed: a session commits its task-list edit rather than
 * carrying it, so `git checkout` is always one command away.
 */

const TASK_LISTS = ["docs/_objectives/todo.txt", "docs/_objectives/todo-archive.txt"];

/** `x <done> (P) <created> <subject>…` — the shape of a finished line. */
const DONE = /^x \d{4}-\d{2}-\d{2} \([ABC]\) \d{4}-\d{2}-\d{2} \S/;

/** `(P) <created> <subject>…` — the shape of an open one. */
const OPEN = /^\([ABC]\) \d{4}-\d{2}-\d{2} \S/;

/**
 * Lines that are deliberately not ordinary work.
 *
 * task-format.md calls `CHECKPOINT` one of "three line shapes that are not
 * ordinary work" and shows it both bare and behind a full task prefix, so it is
 * exempt from the grammar rather than being made to fit it.
 *
 * **Anchored at the start, and that is the whole point.** The first version asked
 * whether the line *contained* the word anywhere, which quietly excused every task
 * line that merely wrote *about* checkpoints — and one existed the same day the
 * guard shipped, in the very task that added it. A guard whose hole widens each
 * time somebody discusses the subject is worth about as much as no guard. It was
 * found by accident, counting lines, rather than by the guard noticing anything.
 *
 * The optional prefixes are the two real shapes: `x <date> ` for a checkpoint that
 * has been passed, and `(P) <date> ` for one carrying a full task prefix the way
 * task-format.md's own example does.
 */
export const isCheckpoint = (line: string): boolean =>
  /^(?:x \d{4}-\d{2}-\d{2} )?(?:\([ABC]\) \d{4}-\d{2}-\d{2} )?CHECKPOINT\b/.test(line);

function taskLines(path: string): { number: number; text: string }[] {
  const contents = readFileSync(resolve(process.cwd(), path), "utf8");
  return contents
    .split("\n")
    .map((text, index) => ({ number: index + 1, text }))
    .filter(({ text }) => text.trim() !== "" && !text.startsWith("#") && !isCheckpoint(text));
}

describe.each(TASK_LISTS)("%s", (path) => {
  const lines = taskLines(path);

  it("has task lines in it at all", () => {
    // The control. Every assertion below is "nothing was malformed", which is
    // trivially true of a file that was read as empty — a wrong path, a rename,
    // or the truncation this file exists because of.
    expect(lines.length).toBeGreaterThan(20);
  });

  it("starts every line with a priority and a creation date", () => {
    const malformed = lines
      .filter(({ text }) => !(text.startsWith("x ") ? DONE.test(text) : OPEN.test(text)))
      .map(({ number, text }) => `${path}:${number} ${text.slice(0, 80)}`);

    expect(malformed, "a line does not begin the way task-format.md says").toEqual([]);
  });

  it("gives every line exactly one priority", () => {
    /*
     * The assertion that catches a clobber. Writing one task over another's
     * subject leaves both priorities on the line, and nothing else in the format
     * produces a second `(A)`, `(B)`, or `(C)`.
     */
    const wrong = lines
      .filter(({ text }) => (text.match(/\([ABC]\)/g) ?? []).length !== 1)
      .map(({ number, text }) => `${path}:${number} ${text.slice(0, 80)}`);

    expect(wrong, "a line carries more than one priority, so two lines are merged").toEqual([]);
  });

  it("gives every line exactly one estimate", () => {
    // The same catch from the other end of the line, since a clobber leaves the
    // victim's trailing tags behind the intruder's.
    const wrong = lines
      .filter(({ text }) => (text.match(/\best:\d+m/g) ?? []).length !== 1)
      .map(({ number, text }) => `${path}:${number} ${text.slice(0, 80)}`);

    expect(wrong, "a line carries more than one est:, so two lines are merged").toEqual([]);
  });

  it("never marks a line done twice", () => {
    // `x ` is "the only marker of doneness", so a second one is a line that was
    // completed by a replace that did not notice it was already complete.
    const wrong = lines
      .filter(({ text }) => text.startsWith("x ") && /^x \d{4}-\d{2}-\d{2} x /.test(text))
      .map(({ number, text }) => `${path}:${number} ${text.slice(0, 80)}`);

    expect(wrong).toEqual([]);
  });
});

describe("the open plan", () => {
  it("still has the checkpoints that make /session stop", () => {
    const contents = readFileSync(resolve(process.cwd(), "docs/_objectives/todo.txt"), "utf8");
    const checkpoints = contents.split("\n").filter(isCheckpoint);

    /*
     * Not a count — the human adds and moves these, and a number here would fail
     * every time they did. What this pins is that they exist at all, because a
     * truncation or a bad rewrite that removed them would leave `/session`
     * implementing straight through the points where a person was meant to stop
     * and use the thing. task-format.md: "they are load-bearing".
     */
    expect(checkpoints.length, "the plan has no checkpoints left in it").toBeGreaterThan(0);
  });
});

describe("the checkpoint exemption", () => {
  /*
   * The exemption is the one hole in the guard, so it is the one thing worth
   * testing directly. Every rule above is skipped for a line this returns true
   * for, which means a predicate that is too generous does not fail loudly — it
   * quietly stops checking.
   */
  const exempt = [
    "CHECKPOINT - stop and test",
    "CHECKPOINT the editor now looks like the reader go and read something in it",
    "CHECKPOINT daily driver stop and live on it before phase 3 +p2 @reset est:0m",
    // task-format.md's own example carries a full task prefix.
    "(A) 2026-07-28 CHECKPOINT daily driver stop and live on it +p2 @reset est:0m",
    // And a checkpoint that has been passed keeps the prefix plus the `x `.
    "x 2026-07-28 (A) 2026-07-28 CHECKPOINT read it for a day and file feedback +p0 @reset est:0m",
  ];

  it.each(exempt)("exempts %s", (line) => {
    expect(isCheckpoint(line)).toBe(true);
  });

  const ordinary = [
    // The line that revealed this. It is a *task about* checkpoints, and the
    // first version of the predicate excused it from the grammar entirely.
    "x 2026-08-01 (B) 2026-08-01 A tool edit must be exact CHECKPOINTS ARE CHECKED FOR EXISTENCE +p4 @reset est:20m",
    "(B) 2026-08-01 Something that mentions a CHECKPOINT halfway through +p4 @editor est:20m",
  ];

  it.each(ordinary)("does not exempt %s", (line) => {
    expect(isCheckpoint(line)).toBe(false);
  });

  it("still checks the grammar of a line that talks about checkpoints", () => {
    /*
     * The consequence, stated where it can fail. Two merged task lines that
     * happen to mention the word must still trip the one-priority rule — under
     * the old predicate this exact input was invisible to every check in the file.
     */
    const merged =
      "(B) 2026-08-01 A task about CHECKPOINT (A) 2026-08-01 and another +p4 @editor est:20m est:30m";

    expect(isCheckpoint(merged), "a merged line was excused from the grammar").toBe(false);
    expect((merged.match(/\([ABC]\)/g) ?? []).length).toBe(2);
  });
});
