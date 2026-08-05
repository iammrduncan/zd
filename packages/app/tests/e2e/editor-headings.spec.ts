import { expect, test } from "@playwright/test";

import { sameColour } from "./colour";

// Vision §6.1: a heading in the editor keeps its `#` on screen while consuming
// the suite's heading roles. The retired render-only page is no longer an
// intermediary between those tokens and the product surface.

const LEVELS = [1, 2, 3, 4, 5, 6] as const;

interface Type {
  family: string;
  size: string;
  weight: string;
  line: string;
  colour: string;
  spaceBefore: number;
  spaceAfter: number;
}

const LOAD_FACES = async () => {
  await document.fonts.load('400 17px "iA Writer Quattro"');
  await document.fonts.load('700 17px "iA Writer Quattro"');
  await document.fonts.ready;
};

/** Type and vertical rhythm of the first element matching each selector. */
async function typeOf(page: import("@playwright/test").Page, selectors: string[]) {
  await page.evaluate(LOAD_FACES);

  const measured = await page.evaluate((list) => {
    const out: Record<string, Type | null> = {};
    for (const selector of list) {
      const node = document.querySelector(selector);
      if (!node) {
        out[selector] = null;
        continue;
      }
      const style = getComputedStyle(node);
      out[selector] = {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        line: style.lineHeight,
        colour: style.color,
        // The reader spends its rhythm as margin and the editor as padding —
        // CodeMirror measures line boxes, and margins fall outside them. What
        // has to match is the space, not which property pays for it.
        spaceBefore: parseFloat(style.marginTop) + parseFloat(style.paddingTop),
        spaceAfter: parseFloat(style.marginBottom) + parseFloat(style.paddingBottom),
      };
    }
    return out;
  }, selectors);

  return (selector: string): Type => {
    const hit = measured[selector];
    if (!hit) throw new Error(`nothing matched "${selector}"`);
    return hit;
  };
}

test.beforeEach(async ({ page }) => {
  // Tall enough that CodeMirror has built DOM for the whole fixture — it renders
  // only its viewport. The fixture grows as constructs are added, and a viewport
  // that merely fitted yesterday silently stops rendering the blocks at the bottom
  // today, which shows up as unrelated specs failing. 4200 clears the current
  // ~3280px with room; see docs/_objectives/agent-findings.md on making these scroll instead.
  // 9000 is headroom, not a fit. The fixture is ~3700px and grows every time a
  // construct is added; a viewport that merely fitted has silently stopped
  // rendering the bottom of the document four times now, each time failing specs
  // that had nothing to do with the change. A headless viewport costs nothing, so
  // this buys years rather than one more construct. The proper fix — scroll until
  // the wanted line is built — is a filed task.
  await page.setViewportSize({ width: 1100, height: 9000 });
});

test("every heading level consumes its suite type role", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  const editing = await typeOf(
    page,
    LEVELS.map((n) => `.md-line-h${n}`),
  );
  const roles = await page.evaluate((levels) => {
    const out: Record<number, Pick<Type, "family" | "size" | "weight" | "line">> = {};
    for (const level of levels) {
      const probe = document.createElement("span");
      probe.style.cssText = `
        font-family: var(--type-h${level}-family);
        font-size: var(--type-h${level}-size);
        font-weight: var(--type-h${level}-weight);
        line-height: var(--type-h${level}-line);
      `;
      document.body.append(probe);
      const style = getComputedStyle(probe);
      out[level] = {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        line: style.lineHeight,
      };
      probe.remove();
    }
    return out;
  }, LEVELS);

  for (const level of LEVELS) {
    const edit = editing(`.md-line-h${level}`);
    expect(
      { family: edit.family, size: edit.size, weight: edit.weight, line: edit.line },
      `h${level} type role`,
    ).toEqual(roles[level]);
  }
});

test("deep headings use stepped type as well as stepped space", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h6").waitFor();

  const ladder = await page.evaluate(() =>
    [3, 4, 5, 6].map((level) => {
      const heading = document.querySelector<HTMLElement>(`.md-line-h${level}`)!;
      const style = getComputedStyle(heading);
      return {
        size: Math.round(Number.parseFloat(style.fontSize)),
        spaceBefore: Number.parseFloat(style.paddingTop),
      };
    }),
  );

  expect(ladder).toEqual([
    { size: 22, spaceBefore: 36 },
    { size: 20, spaceBefore: 28 },
    { size: 18, spaceBefore: 22 },
    { size: 16, spaceBefore: 18 },
  ]);
});

test("every heading level consumes its suite spacing role", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  const editing = await typeOf(
    page,
    LEVELS.map((n) => `.md-line-h${n}`),
  );
  const spacing = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const px = (name: string) => parseFloat(style.getPropertyValue(name));
    return {
      1: [0, px("--gap-h1-after")],
      2: [px("--gap-h2-before"), px("--gap-h2-after")],
      3: [px("--gap-h3-before"), px("--gap-heading-after")],
      4: [px("--gap-h4-before"), px("--gap-heading-after")],
      5: [px("--gap-h5-before"), px("--gap-heading-after")],
      6: [px("--gap-h6-before"), px("--gap-heading-after")],
    } as Record<number, [number, number]>;
  });

  for (const level of LEVELS) {
    const edit = editing(`.md-line-h${level}`);
    expect(edit.spaceBefore, `h${level} space above`).toBeCloseTo(spacing[level]![0], 1);
    expect(edit.spaceAfter, `h${level} space below`).toBeCloseTo(spacing[level]![1], 1);
  }
});

test("later H1s use section spacing while the opening title stays flush", async ({ page }) => {
  await page.goto("/dev/editor.html");
  const h1s = page.locator(".md-line-h1");
  await expect(h1s).toHaveCount(2);

  const headings = await h1s.evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent,
      spaceBefore: Number.parseFloat(getComputedStyle(node).paddingTop),
    })),
  );
  const sectionGap = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--gap-h2-before"),
    ),
  );

  expect(headings).toEqual([
    { text: "# Typing in the document", spaceBefore: 0 },
    { text: "A setext heading underlined", spaceBefore: sectionGap },
  ]);
});

test("a decorated heading line reads at the primary text colour", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h2").first().waitFor();

  // Both lines read in the same focus state. §4.1 focus now dims every line that
  // is not the target, so comparing a heading against a paragraph without saying
  // which is which compares two different states and proves nothing. Context is
  // the state most of the document is in at any moment.
  // An h2 rather than the h1: with no caret placed, focus sits on the vertical
  // anchor, which at the top of a document is the h1 itself.
  const CONTEXT_HEADING = '.md-line-h2[data-focus="context"]';
  const CONTEXT_PROSE = '.cm-line[data-focus="context"]:not([class*="md-line-"])';
  const measured = await typeOf(page, [CONTEXT_HEADING, CONTEXT_PROSE]);

  // A heading and a paragraph are the same ink, differing only in size and
  // weight — §4.2 carries hierarchy with type and space, never with colour.
  expect(sameColour(measured(CONTEXT_HEADING).colour, measured(CONTEXT_PROSE).colour)).toBe(true);
});

test("the hash stays on screen", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();

  // §6.1: "the source is what is on screen". A heading that hides its own
  // notation is a rendered view wearing an editor's clothes.
  const text = await page.evaluate(() => document.querySelector(".md-line-h1")!.textContent);
  expect(text).toBe("# Typing in the document");

  const hidden = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".md-line-h1")!;
    return { display: getComputedStyle(line).display, width: line.getBoundingClientRect().width };
  });
  expect(hidden.display).not.toBe("none");
  expect(hidden.width).toBeGreaterThan(0);
});

test("the hash hangs in the gutter and the prose edge stays straight", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();

  const geometry = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(".md-line-h1")!;
    const mark = heading.querySelector<HTMLElement>(".md-notation-mark");
    if (!mark) return null;

    // A plain paragraph line — the edge every other line is measured against.
    const prose = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (line) => !line.className.includes("md-line-"),
    )!;

    const gutter = getComputedStyle(document.documentElement).getPropertyValue("--notation-gutter");
    const probe = document.createElement("div");
    probe.style.width = gutter;
    probe.style.position = "absolute";
    document.body.append(probe);
    const gutterPx = probe.getBoundingClientRect().width;
    probe.remove();

    return {
      gutterPx,
      markLeft: mark.getBoundingClientRect().left,
      markRight: mark.getBoundingClientRect().right,
      headingLeft: heading.getBoundingClientRect().left,
      proseLeft: prose.getBoundingClientRect().left,
      markFamily: getComputedStyle(mark).fontFamily,
      markSize: getComputedStyle(mark).fontSize,
      proseSize: getComputedStyle(prose).fontSize,
      headingSize: getComputedStyle(heading).fontSize,
      headingFamily: getComputedStyle(heading).fontFamily,
    };
  });

  // DESIGN.md §7.4: "Block notation sits in the gutter, outside the prose
  // column. A heading's `#` ... hangs to the left of the text edge so the
  // reading column is one straight line at every width."
  expect(geometry, "the heading's hash is not marked as notation").not.toBeNull();
  const g = geometry!;

  expect(g.gutterPx, "--notation-gutter must be a real width").toBeGreaterThan(0);
  // The hash ends where the prose begins and starts a full gutter to its left.
  expect(g.markRight, "the hash runs up to the text edge").toBeCloseTo(g.headingLeft, 0);
  expect(g.markLeft, "the hash hangs a full gutter out").toBeCloseTo(g.headingLeft - g.gutterPx, 0);
  // The measure is not dented: a heading's text starts where a paragraph's does.
  expect(g.proseLeft, "heading and paragraph share one text edge").toBeCloseTo(g.headingLeft, 0);

  // §5.2, rewritten 2026-07-29: "A Markdown source marker takes the type role of
  // the construct it marks." The old rule put every marker in `type.inline-code`
  // whatever it stood in front of, which is why a `#` read as debris beside its
  // own heading rather than as its notation.
  expect(parseFloat(g.markSize), "the hash is not set at its heading's size").toBeCloseTo(
    parseFloat(g.headingSize),
    1,
  );
  expect(g.markFamily, "the hash is not set in its heading's family").toBe(g.headingFamily);
});

test("a hash inside a fenced code block is not a heading", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();

  const shellComment = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (l) => l.textContent === "# install and run",
    );
    return line ? { classes: line.className, size: getComputedStyle(line).fontSize } : null;
  });

  // The whole reason this uses the parser instead of /^#{1,6} /. A shell comment
  // in a fence starts with a hash and is not a heading, and getting that wrong
  // is a 30px line in the middle of a code block.
  expect(shellComment, "the fenced comment line was not rendered").not.toBeNull();
  expect(shellComment!.classes).not.toContain("md-line-h");
});

test("a heading scrolled into view arrives decorated", async ({ page }) => {
  // At a real window height the lower headings are not rendered yet. The plugin
  // rebuilds on viewportChanged for exactly this reason, and without that branch
  // everything below the first screenful is plain prose forever.
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();

  expect(await page.evaluate(() => document.querySelectorAll(".md-line-h6").length)).toBe(0);

  // Scroll until it exists, rather than to the bottom and hoping. `h6` used to be
  // the last thing in the fixture; tables and links now sit below it, so "scroll to
  // the end" stopped finding it — the assumption, not the behaviour, was wrong.
  for (let step = 1; step <= 12; step += 1) {
    if ((await page.locator(".md-line-h6").count()) > 0) break;
    await page.evaluate((n) => {
      document.querySelector<HTMLElement>(".md-surface")!.scrollTop = n * 400;
    }, step);
    await page.waitForTimeout(80);
  }
  await page.locator(".md-line-h6").waitFor();

  expect(await page.evaluate(() => document.querySelectorAll(".md-line-h6").length)).toBe(1);
});

test("headings survive being typed", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+Home");

  const before = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>(".md-line-h1")].filter((el) =>
        el.textContent?.startsWith("#"),
      ).length,
  );

  // Turn the H1 into an H2 by typing one character, then check the decoration
  // followed. A plugin that only decorates on construction passes every test
  // above and fails this one.
  await page.keyboard.type("#");

  /*
   * The *title* line specifically, not a global count. The fixture gained a setext
   * h1 as well, so "no h1 remains" stopped being the claim — what matters is that
   * the line that was an h1 became an h2 when a `#` was typed into it.
   */
  const after = await page.evaluate(() => {
    const title = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
      el.textContent?.includes("Typing in the document"),
    )!;
    return { classes: [...title.classList].filter((c) => c.startsWith("md-line-h")) };
  });

  expect(before, "the fixture stopped opening with one ATX h1").toBe(1);
  expect(after.classes, "typing a hash did not re-level the heading").toEqual(["md-line-h2"]);
});

test("hashes stay aligned to their headings all the way down, and after scrolling", async ({
  page,
}) => {
  /*
   * The complaint: "as you scroll down down the doc the hash tags get further and
   * further unaligned until they are above the header it is supposed to be with."
   *
   * The cause was a marker box narrower than its content without `nowrap`, so the
   * hashes wrapped *inside* the box: `#` at h1 measured 76px against a 38px line,
   * and the more hashes a heading had the taller its marker grew — which is why
   * the error compounded down the document and ended with a hash sitting above
   * its own heading. There was no test on it, so this is that test.
   *
   * A real window height, so CodeMirror virtualizes and rebuilds decorations while
   * scrolling — the report was about scrolling, and a 2400px viewport renders
   * everything at once and never exercises it.
   */
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const sample = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".md-notation-mark")].map((mark) => {
        const line = mark.closest<HTMLElement>(".cm-line")!;
        const lineBox = line.getBoundingClientRect();
        const markBox = mark.getBoundingClientRect();
        return {
          heading: (line.textContent ?? "").slice(0, 24),
          // The gap between where the marker ends and where the text begins.
          drift: lineBox.left - markBox.right,
          markHeight: markBox.height,
          lineHeight: parseFloat(getComputedStyle(line).lineHeight),
          // Negative means the marker escaped upward, out of its own line.
          fromLineTop: markBox.top - lineBox.top,
        };
      }),
    );

  for (const scrollTop of [0, 600, 1200, 1800, 2400]) {
    await page.evaluate((y) => {
      document.querySelector(".md-surface")!.scrollTop = y;
    }, scrollTop);
    await page.waitForTimeout(150);

    const rows = await sample();
    expect(rows.length, `nothing decorated at scrollTop ${scrollTop}`).toBeGreaterThan(0);

    for (const row of rows) {
      const where = `"${row.heading}" at scrollTop ${scrollTop}`;
      // §7.4: the reading column is one straight line at every width, so every
      // marker ends exactly where the prose begins — no accumulating offset.
      expect(row.drift, `${where} drifted off the text edge`).toBeCloseTo(0, 0);
      // One row tall. A marker taller than its line's leading is one that wrapped
      // inside its box, which is the whole mechanism of the original bug.
      expect(row.markHeight, `${where} is more than one row tall`).toBeLessThanOrEqual(
        row.lineHeight + 1,
      );
      // And it stays inside its own line rather than climbing above the heading.
      expect(row.fromLineTop, `${where} sits above its own heading`).toBeGreaterThanOrEqual(0);
    }
  }
});
