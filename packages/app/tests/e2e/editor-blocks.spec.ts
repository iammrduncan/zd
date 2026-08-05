import { expect, test } from "@playwright/test";

import { sameColour } from "./colour";

// Vision §6.1, the three block kinds that are not headings. Lists show their
// literal marker and keep their text column; a quote is indentation and one
// hairline; a fence is one continuous code plane.

test.beforeEach(async ({ page }) => {
  // Tall enough that CodeMirror has built DOM for the whole fixture — it renders
  // only its viewport. The fixture grows as constructs are added, and a viewport
  // that merely fitted yesterday silently stops rendering the blocks at the bottom
  // today, which shows up as unrelated specs failing. 4200 clears the current
  // ~3280px with room; see docs/agent-findings.md on making these scroll instead.
  // 9000 is headroom, not a fit. The fixture is ~3700px and grows every time a
  // construct is added; a viewport that merely fitted has silently stopped
  // rendering the bottom of the document four times now, each time failing specs
  // that had nothing to do with the change. A headless viewport costs nothing, so
  // this buys years rather than one more construct. The proper fix — scroll until
  // the wanted line is built — is a filed task.
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-item").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.load('400 14px "iA Writer Mono"');
    await document.fonts.ready;
  });
});

test("a list item shows its literal marker rather than a typeset bullet", async ({ page }) => {
  const text = await page.evaluate(() =>
    [...document.querySelectorAll(".md-line-item")].map((n) => n.textContent),
  );

  // §6.1: "Unordered items show their literal `-`, not a typeset bullet. The
  // source is what is on screen."
  expect(text[0]).toBe("- the source is what is on screen");
  for (const line of text) expect(line).not.toContain("•");
});

test("every visual line of an item's text starts at the same origin", async ({ page }) => {
  const origins = await page.evaluate(() => {
    // Skip the marker by counting characters rather than by looking for the
    // element that renders it — the claim is about where the *text* lands, and
    // it has to be measurable whatever the marker is made of.
    // The item deliberately long enough to wrap — the others fit on one row and
    // have no second origin to disagree with.
    const line = [...document.querySelectorAll(".md-line-item")].find((el) =>
      el.textContent?.includes("long enough to wrap"),
    )!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let skip = "- ".length;
    let node = walker.nextNode() as Text | null;
    while (node && node.length <= skip) {
      skip -= node.length;
      node = walker.nextNode() as Text | null;
    }

    const range = document.createRange();
    range.setStart(node!, skip);
    range.setEndAfter(line.lastChild!);
    // One rect per visual line, which is the only way to see where the wrapper
    // actually put the second one.
    return [...range.getClientRects()].map((rect) => Math.round(rect.left));
  });

  // Finding F12, and its regression name in the first prototype's audit:
  // "reading_ordered_list_soft_wraps_return_to_the_item_text_origin". A
  // continuation that returns to the left margin turns a list into "a blob of
  // left-aligned text that merely happens to begin with numbers".
  //
  // Measured as an outcome rather than as a hanging indent on the line, because
  // hanging the line only lands if `- ` happens to be exactly the width of the
  // column — and it is not. Asserting the mechanism passed while the text sat at
  // three different origins.
  expect(origins.length, "the fixture item stopped wrapping").toBeGreaterThan(1);
  expect(new Set(origins).size, `origins were ${origins.join(", ")}`).toBe(1);
});

test("the marker is given the column's width rather than assumed to have it", async ({ page }) => {
  const measured = await page.evaluate(() => {
    const marker = document.querySelector(".md-line-marker")!.getBoundingClientRect().width;
    const probe = document.createElement("span");
    probe.style.cssText = `display:block; width:var(--list-marker-column); font-size:var(--type-prose-size)`;
    document.body.append(probe);
    const column = probe.getBoundingClientRect().width;
    probe.remove();
    return { marker, column };
  });

  // §5.2's marker column. This is what makes the hang land: whatever `- ` or
  // `10. ` actually measures, the box around it is the column, so the text after
  // it starts on the column and so does every wrapped line.
  expect(measured.marker).toBeCloseTo(measured.column, 1);
});

test("the caret still reaches the text a marker sits in front of", async ({ page }) => {
  const line = page.locator(".md-line-item").first();
  const before = (await line.textContent())!;

  // Click inside the marker itself, then walk the caret past it. Under wrapping
  // Home and End are *visual* line keys, so clicking near the top-left is what
  // pins this to the first one.
  await line.click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("!");

  // An inline-block marker is a box the browser has to map coordinates through.
  // If that mapping is wrong, this types into the wrong place or nowhere.
  const after = await page.locator(".md-line-item").first().textContent();
  expect(after).toBe(`${before.slice(0, 2)}!${before.slice(2)}`);
});

test("list rows carry the suite's row rhythm", async ({ page }) => {
  const measured = await page.evaluate(() => ({
    editing: getComputedStyle(document.querySelector(".md-line-item")!).paddingBlockStart,
    token: getComputedStyle(document.documentElement).getPropertyValue("--gap-list-item").trim(),
  }));

  // §5.3's 6px, spent as padding here for the same reason the headings spend it
  // that way — CodeMirror measures a line from its border box.
  expect(measured.editing).toBe(measured.token);
});

test("a list item's text starts after the suite's marker column", async ({ page }) => {
  const measured = await page.evaluate(() => {
    const editing = parseFloat(
      getComputedStyle(document.querySelector(".md-line-item")!).paddingInlineStart,
    );
    const probe = document.createElement("span");
    probe.style.cssText = `display:block; width:var(--list-marker-column); font-size:var(--type-prose-size)`;
    document.body.append(probe);
    const column = probe.getBoundingClientRect().width;
    probe.remove();
    return { editing, column };
  });

  expect(measured.editing).toBeCloseTo(measured.column, 1);
});

/*
 * Where an item's *text* actually lands, one x per visual row.
 *
 * Deliberately measured from the characters rather than from the line's padding
 * — same reason the F12 test above does it: asserting the mechanism passed
 * happily while the text sat at three different origins.
 */
const TEXT_ORIGINS = (needle: string, lead: string) => {
  const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
    el.textContent?.includes(needle),
  );
  if (!line) return null;

  let skip = new RegExp(lead).exec(line.textContent ?? "")?.[0].length ?? 0;
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node && node.length <= skip) {
    skip -= node.length;
    node = walker.nextNode() as Text | null;
  }
  if (!node) return null;

  const range = document.createRange();
  range.setStart(node, skip);
  range.setEndAfter(line.lastChild!);
  return [...range.getClientRects()].map((rect) => rect.left);
};

// A list marker and everything before it; and, for a continuation, the indent
// the author typed to line it up.
const MARKER_RUN = "^\\s*(?:[-*+]|\\d+\\.)\\s+";
const INDENT_RUN = "^\\s*";

test("each nested level advances exactly 14px", async ({ page }) => {
  const advance = await page.evaluate(
    ([origins, marker]) => {
      const read = new Function("needle", "lead", `return (${origins})(needle, lead)`) as (
        n: string,
        l: string,
      ) => number[] | null;
      const parent = read("an item with a nested list beneath it", marker);
      const nested = read("the nested level advances exactly fourteen", marker);
      return parent && nested ? nested[0]! - parent[0]! : null;
    },
    [TEXT_ORIGINS.toString(), MARKER_RUN] as const,
  );

  // DESIGN.md §5.2: "each nested level advances exactly 14 px", and §7.4:
  // "nested item origins advance 14 px". The reader pins the same number in
  // list-geometry.spec.ts — the editor is the same surface or the claim is
  // decoration.
  expect(advance, "no nested item was found in the editor fixture").not.toBeNull();
  expect(advance!).toBeCloseTo(14, 0);
});

test("a nested item's continuation returns to its own text origin", async ({ page }) => {
  const origins = await page.evaluate(
    ([fn, marker, indent]) => {
      const read = new Function("needle", "lead", `return (${fn})(needle, lead)`) as (
        n: string,
        l: string,
      ) => number[] | null;
      return {
        item: read("the nested level advances exactly fourteen", marker),
        cont: read("enough to wrap comes back to its own text origin", indent),
      };
    },
    [TEXT_ORIGINS.toString(), MARKER_RUN, INDENT_RUN] as const,
  );

  // §7.4: "explicit or soft-wrapped continuation rows return to the owning
  // item's prose origin". At depth 1 that origin is the nested item's, not its
  // parent's and not the left margin — which is F12 one level down.
  expect(origins.item, "the nested item was not found").not.toBeNull();
  expect(origins.cont, "the nested continuation was not found").not.toBeNull();

  const all = [...origins.item!, ...origins.cont!].map((x) => Math.round(x));
  expect(new Set(all).size, `origins were ${all.join(", ")}`).toBe(1);
});

test("a three-digit ordered marker overhangs rather than moving its own text", async ({ page }) => {
  const origins = await page.evaluate(
    ([fn, marker]) => {
      const read = new Function("needle", "lead", `return (${fn})(needle, lead)`) as (
        n: string,
        l: string,
      ) => number[] | null;
      return {
        double: read("a double-digit step", marker),
        triple: read("a three-digit step", marker),
      };
    },
    [TEXT_ORIGINS.toString(), MARKER_RUN] as const,
  );

  // §5.2: the fixed right-aligned column fits two digits, so `100.` has to
  // overhang to the left. A column that grows to fit it would step this item's
  // prose out of line with the one above, which is the blob F12 describes
  // arriving by a different route.
  expect(origins.double, "the ordered list is missing from the fixture").not.toBeNull();
  expect(origins.triple, "the ordered list is missing from the fixture").not.toBeNull();
  expect(origins.triple![0]!).toBeCloseTo(origins.double![0]!, 0);
});

test("a blockquote is indentation and one quiet hairline, nothing else", async ({ page }) => {
  const quote = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".md-line-quote")!;
    const style = getComputedStyle(line);
    return {
      text: line.textContent,
      padding: parseFloat(style.paddingInlineStart),
      borderWidth: parseFloat(style.borderInlineStartWidth),
      borderColour: style.borderInlineStartColor,
      background: style.backgroundColor,
      style: style.fontStyle,
      colour: style.color,
    };
  });

  const prose = await page.evaluate(
    () => getComputedStyle(document.querySelector(".cm-line:not([class*='md-line-'])")!).color,
  );

  // §7.3: indentation and one quiet hairline is the whole resting state. The
  // `>` stays in the text because it is source.
  expect(quote.text?.startsWith(">")).toBe(true);
  expect(quote.padding).toBeGreaterThan(0);
  expect(quote.borderWidth).toBe(1);
  expect(quote.background, "a quote is not a plane").toBe("rgba(0, 0, 0, 0)");
  expect(quote.style, "a quote is not italic").toBe("normal");
  expect(sameColour(quote.colour, prose), "a quote is still prose").toBe(true);
});

test("a quote's marker stays inside the hairline without denting its text", async ({ page }) => {
  const editing = await page.evaluate(
    ([fn, lead]) => {
      const read = new Function("needle", "lead", `return (${fn})(needle, lead)`) as (
        n: string,
        l: string,
      ) => number[] | null;
      const line = document.querySelector<HTMLElement>(".md-line-quote")!;
      const marker = line.querySelector<HTMLElement>(".md-quote-mark");
      const origins = read("A blockquote continues on Enter", lead);
      return {
        lineLeft: line.getBoundingClientRect().left,
        origin: origins?.[0] ?? null,
        markerLeft: marker?.getBoundingClientRect().left ?? null,
        markerRight: marker?.getBoundingClientRect().right ?? null,
      };
    },
    [TEXT_ORIGINS.toString(), "^>\\s*"] as const,
  );

  expect(editing.origin, "the editor quote line was not found").not.toBeNull();
  expect(editing.origin!).toBeGreaterThan(editing.lineLeft);

  // §7.4: the marker hangs to the left of the text edge. Inside its own
  // hairline, not out in the heading gutter — a quote already owns an indent,
  // and its notation belongs to the block it marks.
  expect(editing.markerLeft, "the quote marker is not boxed").not.toBeNull();
  expect(editing.markerRight!).toBeCloseTo(editing.origin!, 0);
  expect(editing.markerLeft!).toBeGreaterThanOrEqual(editing.lineLeft);
});

test("a fenced block is one continuous code plane over every row", async ({ page }) => {
  /*
   * One block, not every code row in the document.
   *
   * This used to take all of `.md-line-code`, which was the same thing while the
   * fixture had a single fence. A second fence was added for the Rust
   * highlighting, and the *real* gap between two separate blocks then looked like
   * a break in one plane. The claim is about a block being continuous, so the
   * measurement has to be a block.
   */
  const rows = await page.evaluate(() => {
    /*
     * Found by content, because the fences are no longer on screen to find it by.
     * This used to slice between the ```sh row and the next ``` row — both of which
     * §5.2 now says are not drawn once the block is formed. A run of adjacent code
     * rows is what a block *is* on screen, so that is what this collects.
     */
    const all = [...document.querySelectorAll<HTMLElement>(".md-line-code")];
    const anchor = all.findIndex((line) => line.textContent?.includes("npm run dev"));
    let start = anchor;
    while (start > 0 && all[start - 1]!.nextElementSibling === all[start]) start -= 1;
    let end = anchor;
    while (end + 1 < all.length && all[end]!.nextElementSibling === all[end + 1]) end += 1;
    return all.slice(start, end + 1).map((line) => {
      const style = getComputedStyle(line);
      const box = line.getBoundingClientRect();
      return {
        text: line.textContent,
        background: style.backgroundColor,
        family: style.fontFamily,
        size: style.fontSize,
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
      };
    });
  });

  // Inverted 2026-07-29 with the decision that fences are not drawn. This used to
  // assert `rows[0].text === "```sh"` on the reading that §6.1 keeps all source on
  // screen; §5.2 now says the opening and closing fences "are not drawn once the
  // block is formed". So the first row of a block is its first line of *code*.
  expect(rows.length, "the block lost its rows").toBeGreaterThanOrEqual(2);
  for (const row of rows) {
    expect(row.text?.trim(), "a fence marker is still a row of the block").not.toMatch(/^`{3}/);
  }
  expect(rows[0]!.text).toContain("# install and run");

  const first = rows[0]!;
  for (const row of rows) {
    expect(row.background, "every row carries the plane").toBe(first.background);
    expect(row.family, "code family").toBe(first.family);
    expect(row.size, "code size").toBe(first.size);
    expect(row.left, "the plane spans one measure").toBeCloseTo(first.left, 0);
    expect(row.width, "the plane spans one measure").toBeCloseTo(first.width, 0);
  }

  // Continuous, not striped: each row starts exactly where the last one ended.
  for (let i = 1; i < rows.length; i += 1) {
    expect(rows[i]!.top, "a gap between code rows breaks the plane").toBeCloseTo(
      rows[i - 1]!.bottom,
      0,
    );
  }
});

test("the code plane consumes the suite's code role", async ({ page }) => {
  const measured = await page.evaluate(() => {
    const line = getComputedStyle(document.querySelector(".md-line-code")!);
    const probe = document.createElement("span");
    probe.style.cssText = `
      background:var(--surface-code);
      font-family:var(--type-code-family);
      font-size:var(--type-code-size)
    `;
    document.body.append(probe);
    const role = getComputedStyle(probe);
    const result = {
      line: { background: line.backgroundColor, family: line.fontFamily, size: line.fontSize },
      role: { background: role.backgroundColor, family: role.fontFamily, size: role.fontSize },
    };
    probe.remove();
    return result;
  });

  expect(measured.line).toEqual(measured.role);
});

test("prose lines are untouched by any of it", async ({ page }) => {
  const plain = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".cm-line:not([class*='md-line-'])")!;
    const style = getComputedStyle(line);
    return {
      padding: parseFloat(style.paddingInlineStart),
      border: parseFloat(style.borderInlineStartWidth),
      background: style.backgroundColor,
      size: style.fontSize,
    };
  });

  // A paragraph must not pick up a list's indent, a quote's rule, or a fence's
  // plane just by sitting near one.
  expect(plain.padding).toBe(0);
  expect(plain.border).toBe(0);
  expect(plain.background).toBe("rgba(0, 0, 0, 0)");
  expect(plain.size).toBe("17px");
});

test("every source marker is quiet ink and dims with its line", async ({ page }) => {
  const settle = () =>
    page.evaluate(async () => {
      // §6.3 eases the outgoing dim over 120ms, so a colour read straight after a
      // click is a frame of that ease rather than either resting state.
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      for (let i = 0; i < 20; i += 1) await frame();
    });

  // Resolved through a probe, not read as a token string: `--text-muted` is a
  // `light-dark()` pair, and comparing against that literal text would fail
  // against every real colour the browser ever computes from it.
  const muted = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-muted)";
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  });

  // One marker per construct, each measured while its own line is the focus
  // target — a marker on a dimmed line is *correctly* not `text.muted`, so
  // reading whichever happened to be first would prove nothing.
  const markers = [
    { name: "heading hash", line: ".md-line-h2", mark: ".md-notation-mark" },
    { name: "list marker", line: ".md-line-item", mark: ".md-line-marker" },
    { name: "quote mark", line: ".md-line-quote", mark: ".md-quote-mark" },
  ];

  for (const { name, line, mark } of markers) {
    await page.locator(line).first().click();
    await settle();

    const measured = await page.evaluate(
      ([lineSelector, markSelector]) => {
        const owner = document.querySelector<HTMLElement>(`${lineSelector}[data-focus="target"]`);
        const marker = owner?.querySelector<HTMLElement>(markSelector);
        return marker && owner
          ? { marker: getComputedStyle(marker).color, line: getComputedStyle(owner).color }
          : null;
      },
      [line, mark] as const,
    );

    // §5.2: "Face and size follow the construct; colour does not. Markers stay
    // `text.muted` at every role, because subordinate is what keeps visible
    // notation from competing with the prose it sits beside."
    expect(measured, `${name}: no target line carried its marker`).not.toBeNull();
    expect(sameColour(measured!.marker, muted), `the ${name} is not text.muted`).toBe(true);
    expect(
      sameColour(measured!.marker, measured!.line),
      `the ${name} reads as loud as the text it marks`,
    ).toBe(false);
  }
});

test("a marker dims with its line rather than staying bright on a dimmed row", async ({ page }) => {
  await page.locator(".md-line-h2").first().click();
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (let i = 0; i < 20; i += 1) await frame();
  });

  const dimmed = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-muted)";
    document.body.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();

    const node = document.querySelector<HTMLElement>(
      '.cm-line[data-focus="context"] .md-notation-mark',
    );
    return node ? { colour: getComputedStyle(node).color, muted } : null;
  });

  // §4.1 dims everything that is not the target, notation included. A marker that
  // kept `text.muted` on a dimmed row would end up the brightest thing on it.
  expect(dimmed, "no dimmed heading carried a hash").not.toBeNull();
  expect(sameColour(dimmed!.colour, dimmed!.muted), "the marker ignored the dim").toBe(false);
});
