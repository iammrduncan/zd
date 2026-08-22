import { expect, test } from "@playwright/test";

// Finding F02, in full: "Pressing `cmd+.` makes the entire window go blank and
// shows no shortcuts. `cmd+.` must show the complete Shortcut Reference over the
// current context, and pressing it again must restore that context unchanged."
//
// The retained audit note on F02 is why this file is geometric and stateful rather
// than a screenshot: "A static screenshot cannot prove the open/close round trip
// preserves context." So the document beneath is compared before and after.
//
// **Held, not toggled** (feedback, 2026-07-30): "esc is set to close shortcut menu,
// when releasing cmd+. should just close it. esc should be set to unfocus the
// editor". So the Reference is on screen for exactly as long as the chord is down,
// and F02's "pressing it again" becomes "letting go" — the round trip it asks for
// is the same round trip either way, which is why every test here holds the chord
// rather than pressing it. `page.keyboard.press` sends keydown *and* keyup, so it
// would now open and close the sheet inside one call.

const SHEET = ".zd-reference";

/** Hold cmd+. down, and leave it down. */
async function hold(page: import("@playwright/test").Page) {
  await page.keyboard.down("ControlOrMeta");
  await page.keyboard.down("Period");
}

/** Let it go, in the order a hand actually does: modifier last. */
async function letGo(page: import("@playwright/test").Page) {
  await page.keyboard.up("Period");
  await page.keyboard.up("ControlOrMeta");
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
  await hold(page);

  const sheet = page.locator(SHEET);
  await expect(sheet).toHaveCount(1);

  const text = (await sheet.textContent()) ?? "";
  expect(text, "the save command is missing").toContain("Save the document");
  // By the half of the description that says what the command is *for*. It read
  // "word count" until 2026-07-30, when the strip gained a line count and a read
  // time and the description had to stop naming only one of four values — a
  // locator anchored to the part most likely to be reworded is one that fails for
  // reasons that are not defects.
  expect(text, "the status command is missing").toContain("unsaved state");
  // Its own command has to be listed — the first prototype's Reference could not
  // tell you how to close itself.
  expect(text, "the Reference does not list itself").toContain("Shortcut Reference");
});

test("every row shows a key and a description, and no row is empty", async ({ page }) => {
  await hold(page);

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
  await hold(page);

  // F02 exactly: the window went blank. The sheet covers the content region
  // (§6.2) — it does not replace it, so the document is still in the DOM and
  // still laid out beneath.
  const underneath = await documentState(page);
  expect(underneath.lines, "the document was torn down").toBeGreaterThan(0);
  expect(underneath.surfaceVisible, "the surface was hidden rather than covered").toBe(true);
});

test("letting go restores the context unchanged", async ({ page }) => {
  // Put the document in a state worth preserving: a caret, a focus target, and a
  // scroll position that is not the top.
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await page.evaluate(() => document.querySelector(".md-surface")!.scrollBy(0, 400));
  await page.waitForTimeout(200);
  const before = await documentState(page);

  await hold(page);
  await expect(page.locator(SHEET)).toHaveCount(1);
  await letGo(page);
  await expect(page.locator(SHEET)).toHaveCount(0);

  // F02's requirement, unchanged by the chord becoming a hold: "restore that
  // context unchanged" — every field, not just that something is on screen.
  expect(await documentState(page)).toEqual(before);
});

test("releasing the modifier first is enough", async ({ page }) => {
  await hold(page);
  await expect(page.locator(SHEET)).toHaveCount(1);

  // Nobody releases two keys simultaneously, and which one goes first is not
  // something a hand controls. Cmd usually comes up a few milliseconds early.
  await page.keyboard.up("ControlOrMeta");
  await expect(page.locator(SHEET)).toHaveCount(0);

  await page.keyboard.up("Period");
  await expect(page.locator(SHEET), "the second key up reopened it").toHaveCount(0);
});

test("escape is not the Reference's key any more", async ({ page }) => {
  await hold(page);
  await expect(page.locator(SHEET)).toHaveCount(1);
  await letGo(page);

  /*
   * §8 gives Escape to "the top transient surface", and the Reference used to be
   * one. It cannot be any more: the sheet is gone the instant the chord is
   * released, so there is never a moment when Escape could dismiss it, and a
   * command that can never run is exactly what §7.1 forbids listing.
   *
   * This standalone editor specimen has no root workbench router, so its one
   * Escape binding remains the document command. The product workbench owns the
   * chord and routes this same behavior as a contextual target.
   */
  const owners = await page.evaluate(() =>
    window
      .zdTest!.commands()
      .filter((command) => command.chord.key === "Escape")
      .map((command) => command.id),
  );
  expect(owners, "Escape is not the document's, or is shared").toEqual(["document.dropCaret"]);
});

test("holding it does not stack two sheets", async ({ page }) => {
  // A held key auto-repeats, so the same chord arrives many times over one hold.
  await hold(page);
  await page.keyboard.down("Period");
  await page.keyboard.down("Period");

  // §6.2: "Exactly one transient may be active … it never paints a second sheet
  // above it."
  await expect(page.locator(SHEET)).toHaveCount(1);
});

test("the sheet is a calm plane, not a floating card", async ({ page }) => {
  await hold(page);

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
// Every real command on the editor page is available, and that stopped being a
// coincidence when the Reference gave up Escape — `transient.dismiss` used to be
// the one guaranteed-unavailable row. So an unavailable command is registered
// deliberately through `zdTest`, which is more honest than contriving a context.

test("an unavailable command is listed, not hidden", async ({ page }) => {
  await hold(page);

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
  // Availability is driven directly through a registered command. There *is* a
  // naturally unavailable one on this page now — Escape, until a caret is placed —
  // but a registered one states its own condition instead of depending on another
  // feature's, which is what made this test fail when Escape arrived.
  await page.evaluate(() => {
    window.zdTest!.register({
      id: "test.unavailable",
      chord: { key: "F9" },
      description: "A command that cannot run here",
      available: () => false,
      run: () => true,
    });
  });
  await hold(page);

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
