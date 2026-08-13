import { expect, test } from "@playwright/test";

// DESIGN.md §7.10: "The Document Status Strip is the sole sanctioned bottom
// strip and exists only after its command. It is a single line of
// `type.supporting` text on the canvas, disappears after ten seconds, and never
// reserves permanent layout space. It reports the live buffer, including
// unsaved changes."
//
// That is the surface vision §6.3's "unsaved state is visible without adding
// chrome" lands on: §7.4 forbids a persistent dirty indicator in the document,
// so the only honest place to say it is somewhere that is not always there.

const STRIP = ".md-status";

test.beforeEach(async ({ page }) => {
  // Installed before navigation so the strip's own timer is the fake one.
  await page.clock.install();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
});

test("there is no strip until its command", async ({ page }) => {
  // "exists only after its command" — a strip sitting there at rest would be a
  // permanent status area, which §7.10's last paragraph forbids by name.
  await expect(page.locator(STRIP)).toHaveCount(0);
});

test("the command summons one line reporting the buffer", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+i");

  const strip = page.locator(STRIP);
  await expect(strip).toHaveCount(1);

  const text = (await strip.textContent()) ?? "";
  expect(text, "the strip does not report the buffer").toMatch(/\d+ words/);
  expect(text).toMatch(/\d+ characters/);
  /*
   * Added 2026-07-30 with the line count and the read time — "stats line needs
   * Read time … and line count". `statusLine` is unit-tested and the type makes a
   * caller that forgets a field a compile error, so what these two prove is the
   * rest of the path: that the *command* on this page hands the strip a real
   * document rather than a plausible-looking one.
   *
   * Loose patterns on purpose. The exact numbers belong to the fixture and would
   * change every time a line was added to it, which is a spec that breaks for
   * reasons that are not defects.
   */
  expect(text, "the line count is missing").toMatch(/[\d,]+ lines/);
  expect(text, "the read time is missing").toMatch(/\d+[hm]/);

  // §7.10: "a single line of `type.supporting` text".
  const type = await strip.evaluate((el) => {
    const style = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    return {
      size: style.fontSize,
      expected: root.getPropertyValue("--type-supporting-size").trim(),
      lines: el.getClientRects().length,
      background: style.backgroundColor,
    };
  });
  expect(type.size).toBe(type.expected);
  expect(type.lines, "the strip wrapped to more than one line").toBe(1);
  expect(type.background, "the strip is text on the canvas, not a bar").toBe("rgba(0, 0, 0, 0)");
});

test("the strip says whether the buffer is unsaved", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+i");
  expect(await page.locator(STRIP).textContent()).toContain("saved");

  // Type, and ask again. This is the whole point of the task: the one place the
  // document admits it has unwritten changes.
  await page.keyboard.type("x");
  await page.keyboard.press("ControlOrMeta+i");
  expect(await page.locator(STRIP).textContent()).toContain("unsaved");

  await page.keyboard.press("ControlOrMeta+s");
  await page.keyboard.press("ControlOrMeta+i");
  const after = (await page.locator(STRIP).textContent()) ?? "";
  expect(after).toContain("saved");
  expect(after, "a written buffer still called itself unsaved").not.toContain("unsaved");
});

test("the strip disappears after ten seconds", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+i");
  await expect(page.locator(STRIP)).toHaveCount(1);

  await page.clock.fastForward(9_000);
  await expect(page.locator(STRIP), "the strip left early").toHaveCount(1);

  await page.clock.fastForward(1_500);
  await expect(page.locator(STRIP), "the strip outstayed its ten seconds").toHaveCount(0);
});

test("summoning it again restarts its ten seconds rather than stacking", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+i");
  await page.clock.fastForward(9_000);
  await page.keyboard.press("ControlOrMeta+i");

  // §7.10: notices "do not become stacked toasts".
  await expect(page.locator(STRIP)).toHaveCount(1);
  await page.clock.fastForward(9_000);
  await expect(page.locator(STRIP), "the second summons did not reset the clock").toHaveCount(1);
});

test("the strip reserves no layout space", async ({ page }) => {
  const before = await page.evaluate(() => {
    const line = document.querySelector(".cm-line")!;
    return { top: line.getBoundingClientRect().top, height: document.body.scrollHeight };
  });

  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+i");
  await expect(page.locator(STRIP)).toHaveCount(1);

  const after = await page.evaluate(() => {
    const line = document.querySelector(".cm-line")!;
    return { top: line.getBoundingClientRect().top, height: document.body.scrollHeight };
  });

  // §7.10: "never reserves permanent layout space". A strip that pushed the
  // document up would be chrome appearing and disappearing under the reader,
  // which §2 calls out as the thing that must never happen while you work.
  expect(after.top, "the document moved when the strip appeared").toBeCloseTo(before.top, 0);
  expect(after.height, "the strip changed the scroll extent").toBe(before.height);
});

test("the command works when the window is focused but the caret is not", async ({ page }) => {
  // The complaint this closes: "cmd+i hotkey doesn't work if window is focused
  // but editor isn't. this should be a app level hotkey not an codemirror editor
  // level hot key." It was a CodeMirror keymap entry, so it only fired while the
  // contenteditable had focus. §7.1's registry listens once, on the window.
  await page.locator(".md-surface").click({ position: { x: 4, y: 4 } });
  expect(
    await page.evaluate(() => document.activeElement?.closest(".cm-content") !== null),
    "the caret was in the editor, so this proves nothing",
  ).toBe(false);

  await page.keyboard.press("ControlOrMeta+i");
  await expect(page.locator(STRIP)).toHaveCount(1);
});

/*
 * "cmd+i after it fades it forces you back to the top of the document"
 * (feedback, 2026-07-31).
 *
 * The fade is not what does it, and no clock is installed here for that reason. The
 * document moves the instant the chord is pressed, and it moves to wherever the caret
 * is — which after reading ahead is usually far behind you. It only reads as "after it
 * fades" because the strip is the thing on screen at the time.
 *
 * Measured four ways before anything was changed: appending the strip on its own moves
 * nothing, pressing a key with no command behind it moves nothing, doing neither moves
 * nothing, and pressing `cmd+i` moves the surface from 1283 to 409. So it is the
 * *claimed chord*, not the strip and not a keypress.
 *
 * The cause is where the registry listened. It attached in the bubble phase on
 * `window`, so CodeMirror's own handler on `.cm-content` ran first and scrolled its
 * selection into view before `preventDefault` could ever be reached. §4.1 is explicit
 * that this is wrong: "scrolling for context leaves focus where it is — reading ahead
 * is not the same as moving."
 */

test("a command does not drag the document back to the caret", async ({ page }) => {
  await page.locator(".cm-content").click();
  // A caret near the top, then read a long way down — §4.1's "reading ahead".
  await page.evaluate(() => window.zdEditor!.setCaret(40));
  await page.locator(".md-surface").hover();
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(400);

  const before = await page.evaluate(() =>
    Math.round(document.querySelector<HTMLElement>(".md-surface")!.scrollTop),
  );
  expect(before, "the surface did not scroll, so nothing is being measured").toBeGreaterThan(800);

  await page.keyboard.press("ControlOrMeta+i");
  await page.waitForTimeout(400);

  const after = await page.evaluate(() =>
    Math.round(document.querySelector<HTMLElement>(".md-surface")!.scrollTop),
  );
  await expect(page.locator(STRIP), "the strip did not appear").toHaveCount(1);
  expect(after, "asking for the status moved the document").toBe(before);
});

test("a key with no command behind it still reaches the editor", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.evaluate(() => window.zdEditor!.setCaret(40));
  const before = await page.evaluate(() => window.zdEditor!.text());

  await page.keyboard.type("typed");

  /*
   * The other half of listening in the capture phase, and the one worth guarding: the
   * registry now sees every key before the editor does. It must claim only the chords
   * it has commands for and let everything else through untouched, or the fix for a
   * scroll jump becomes an editor you cannot type in.
   */
  const after = await page.evaluate(() => window.zdEditor!.text());
  expect(after, "typing stopped reaching the editor").toBe(
    before.slice(0, 40) + "typed" + before.slice(40),
  );
});
