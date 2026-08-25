import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

// The 2026-07-29 decision puts images in vision §6.1's *renders* list, and
// DESIGN.md §7.3 sets the hard rule they have to obey: "Raw HTML is inert text.
// Remote images are never fetched. Missing and blocked images receive a quiet,
// size-stable text placeholder."
//
// So this is not only "show the picture instead of the source" — it is that, without
// giving a document the ability to announce that it was opened.

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  /*
   * `.md-image`, never a bare `img`. CodeMirror wraps every widget in its own
   * `<img class="cm-widgetBuffer" aria-hidden>` — zero-size and invisible — so a
   * `.md-editor img` locator matches a buffer first and then waits forever for it
   * to become visible. Thirteen `img` elements are on this page and only two are
   * pictures.
   */
  await materializeEditorTarget(
    page,
    page.locator('.md-editor .md-image:has(img[alt="a dot"])'),
    "the local fixture image",
  );
});

test("a local image renders as a picture, not as bracket source", async ({ page }) => {
  const image = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(".md-image img");
    return img ? { alt: img.getAttribute("alt"), src: img.getAttribute("src") } : null;
  });

  expect(image, "no image element was rendered").not.toBeNull();
  expect(image!.alt, "the alt text was lost").toBe("a dot");
  expect(image!.src?.startsWith("data:image/gif"), "the source is not the declared one").toBe(true);

  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );
  expect(onScreen, "the image's bracket source is still on screen").not.toContain("![a dot]");
});

test("clicking a rendered image keeps the image rendered", async ({ page }) => {
  const image = page.locator('.md-image img[alt="a dot"]');
  await image.click();

  await expect(image, "the image disappeared when it received pointer focus").toBeVisible();
  await expect(
    page.locator(".cm-content"),
    "the click revealed the image source",
  ).not.toContainText("![a dot]");
});

test("dragging a text selection across a rendered image keeps it rendered", async ({ page }) => {
  const source =
    "Before ![a dot](data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=) after";
  await page.evaluate((text) => window.zdEditor!.setText(text), source);
  const image = page.locator('.md-image img[alt="a dot"]');
  await expect(image).toBeVisible();

  const points = await page.locator(".cm-line", { hasText: "Before" }).evaluate((line) => {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text);
    const point = (needle: string, end: boolean) => {
      const node = textNodes.find((candidate) => candidate.data.includes(needle));
      if (!node) throw new Error(`no rendered text contains ${needle}`);
      const offset = node.data.indexOf(needle) + (end ? needle.length : 0);
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset);
      const rect = range.getBoundingClientRect();
      return { x: rect.left, y: rect.top + rect.height / 2 };
    };
    const image = line.querySelector<HTMLElement>(".md-image")!.getBoundingClientRect();
    return {
      start: point("Before", false),
      image: { x: image.left + image.width / 2, y: image.top + image.height / 2 },
      end: point("after", true),
    };
  });

  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.image.x, points.image.y, { steps: 8 });
  await page.mouse.up();
  await expect(image, "the image disappeared when a selection ended on it").toBeVisible();

  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
  await page.mouse.up();

  await expect(image, "the image disappeared while the selection crossed it").toBeVisible();
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe(source);
  const forward = await page.evaluate(() => window.zdEditor!.selection());
  expect(forward.from, "the selection did not start before the image source").toBeLessThanOrEqual(
    source.indexOf("![a dot]"),
  );
  expect(forward.to, "the selection did not cross the image source").toBeGreaterThanOrEqual(
    source.indexOf(") after") + 1,
  );

  await page.mouse.move(points.end.x, points.end.y);
  await page.mouse.down();
  await page.mouse.move(points.start.x, points.start.y, { steps: 12 });
  await page.mouse.up();

  await expect(image, "the image disappeared during a backward selection").toBeVisible();
  const backward = await page.evaluate(() => window.zdEditor!.selection());
  expect(backward.from).toBeLessThanOrEqual(source.indexOf("![a dot]"));
  expect(backward.to).toBeGreaterThanOrEqual(source.indexOf(") after") + 1);
});

test("a remote image is a quiet placeholder and is never requested", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.reload();
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-image-blocked", { hasText: "a diagram that will not load" }),
    "the blocked remote image",
  );

  const placeholder = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>(".md-editor .md-image-blocked");
    return node ? { text: node.textContent, blocked: node.dataset.blockedSrc } : null;
  });

  // §7.3, and the reason the reader builds inside an inert `<template>`: a document
  // must not be able to phone home just by being opened.
  expect(placeholder, "the remote image was not replaced").not.toBeNull();
  expect(placeholder!.text, "the placeholder lost the author's description").toBe(
    "a diagram that will not load",
  );
  expect(
    requests.filter((url) => url.includes("example.com")),
    `a remote image was fetched: ${requests.filter((u) => u.includes("example.com")).join(", ")}`,
  ).toEqual([]);
});

test("rendering an image does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());

  expect(text, "the source lost its image markup").toContain("![a dot](data:image/gif");
  expect(text, "the source lost the remote image").toContain(
    "![a diagram that will not load](https://example.com/diagram.png)",
  );
});

test("raw mode shows the image source again", async ({ page }) => {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+e");
  await expect.poll(() => page.evaluate(() => window.zdEditor!.isRaw())).toBe(true);
  await page.keyboard.press("ControlOrMeta+f");
  await page.locator(".editor-find-query").fill("![a dot]");
  const line = await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "A local one renders" }),
    "the raw local-image source line",
  );

  // §7.4: raw mode reveals the literal source of every rendered construct. An image
  // you cannot get back to the source of is one you cannot fix the path of.
  await expect(line, "the image source is still hidden under raw mode").toContainText(
    "![a dot](data:",
  );
  await expect(page.locator(".md-image"), "the picture survived raw mode").toHaveCount(0);
});
