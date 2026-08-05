import { expect, test } from "@playwright/test";

import { sameColour } from "./colour";

// The complaint was one line long: "links are not links...". The decision that
// answers it (2026-07-29, vision §6.1) puts links in the *renders* list: "links
// show their label with no brackets or destination", with raw mode as the way
// back to the source. DESIGN.md §7.3 says the same for reading — "Links show
// their labels, not destinations."
//
// So the claim under test is that the label is what is on screen, the punctuation
// and the URL are not, and the document text is untouched by either.

test.beforeEach(async ({ page }) => {
  // Tall enough that the whole fixture is built; the links sit near the end.
  // 9000 is headroom, not a fit. The fixture is ~3700px and grows every time a
  // construct is added; a viewport that merely fitted has silently stopped
  // rendering the bottom of the document four times now, each time failing specs
  // that had nothing to do with the change. A headless viewport costs nothing, so
  // this buys years rather than one more construct. The proper fix — scroll until
  // the wanted line is built — is a filed task.
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  /*
   * Wait for the decoration, not just for the first heading.
   *
   * Lezer parses incrementally, so a construct near the end of a long document is
   * on screen as plain text for a moment before its decoration lands. Waiting on
   * `.md-line-h1` says nothing about the last paragraph — and once the fixture
   * passed ~4000px that gap started failing these specs intermittently.
   */
  await page.locator(".md-link-label").first().waitFor();
});

/** The line carrying the inline link, and what it puts on screen. */
async function linkLine(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
      el.textContent?.includes("its label"),
    );
    if (!line) return null;

    const label = line.querySelector<HTMLElement>(".md-link-label");
    return {
      // What a reader sees, which is not the same as the document's text.
      rendered: line.innerText,
      labelText: label?.textContent ?? null,
      labelColour: label ? getComputedStyle(label).color : null,
      lineColour: getComputedStyle(line).color,
    };
  });
}

test("the label is on screen and the brackets and destination are not", async ({ page }) => {
  const link = await linkLine(page);
  expect(link, "the link line was not rendered").not.toBeNull();

  expect(link!.labelText, "the label is not marked").toBe("its label");
  // The point of the task.
  expect(link!.rendered, "the brackets are still on screen").not.toContain("[");
  expect(link!.rendered, "the brackets are still on screen").not.toContain("]");
  expect(link!.rendered, "the destination is still on screen").not.toContain("example.com/spec");
  // And the label survived the hiding.
  expect(link!.rendered).toContain("A link shows its label and not its destination");
});

test("the label reads as activatable, not as prose", async ({ page }) => {
  // On its own line as the focus target, and settled. A label on a dimmed line is
  // *correctly* not `text.link` — §4.1 dims everything that is not the target —
  // and a colour read during the 120ms ease is neither resting state.
  await page.locator(".cm-line", { hasText: "its label" }).first().click();
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (let i = 0; i < 20; i += 1) await frame();
  });

  const link = await linkLine(page);
  const linkColour = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-link)";
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  });

  // DESIGN.md §4.3's colour table names `text.link` for "Activatable links". It
  // was defined and consumed nowhere until this task.
  expect(sameColour(link!.labelColour!, linkColour), "the label is not text.link").toBe(true);
  expect(
    sameColour(link!.labelColour!, link!.lineColour),
    "the label is the same ink as the prose around it",
  ).toBe(false);
});

test("a relative link renders the same way as an external one", async ({ page }) => {
  const relative = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
      el.textContent?.includes("relative one"),
    );
    return line
      ? { rendered: line.innerText, label: line.querySelector(".md-link-label")?.textContent }
      : null;
  });

  // §4.3 treats them differently on *activation* — one navigates in-window, one
  // crosses to the browser — but they are the same thing to look at.
  expect(relative, "the relative link line was not rendered").not.toBeNull();
  expect(relative!.label).toBe("relative one");
  expect(relative!.rendered, "the relative destination is on screen").not.toContain("vision.md");
});

test("hiding the punctuation does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());

  // The whole risk of rendering in an editor: what is drawn changes and what
  // would be written must not. §6.3 saves what is on screen, so a decoration that
  // edited the buffer would silently rewrite the user's file on the next cmd+s.
  expect(text, "the source lost its brackets").toContain("[its label](https://example.com/spec)");
  expect(text, "the source lost its relative link").toContain("[relative one](../vision.md)");
});

test("an autolink still shows its address, having no label to show instead", async ({ page }) => {
  const auto = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
      el.textContent?.includes("autolink"),
    );
    return line ? line.innerText : null;
  });

  // `<https://…>` has no label, so hiding its destination would leave nothing at
  // all. The address *is* the label here, and the angle brackets are the notation.
  expect(auto, "the autolink line was not rendered").not.toBeNull();
  expect(auto!).toContain("example.com/autolink");
});
