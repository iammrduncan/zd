import { expect, test } from "@playwright/test";

import { openEditor } from "./harness";

const MEBIBYTE = 1024 * 1024;

test("a multi-megabyte file keeps open, find, long-line, scroll, and edit work bounded", async ({
  page,
}, testInfo) => {
  const openedAt = Date.now();
  await openEditor(page, { url: "/dev/editor.html?doc=large" });
  const openWallMs = Date.now() - openedAt;

  const initial = await page.evaluate(() => ({
    readyAt: window.zdEditor!.readyAt,
    sourceBytes: window.zdEditor!.sourceBytes,
    sourceLength: window.zdEditor!.text().length,
    renderedLines: document.querySelectorAll(".cm-line").length,
  }));

  expect(initial.sourceBytes).toBeGreaterThan(3 * MEBIBYTE);
  expect(initial.sourceBytes).toBeLessThan(8 * MEBIBYTE);
  expect(initial.renderedLines).toBeLessThan(500);

  const findStarted = performance.now();
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByLabel("Find", { exact: true }).fill("LARGE_FIND_TARGET");
  await expect(page.locator(".editor-find-count")).toHaveText("1 of 3");
  const findMs = performance.now() - findStarted;

  const longLineStarted = performance.now();
  await page.getByLabel("Find", { exact: true }).fill("LONG_LINE_END");
  await expect(page.locator(".editor-find-count")).toHaveText("1 of 1");
  const longLineFindMs = performance.now() - longLineStarted;
  const longLineSelection = await page.evaluate(() => window.zdEditor!.selection());
  expect(
    await page.evaluate(
      ({ from, to }) => window.zdEditor!.text().slice(from, to),
      longLineSelection,
    ),
  ).toBe("LONG_LINE_END");

  await page.keyboard.press("Escape");
  const beforeEdit = await page.evaluate(() => window.zdEditor!.text().length);
  const editStarted = performance.now();
  await page.evaluate((at) => window.zdEditor!.setCaret(at), longLineSelection.to);
  await page.locator(".cm-content").focus();
  await page.keyboard.type("!");
  await expect.poll(() => page.evaluate(() => window.zdEditor!.text().length)).toBe(beforeEdit + 1);
  const editMs = performance.now() - editStarted;

  const scrollMs = await page.locator(".md-surface").evaluate(async (surface) => {
    const started = performance.now();
    let previousHeight = -1;
    let stableFrames = 0;

    // CodeMirror initially estimates the height of unmounted lines. Keep the
    // requested end position pinned while those estimates become measurements;
    // otherwise a correct height increase looks like the scroll jumped upward.
    for (let frame = 0; frame < 180; frame += 1) {
      surface.scrollTop = surface.scrollHeight;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const distance = Math.abs(surface.scrollHeight - surface.clientHeight - surface.scrollTop);
      if (distance < 2 && Math.abs(surface.scrollHeight - previousHeight) < 1) stableFrames += 1;
      else stableFrames = 0;
      previousHeight = surface.scrollHeight;
      if (stableFrames >= 3) return performance.now() - started;
    }

    throw new Error("large editor scroll height did not settle at the end");
  });

  const final = await page.evaluate(() => {
    const memory = performance as Performance & {
      memory?: { readonly usedJSHeapSize: number };
    };
    return {
      renderedLines: document.querySelectorAll(".cm-line").length,
      usedJSHeapSize: memory.memory?.usedJSHeapSize ?? null,
    };
  });

  const metrics = {
    ...initial,
    ...final,
    openWallMs,
    findMs,
    longLineFindMs,
    editMs,
    scrollMs,
  };
  await testInfo.attach("editor-large-file-metrics.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  testInfo.annotations.push({ type: "editor-performance", description: JSON.stringify(metrics) });

  // Broad regression ceilings; the attached release-build measurements are the
  // evidence used for tuning, not an attempt to benchmark shared CI hardware.
  expect(openWallMs).toBeLessThan(5_000);
  expect(initial.readyAt).toBeLessThan(3_000);
  expect(findMs).toBeLessThan(1_500);
  expect(longLineFindMs).toBeLessThan(2_000);
  expect(editMs).toBeLessThan(750);
  expect(scrollMs).toBeLessThan(750);
  expect(final.renderedLines).toBeLessThan(500);
  if (final.usedJSHeapSize !== null) expect(final.usedJSHeapSize).toBeLessThan(512 * MEBIBYTE);
});
