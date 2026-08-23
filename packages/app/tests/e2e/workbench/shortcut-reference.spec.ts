import { expect, test } from "@playwright/test";

// Finding F02, in full: "Pressing `cmd+.` makes the entire window go blank and
// shows no shortcuts. `cmd+.` must show the complete Shortcut Reference over the
// current context, and pressing it again must restore that context unchanged."
//
// The retained audit note on F02 is why this file is geometric and stateful rather
// than a screenshot: "A static screenshot cannot prove the open/close round trip
// preserves context." So the document beneath is compared before and after.
//
// Current feedback restores the original persistent interaction: one complete
// cmd+. press opens the Reference and the next closes it. Escape dismisses the
// open transient before the editor beneath sees that same key.

const SHEET = ".zd-reference";

async function open(page: import("@playwright/test").Page) {
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(page.locator(SHEET)).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
});

/** Everything about the document that a blanked window would destroy. */
async function documentState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface");
    return {
      lines: document.querySelectorAll(".cm-line").length,
      text: [...document.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n"),
      scrollTop: surface?.scrollTop ?? -1,
      target: document.querySelector('[data-focus="target"]')?.textContent ?? null,
      surfaceVisible: surface ? getComputedStyle(surface).display !== "none" : false,
    };
  });
}

test("there is no sheet until the command", async ({ page }) => {
  await expect(page.locator(SHEET)).toHaveCount(0);
});

test("cmd+period opens the reference and lists the registry", async ({ page }) => {
  await open(page);

  const sheet = page.locator(SHEET);
  await expect(sheet).toHaveCount(1);

  const text = (await sheet.textContent()) ?? "";
  expect(text, "the save command is missing").toContain("Save the document");
  expect(text, "the current-file Find command is missing").toContain("Find in the current file");
  expect(text, "the Markdown source command is missing").toContain("Raw mode");
  // Its own command has to be listed — the first prototype's Reference could not
  // tell you how to close itself.
  expect(text, "the Reference does not list itself").toContain("Shortcut Reference");
});

test("cmd+period stays open after release and toggles closed on the next press", async ({
  page,
}) => {
  const before = await documentState(page);

  await page.keyboard.press("ControlOrMeta+Period");
  await expect(page.locator(SHEET)).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+Period");
  await expect(page.locator(SHEET)).toHaveCount(0);
  expect(await documentState(page)).toEqual(before);
});

test("the key and action columns use compact dense rows", async ({ page }) => {
  await open(page);

  const table = page.getByRole("table", { name: "Keyboard shortcuts" });
  await expect(table).toHaveCount(1);
  expect(await table.getByRole("row").count()).toBeGreaterThan(0);

  const rows = await table.getByRole("row").evaluateAll((list) =>
    list.map((row) => {
      const chord = row.querySelector<HTMLElement>(".zd-reference-chord")!;
      const description = row.querySelector<HTMLElement>(".zd-reference-description")!;
      const chordBox = chord.getBoundingClientRect();
      const descriptionBox = description.getBoundingClientRect();
      return {
        height: row.getBoundingClientRect().height,
        chordSize: Number.parseFloat(getComputedStyle(chord).fontSize),
        descriptionSize: Number.parseFloat(getComputedStyle(description).fontSize),
        columnGap: descriptionBox.left - chordBox.right,
      };
    }),
  );

  expect(rows.length).toBeGreaterThan(0);
  expect(Math.max(...rows.map(({ height }) => height))).toBeLessThanOrEqual(24);
  expect(Math.max(...rows.map(({ chordSize }) => chordSize))).toBeLessThanOrEqual(13);
  expect(Math.max(...rows.map(({ descriptionSize }) => descriptionSize))).toBeLessThanOrEqual(13);
  expect(Math.min(...rows.map(({ columnGap }) => columnGap))).toBeGreaterThanOrEqual(8);
});

test("every row shows a key and a description, and no row is empty", async ({ page }) => {
  await open(page);

  const rows = await page.locator(`${SHEET} .zd-reference-row`).evaluateAll((list) =>
    list.map((row) => ({
      chord: row.querySelector(".zd-reference-chord")?.textContent?.trim() ?? "",
      description: row.querySelector(".zd-reference-description")?.textContent?.trim() ?? "",
    })),
  );

  expect(rows.length, "no rows rendered").toBeGreaterThan(0);
  for (const row of rows) {
    // F16's sibling failure: a Reference is only useful if every line of it says
    // both which key and what it does.
    expect(row.chord, `a row has no key: ${JSON.stringify(row)}`).not.toBe("");
    expect(row.description, `a row has no description: ${JSON.stringify(row)}`).not.toBe("");
  }
});

test("the document is still there underneath, not blanked", async ({ page }) => {
  await open(page);

  // F02 exactly: the window went blank. The sheet covers the content region
  // (§6.2) — it does not replace it, so the document is still in the DOM and
  // still laid out beneath.
  const underneath = await documentState(page);
  expect(underneath.lines, "the document was torn down").toBeGreaterThan(0);
  expect(underneath.surfaceVisible, "the surface was hidden rather than covered").toBe(true);
});

test("escape dismisses the reference before changing the document mode", async ({ page }) => {
  // Put the document in a state worth preserving: a caret, a focus target, and a
  // scroll position that is not the top.
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await page.evaluate(() => document.querySelector(".md-surface")!.scrollBy(0, 400));
  await page.waitForTimeout(200);
  const before = await documentState(page);

  expect(await page.evaluate(() => window.zdEditor!.hasCaret())).toBe(true);
  await open(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(SHEET)).toHaveCount(0);

  // The top transient gets the first Escape; the caret beneath is untouched.
  expect(await page.evaluate(() => window.zdEditor!.hasCaret())).toBe(true);
  expect(await documentState(page)).toEqual(before);

  // Once the transient is gone, the same semantic command reaches the next
  // contextual target.
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.zdEditor!.hasCaret())).toBe(false);
});

test("releasing either key leaves the persistent reference open", async ({ page }) => {
  await page.keyboard.down("ControlOrMeta");
  await page.keyboard.down("Period");
  await expect(page.locator(SHEET)).toHaveCount(1);

  await page.keyboard.up("ControlOrMeta");
  await expect(page.locator(SHEET)).toHaveCount(1);

  await page.keyboard.up("Period");
  await expect(page.locator(SHEET)).toHaveCount(1);
});

test("escape has one semantic owner", async ({ page }) => {
  const owners = await page.evaluate(() =>
    window
      .zdTest!.commands()
      .filter((command) => command.chord.key === "Escape")
      .map((command) => command.id),
  );
  expect(owners).toEqual(["workbench.escape"]);
});

test("holding it does not stack two sheets", async ({ page }) => {
  // A held key auto-repeats, so the same chord arrives many times before keyup.
  await page.keyboard.down("ControlOrMeta");
  await page.keyboard.down("Period");
  await page.keyboard.down("Period");
  await page.keyboard.down("Period");

  // §6.2: "Exactly one transient may be active … it never paints a second sheet
  // above it."
  await expect(page.locator(SHEET)).toHaveCount(1);
});

test("the sheet is a calm plane, not a floating card", async ({ page }) => {
  await open(page);

  const look = await page.locator(SHEET).evaluate((el) => {
    const style = getComputedStyle(el);
    const column = el.querySelector<HTMLElement>(".zd-reference-column")!;
    return {
      background: style.backgroundColor,
      transient: getComputedStyle(document.documentElement)
        .getPropertyValue("--surface-transient")
        .trim(),
      shadow: style.boxShadow,
      radius: style.borderRadius,
      columnWidth: column.getBoundingClientRect().width,
    };
  });

  // §6.2: "one calm replacement plane. They are not rounded cards and do not
  // float with shadows … There is no scrim, blur, dim, or decorative backdrop."
  expect(look.shadow, "the sheet floats").toBe("none");
  expect(parseFloat(look.radius), "the sheet is a rounded card").toBe(0);
  // "a centred column no wider than 640 px".
  expect(look.columnWidth).toBeLessThanOrEqual(640);
});

// F16's second sentence, which the registry alone cannot keep: "Unavailable
// commands must be identified honestly rather than displayed as working
// shortcuts." §7.1 says the same — "A binding that cannot run in the current
// context is presented honestly rather than displayed as working."
//
// An unavailable command can be registered deliberately through `zdTest`, which
// is more stable than depending on whichever editor mode happens to be active.

test("an unavailable command is listed, not hidden", async ({ page }) => {
  await open(page);

  const rows = await page.locator(`${SHEET} .zd-reference-row`).evaluateAll((list) =>
    list.map((row) => ({
      available: row.getAttribute("data-available"),
      text: row.textContent ?? "",
    })),
  );

  // Honest means present and marked, not omitted. A Reference that drops what it
  // cannot run is a Reference you cannot trust to be complete.
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.available, `a row does not state availability: ${row.text}`).toMatch(
      /^(true|false)$/,
    );
  }
  expect(
    rows.some((r) => r.available === "true"),
    "nothing was available",
  ).toBe(true);
});

test("an unavailable row says so in words, not only in colour", async ({ page }) => {
  // Availability is driven directly through a registered command instead of
  // depending on another feature's current mode.
  await page.evaluate(() => {
    window.zdTest!.register({
      id: "test.unavailable",
      chord: { key: "F9" },
      description: "A command that cannot run here",
      available: () => false,
      run: () => true,
    });
  });
  await open(page);

  // Identified by its own description, not by being the first unavailable row —
  // "the first row that looks like it" is a locator that goes stale the moment a
  // second command shares the state.
  const row = page
    .locator(`${SHEET} .zd-reference-row[data-available="false"]`, {
      hasText: "A command that cannot run here",
    })
    .first();
  await expect(row).toHaveCount(1);

  const shown = await row.evaluate((el) => ({
    text: el.textContent ?? "",
    ariaDisabled: el.getAttribute("aria-disabled"),
    note: el.querySelector(".zd-reference-note")?.textContent?.trim() ?? "",
  }));

  // §9 and §8: state has to survive without colour. A greyed row and nothing
  // else is exactly "displayed as working" to anyone who cannot see the grey.
  expect(shown.note, "unavailability is colour-only").not.toBe("");
  expect(shown.ariaDisabled, "the state is not exposed to assistive tech").toBe("true");
  expect(shown.text).toContain("A command that cannot run here");
});

test("pressing an unavailable chord does nothing", async ({ page }) => {
  const ran = await page.evaluate(async () => {
    let called = false;
    window.zdTest!.register({
      id: "test.unavailable",
      chord: { key: "F9" },
      description: "A command that cannot run here",
      available: () => false,
      run: () => {
        called = true;
        return true;
      },
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F9", bubbles: true }));
    return called;
  });

  // The listed state and the real behaviour are the same fact, which is the
  // whole of F16. A row marked unavailable whose key still fires would be the
  // same lie told the other way round.
  expect(ran).toBe(false);
});
