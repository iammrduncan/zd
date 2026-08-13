import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

/*
 * "everything with caret placement and arrow key navigation and text selection
 * work in raw code mode but not in rendered editing mode" (feedback, 2026-07-30).
 *
 * Raw mode is the control case, and it is the user's own: the same document, the
 * same keys, the only difference being whether notation is hidden. So the claim
 * under test is not "arrow keys work" in the abstract — it is that **a key press
 * moves the caret by what you can see**. Hidden source is still source, and the
 * caret walking through characters that are not on screen looks exactly like a key
 * press that did nothing.
 *
 * CodeMirror has a facet for this, `EditorView.atomicRanges`, and until 2026-07-30
 * nothing in this editor registered anything in it while four kinds of replace
 * decoration hid text.
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-link-label", { hasText: "its label" }),
    "the fixture link",
  );
});

/** The source line carrying `needle`, as a document range. */
async function sourceLine(page: import("@playwright/test").Page, needle: string) {
  return page.evaluate((text) => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((line) => line.includes(text));
    if (index < 0) throw new Error(`no source line contains ${text}`);
    const from = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
    return { number: index + 1, source: lines[index]!, from, to: from + lines[index]!.length };
  }, needle);
}

/** What that line puts on screen, which is not what it contains. */
async function drawnLine(page: import("@playwright/test").Page, needle: string) {
  return page.evaluate((text) => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
      (el.textContent ?? "").includes(text),
    );
    return line?.textContent ?? null;
  }, needle);
}

/** Press ArrowRight `times` and return where the caret ended up. */
async function pressRight(page: import("@playwright/test").Page, times: number) {
  for (let i = 0; i < times; i += 1) await page.keyboard.press("ArrowRight");
  return page.evaluate(() => window.zdEditor!.selection().head);
}

test("crossing a rendered link costs far fewer presses than its source is long", async ({
  page,
}) => {
  const line = await sourceLine(page, "](https://example.com/spec)");
  const drawn = await drawnLine(page, "its label");
  expect(drawn, "the link line was not rendered").not.toBeNull();

  // The label is on screen; the brackets and the destination are not.
  const visible = drawn!.length;
  expect(visible, "nothing is hidden on this line, so it proves nothing").toBeLessThan(
    line.source.length,
  );

  await page.locator(".cm-editor").click();
  await page.evaluate((at) => window.zdEditor!.setCaret(at), line.from);

  let presses = 0;
  while (presses < 300) {
    if ((await page.evaluate(() => window.zdEditor!.selection().head)) >= line.to) break;
    await page.keyboard.press("ArrowRight");
    presses += 1;
  }

  /*
   * Not `=== visible`. Stepping over a hidden run still costs the one press that
   * takes the caret from its start to its end, and there are two such runs on this
   * line — the brackets and the destination — so the honest figure is a handful
   * more than the visible length, not equal to it.
   *
   * What matters is the gap from the other side: the source is 27 characters longer
   * than what is drawn, and before atomic ranges every one of those was a press.
   */
  expect(presses, "the caret is walking through hidden source").toBeLessThan(line.source.length);
  expect(
    presses,
    "more presses than the line has visible characters, plus its hidden runs",
  ).toBeLessThanOrEqual(visible + 4);
});

test("no key press leaves the caret sitting still", async ({ page }) => {
  const line = await sourceLine(page, "](https://example.com/spec)");

  await page.locator(".md-editor").click();
  await page.evaluate((at) => window.zdEditor!.setCaret(at), line.from);

  /*
   * The complaint itself: press the key and nothing happens.
   *
   * Measured as the longest run of consecutive presses that leave the caret at the
   * same place on screen. One is unavoidable — crossing a hidden run moves the
   * caret between two offsets that are drawn at the same x. Twenty-seven is the
   * length of a URL nobody can see.
   *
   * A zero-width rect is not the test. The caret legitimately has one at the edge of
   * a replaced range, and using that as the proxy reported the boundary of a
   * correctly-hidden bracket as a defect.
   */
  const longestStall = await page.evaluate(async (end) => {
    const where = () => {
      const selection = getSelection();
      if (!selection?.rangeCount) return null;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      return `${Math.round(rect.x)},${Math.round(rect.y)}`;
    };

    let worst = 0;
    let run = 0;
    let previous = where();

    for (let i = 0; i < 300; i += 1) {
      if (window.zdEditor!.selection().head >= end) break;
      document
        .querySelector(".cm-content")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await new Promise((done) => requestAnimationFrame(done));

      const now = where();
      run = now !== null && now === previous ? run + 1 : 0;
      worst = Math.max(worst, run);
      previous = now;
    }
    return worst;
  }, line.to);

  expect(longestStall, "the caret stopped moving while the key kept working").toBeLessThanOrEqual(
    1,
  );
});

test("clicking where the caret is drawn puts the caret back there", async ({ page }) => {
  /*
   * "if you click below that table, then up arrow the caret goes above the table,
   * no matter how far below you are" (feedback, 2026-07-30).
   *
   * A round trip, deliberately: place the caret at a known offset, ask the browser
   * where it drew it, click that exact point, and require the same line back. That
   * measures the two mappings against each other — position to coordinates, then
   * coordinates to position — with no text matching and no DOM line indexing, both
   * of which produced a confident wrong answer when this was first investigated.
   *
   * What it caught: a block widget's `margin-block` is space CodeMirror cannot see.
   * It measures the widget with `getBoundingClientRect`, which excludes margins, so
   * the table occupied 294px while the height map had 246 — and every position
   * after it mapped one to two lines below where it was painted.
   */
  await page.locator(".cm-content").click();

  const wrong = await page.evaluate(async () => {
    const lines = window.zdEditor!.text().split("\n");
    const starts: number[] = [];
    let at = 0;
    for (const line of lines) {
      starts.push(at);
      at += line.length + 1;
    }

    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const missed: string[] = [];

    for (let n = 0; n < lines.length; n += 1) {
      const text = lines[n]!;
      if (text.trim() === "") continue;
      const target = starts[n]! + Math.min(3, Math.max(1, text.length - 1));

      window.zdEditor!.setCaret(target);
      await new Promise((done) => requestAnimationFrame(done));

      const selection = getSelection();
      if (!selection?.rangeCount) continue;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      // No rect means the offset is inside hidden source, which is a different
      // subject and already has its own tests above.
      if (rect.height === 0) continue;

      const point = { x: rect.x + 1, y: rect.y + rect.height / 2 };
      for (const type of ["mousedown", "mouseup"]) {
        content.dispatchEvent(
          new MouseEvent(type, { bubbles: true, clientX: point.x, clientY: point.y, detail: 1 }),
        );
      }
      await new Promise((done) => requestAnimationFrame(done));

      const landed = window.zdEditor!.selection().line;
      if (landed !== n + 1) missed.push(`line ${n + 1} -> ${landed}`);
    }
    return missed;
  });

  expect(wrong, "clicking the caret's own position moved it to another line").toEqual([]);
});

test("a block widget's own box is all the space it takes", async ({ page }) => {
  const table = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>(".md-editor table")!;
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const children = [...content.children] as HTMLElement[];
    const index = children.indexOf(element);
    const previous = children[index - 1]!.getBoundingClientRect();
    const next = children[index + 1]!.getBoundingClientRect();
    return {
      box: Math.round(element.getBoundingClientRect().height),
      occupied: Math.round(next.top - previous.bottom),
    };
  });

  /*
   * The invariant behind the round trip above, stated directly so the next block
   * widget inherits the rule rather than the bug.
   *
   * CodeMirror's height map is built from `getBoundingClientRect`, which includes
   * padding and border and excludes margin. So any vertical space a block widget
   * claims with a margin is space the editor does not know exists, and every
   * position after it is mapped wrongly — silently, with the document looking
   * perfectly correct. Spacing on a widget is padding.
   *
   * This one stays because it is the regression test for the reported table. The
   * *class* — no vertical margin anywhere inside the content, and every widget
   * occupying exactly its own box, both swept across the whole document — is in
   * editor-geometry.spec.ts, so the next widget inherits the rule without anyone
   * copying this test for it.
   */
  expect(table.occupied, "the table claims space outside the box CodeMirror measures").toBe(
    table.box,
  );
});

test("raw mode and rendered mode agree on the source, whatever the caret did", async ({ page }) => {
  const before = await page.evaluate(() => window.zdEditor!.text());

  const line = await sourceLine(page, "](https://example.com/spec)");
  await page.locator(".md-editor").click();
  await page.evaluate((at) => window.zdEditor!.setCaret(at), line.from);
  await pressRight(page, 30);

  // Moving a caret is not an edit. Worth pinning because the fix for the tests
  // above is a facet that changes *motion*, and a botched one that changed the
  // document instead would be a data-loss bug rather than a navigation one.
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe(before);
});

/*
 * Typing a construct that hides its own source.
 *
 * The fence case turned out badly: an incomplete fence's row was hidden, a hidden row
 * is an atomic range, and the caret was pushed off the line between two keystrokes —
 * so a fence with a language could not be typed. Fixed in notation/rows.ts, and
 * covered in editor-fence-continuation.spec.ts.
 *
 * These are the same question asked of the other constructs that hide source, because
 * the fault was not really about fences: it was about a construct becoming complete
 * under the caret and taking the caret's own position with it.
 */

/** Type `text` one character at a time on a fresh line after `after`. */
async function typeOnFreshLine(page: import("@playwright/test").Page, after: string, text: string) {
  const at = await page.evaluate((needle) => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((line) => line.includes(needle));
    const start = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(start + lines[index]!.length);
    return index + 2;
  }, after);

  await page.keyboard.press("Enter");
  // One character at a time, deliberately. `insertText` hid the fence bug completely
  // because the construct never existed in a half-typed state.
  await page.keyboard.type(text);
  return {
    line: at,
    text: (await page.evaluate((n) => window.zdEditor!.text().split("\n")[n - 1], at)) ?? "",
  };
}

test("inline code can be typed without the caret leaving the line", async ({ page }) => {
  await page.locator(".cm-content").click();
  const written = await typeOnFreshLine(page, "The paragraph after it starts", "a `span` of code");

  // The backticks stay literal (§6.1) so nothing hides here — which is exactly why
  // this needs pinning rather than assuming: the rule that keeps them visible is a
  // decision, and a later change to it would break typing silently.
  expect(written.text, "the inline code run was split across lines").toBe("a `span` of code");
  expect(await page.evaluate(() => window.zdEditor!.selection().line)).toBe(written.line);
});

test("a link can be typed without the caret leaving the line", async ({ page }) => {
  await page.locator(".cm-content").click();
  const written = await typeOnFreshLine(
    page,
    "The paragraph after it starts",
    "see [here](http://x.dev)",
  );

  /*
   * The destination hides the instant the closing paren completes the link, and the
   * caret is sitting at exactly that boundary when it happens. That is the fence
   * failure's shape, so it is worth an assertion even though it passes.
   */
  expect(written.text, "the link was split across lines").toBe("see [here](http://x.dev)");
  expect(await page.evaluate(() => window.zdEditor!.selection().line)).toBe(written.line);
});

/*
 * "clicking on the last line of a code block does not place caret on that line and
 * instead places it below the code block" (feedback, 2026-07-30).
 *
 * Rechecked on 2026-07-31 and it no longer reproduces — measured at both ends of every
 * fence's last code line, at the far right of all 115 drawn lines, and against four
 * boundary shapes the fixture does not contain. **Which change took it is not known.**
 * The obvious candidate was the fence-row guard fixed the day before, since a hidden
 * row is an atomic range and a closing fence's hidden range begins at the end of the
 * last code line; that was tested by reintroducing the bug, and these specs still
 * passed. So the attribution would have been a guess and is left unmade.
 *
 * That test also settles what these two specs are worth, which is less than it looks:
 * they do **not** detect the fence-row regression, so they are not a regression test
 * for the report. What they are is coverage of a position class nothing else reaches —
 * the far right of a line, where the round trip above cannot look because it clicks
 * where the caret was already drawn a few characters in.
 *
 * Neither was red when written, and neither could have been: no fix was needed. Said
 * plainly because a spec added alongside a closed bug reads like the thing that proved
 * it, and these did not.
 */

test("clicking the far right of a line lands in that line", async ({ page }) => {
  await page.locator(".cm-content").click();
  const samples = [
    "Everything that makes reading good",
    "the source is what is on screen",
    "# install and run",
    "A blockquote continues on Enter",
    "A setext heading underlined",
    "The paragraph after it starts",
  ];

  /*
   * Representative semantic positions rather than every currently mounted row.
   * The old stride depended on a 9000px viewport and silently changed coverage as
   * the fixture grew. These six named lines cross prose, list, fence, quote,
   * heading, and the region after a block widget, which are the distinct mappings
   * the claim needs.
   */
  for (const needle of samples) {
    const line = await materializeEditorTarget(
      page,
      page.locator(".md-editor .cm-line", { hasText: needle }),
      `the caret sample ${JSON.stringify(needle)}`,
    );
    const expected = (await sourceLine(page, needle)).number;
    await line.click({ position: { x: (await line.boundingBox())!.width - 2, y: 4 } });
    await expect.poll(() => page.evaluate(() => window.zdEditor!.selection().line)).toBe(expected);
  }
});

test("a fence's last code line keeps the caret, whatever follows the block", async ({ page }) => {
  await page.locator(".cm-content").click();

  /*
   * Four boundary shapes, appended to the document rather than to the fixture file:
   * a fence at the end, one followed immediately by a heading, one followed
   * immediately by a list, and one that is the last thing in the file. The reported
   * case was a fence whose last line abuts a block boundary, and the fixture has
   * none — both of its fences are followed by a blank line and prose.
   */
  await page.evaluate(() => window.zdEditor!.setCaret(window.zdEditor!.text().length));
  await page.keyboard.insertText(
    [
      "",
      "```sh",
      "at-the-very-end",
      "```",
      "",
      "```sh",
      "before-a-heading",
      "```",
      "## A heading right after",
      "",
      "```sh",
      "before-a-list",
      "```",
      "- an item right after",
      "",
      "```sh",
      "last-in-file",
      "```",
    ].join("\n"),
  );
  await page.waitForTimeout(300);

  const wrong = await page.evaluate(async () => {
    const lines = window.zdEditor!.text().split("\n");
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const missed: string[] = [];

    for (const needle of ["at-the-very-end", "before-a-heading", "before-a-list", "last-in-file"]) {
      const index = lines.findIndex((line) => line.includes(needle));
      const element = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((candidate) =>
        (candidate.textContent ?? "").includes(needle),
      );
      if (!element) {
        missed.push(`${needle} was not drawn at all`);
        continue;
      }

      const box = element.getBoundingClientRect();
      // Both ends. The closing fence's hidden range starts at the end of this line,
      // so the right edge is the position the report was about.
      for (const [where, x] of [
        ["start", box.left + 4],
        ["end", box.right - 2],
      ] as const) {
        for (const type of ["mousedown", "mouseup"]) {
          content.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              clientX: x,
              clientY: box.top + box.height / 2,
              detail: 1,
            }),
          );
        }
        await new Promise((done) => requestAnimationFrame(done));
        const landed = window.zdEditor!.selection().line;
        if (landed !== index + 1)
          missed.push(`${needle} at the ${where}: ${index + 1} -> ${landed}`);
      }
    }
    return missed;
  });

  expect(wrong, "a click on a fence's last code line left the block").toEqual([]);
});

/*
 * "when this is at the bottom of the screen and my cursor/caret goes down past it, it
 * goes off the window and the window does not scroll down" (feedback, 2026-07-30).
 *
 * The filed note guessed the table widget was involved. It is not — measured by walking
 * the caret down one line at a time, it leaves the screen at the 19th press, hundreds of
 * lines before any table.
 *
 * The cause is that the scroll container is taller than the window. `.md-surface` is
 * `height: 100%` inside a 700px chain, but `box-sizing: border-box` cannot produce a box
 * smaller than its own padding, and its padding is the two focus gutters plus the §5.3
 * insets — 318px above and 589px below at that window, so 907px in total. The surface is
 * therefore 907px tall in a 700px window with 207px permanently below the fold, and §7.3
 * forbids the window itself scrolling, so nothing can bring that strip into view.
 *
 * CodeMirror is behaving correctly throughout: it scrolls the caret into view, and "view"
 * means its scrollable ancestor. The caret really is inside the surface. It is just not
 * on screen.
 */

test("the scroll container is never taller than the window", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });

  const measured = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    return {
      box: Math.round(surface.getBoundingClientRect().height),
      window: window.innerHeight,
    };
  });

  /*
   * The root cause, stated where it can be caught rather than only where it hurts. A
   * container that overflows the window puts part of every document out of reach, and
   * every symptom of it looks like something else — a caret that vanishes, a key that
   * does nothing, a widget that seems to be involved.
   */
  expect(measured.box, "the surface is taller than the window it lives in").toBeLessThanOrEqual(
    measured.window,
  );
});

test("the caret stays on screen when it is walked down the document", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.locator(".cm-content").click();
  await page.evaluate(() => window.zdEditor!.setCaret(40));
  await page.waitForTimeout(300);

  const escaped = await page.evaluate(async () => {
    const gone: number[] = [];
    for (let press = 1; press <= 30; press += 1) {
      document
        .querySelector(".cm-content")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await new Promise((done) => requestAnimationFrame(done));

      const selection = getSelection();
      if (!selection?.rangeCount) continue;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.height === 0) continue;
      // Against the window, not against the surface. The surface is the thing that was
      // wrong, so measuring inside it would have agreed with the bug.
      if (rect.y < 0 || rect.bottom > window.innerHeight) gone.push(press);
    }
    return gone;
  });

  expect(escaped, "the caret went off screen and stayed there").toEqual([]);
});
