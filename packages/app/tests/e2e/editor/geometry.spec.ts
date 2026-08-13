import { expect, test } from "@playwright/test";

/*
 * The rule every block on the editing surface has to keep: **inside
 * `.cm-content`, vertical space is padding, never margin.**
 *
 * CodeMirror builds its height map from `getBoundingClientRect`, which includes
 * padding and border and *excludes* margin. So vertical space claimed with a
 * margin is space the editor does not know exists — and the document still looks
 * perfectly correct, because the browser lays it out exactly as written. What
 * breaks is everything downstream of it: every caret position after the offending
 * block maps to the wrong row.
 *
 * That is not a hypothesis. The editor's table carried `margin-block`, occupied
 * 294px against a height map holding 246, and produced three separate reports
 * before the cause was found — "clicking a line puts the caret on the line below
 * it", "up arrow from below the table crosses it", and "the paragraph beside the
 * table cannot be selected and reads as covered by something". Nearly two rows of
 * error, from one declaration.
 *
 * `editor-caret.spec.ts` has the regression test for that specific table. This
 * file is the *class*: it sweeps the whole document so the next widget inherits
 * the rule rather than the bug.
 *
 * **Why this is measured and not grepped.** The note that asked for it wanted
 * something like the token guard, which reads the stylesheets. That is the right
 * instrument there — a dangling `var()` cannot be seen at runtime without landing
 * on the exact element that uses it. Here the effect is visible on every element
 * at once, and a static check would need a list of which selectors count as
 * "inside the content": `.md-editor` itself carries `margin-block`, and that one
 * is *correct* — it is the focus gutter, which lives on the column precisely
 * because a container's padding is a floor under its own height. A guard with an
 * exception list is a second, weaker statement of the rule.
 */

/** Walk the whole document so virtualised widgets are actually built. */
async function sweep<T>(page: import("@playwright/test").Page, collect: () => T[]): Promise<T[]> {
  return page.evaluate(async (source) => {
    const read = new Function(`return (${source})`)() as () => unknown[];
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const found: unknown[] = [];

    /*
     * CodeMirror virtualises, and a 9000px viewport does not change that — a
     * construct near the end of this fixture is genuinely not in the DOM until it
     * is scrolled near. A sweep that trusted one tall viewport would report a
     * clean surface having looked at a third of it.
     */
    for (let y = 0; y <= surface.scrollHeight; y += 500) {
      surface.scrollTop = y;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      found.push(...read());
    }
    return found as never[];
  }, collect.toString());
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

test("nothing inside the content claims vertical space with a margin", async ({ page }) => {
  const offenders = await sweep(page, () => {
    const named: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(".cm-content, .cm-content *")) {
      const style = getComputedStyle(element);
      if (style.marginTop === "0px" && style.marginBottom === "0px") continue;
      named.push(
        `${element.tagName.toLowerCase()}.${element.className || "(unclassed)"} ` +
          `(${style.marginTop} / ${style.marginBottom})`,
      );
    }
    return named;
  });

  // The cause, stated where it is cheap to catch, rather than only where it hurts.
  expect([...new Set(offenders)], "vertical margin inside the editor's content").toEqual([]);
});

test("every block widget occupies exactly its own box", async ({ page }) => {
  const widgets = await sweep(page, () => {
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const children = [...content.children] as HTMLElement[];

    return children.flatMap((element, index) => {
      // A widget is a child of the content that is not a line. Identified this way
      // rather than by a list of classes, so a widget added later is covered
      // without anyone remembering to add it here.
      if (element.classList.contains("cm-line")) return [];

      const previous = children[index - 1];
      const next = children[index + 1];
      // Needs a neighbour on each side to have an occupied span at all.
      if (!previous || !next) return [];

      const box = Math.round(element.getBoundingClientRect().height);
      const occupied = Math.round(
        next.getBoundingClientRect().top - previous.getBoundingClientRect().bottom,
      );
      return [
        {
          what: `${element.tagName.toLowerCase()}.${element.className || "(unclassed)"}`,
          box,
          occupied,
        },
      ];
    });
  });

  /*
   * The consequence, which is the half that actually bit. A widget can keep the
   * margin rule above and still take space the height map does not have — through
   * a margin on a *neighbour*, or a collapsing gap — so this measures the distance
   * the editor believes in against the one the screen shows.
   */
  const wrong = widgets.filter((widget) => widget.box !== widget.occupied);
  expect(wrong, "a block widget takes space CodeMirror cannot measure").toEqual([]);
});

test("the sweep actually reached the widgets", async ({ page }) => {
  const seen = await sweep(page, () => {
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    return [...content.children]
      .filter((element) => !element.classList.contains("cm-line"))
      .map((element) => element.tagName.toLowerCase());
  });

  /*
   * The control, and this file needs one more than most: both assertions above
   * are "nothing was wrong", which is trivially true of a sweep that looked at
   * nothing. The fixture's rendered table is the widget furthest from the top, so
   * finding it is proof the scroll worked.
   */
  expect(new Set(seen), "the sweep never built a single widget").toContain("table");
});
