import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

// Finding F07: "Text inside single backticks is visibly unaligned with the
// surrounding prose. Inline code must share the surrounding baseline and line
// rhythm while retaining a restrained semantic distinction."
//
// The 2026-07-29 decision keeps the backticks on screen — they are in the *stays
// literal* list — so unlike a link, nothing is hidden here. The run takes the code
// role and the backticks stay quiet, per §5.2's rewritten marker rule.
//
// §5.2 also names the three ways this goes wrong:
// a `vertical-align` other than baseline, a `line-height` of its own, or vertical
// padding that pushes the plane into the line gap.

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-inline-code", { hasText: "renderMarkdown" }),
    "the fixture inline-code run",
  );
});

/** The first inline-code run inside a plain paragraph. */
async function inlineCode(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (el) => el.textContent?.includes("renderMarkdown") && !el.className.includes("md-line-h"),
    );
    const run = line?.querySelector<HTMLElement>(".md-inline-code");
    if (!line || !run) return null;

    const style = getComputedStyle(run);
    const lineStyle = getComputedStyle(line);
    return {
      family: style.fontFamily,
      size: style.fontSize,
      verticalAlign: style.verticalAlign,
      lineHeight: style.lineHeight,
      lineLineHeight: lineStyle.lineHeight,
      paddingBlock: `${style.paddingTop} ${style.paddingBottom}`,
      paddingInline: style.paddingLeft,
      background: style.backgroundColor,
      outline: style.boxShadow,
      proseFamily: lineStyle.fontFamily,
      text: run.textContent,
    };
  });
}

test("an inline run takes the code face and a quiet plane", async ({ page }) => {
  const code = await inlineCode(page);
  expect(code, "no inline code was decorated").not.toBeNull();

  expect(code!.family.toLowerCase(), "the run is not in the mono family").toContain("mono");
  expect(code!.family, "the run kept the prose family").not.toBe(code!.proseFamily);
  // §7.3 asks for `surface.code` sparingly — a plane, and no border or weight.
  expect(code!.background, "the run has no plane").not.toBe("rgba(0, 0, 0, 0)");
  expect(code!.outline, "the code plane blends into the document canvas").not.toBe("none");
});

test("it shares the prose baseline and line rhythm", async ({ page }) => {
  const code = await inlineCode(page);

  // §5.2's inline ownership contract, and the three specific traps F07 came from.
  expect(code!.verticalAlign, "a vertical-align other than baseline reintroduces F07").toBe(
    "baseline",
  );
  expect(code!.paddingBlock, "vertical padding pushes the plane into the line gap").toBe("0px 0px");
  expect(parseFloat(code!.paddingInline), "no horizontal breathing room").toBeGreaterThan(0);

  /*
   * The rhythm claim, measured as an outcome rather than as the run's own
   * `line-height`.
   *
   * `--type-prose-line` is a unitless ratio, so an inline run at 15px computes a
   * smaller line-height than the 17px line around it — and that is fine: a
   * shorter inline box does not shrink the parent's line box, so the prose row
   * height still governs. Asserting the two computed values matched failed on a
   * difference nobody can see.
   *
   * So the claim is that a line carrying code still occupies a whole number of
   * prose rows. If the run inflated its line box the height would stop being a
   * clean multiple, which is exactly the visible symptom F07 describes.
   *
   * Not `getClientRects().length` for the row count — on mixed inline content that
   * returns one rect per inline fragment rather than per visual row, which is a
   * mistake worth leaving written down.
   */
  const rhythm = await page.evaluate(() => {
    const row = parseFloat(
      getComputedStyle(document.querySelector<HTMLElement>(".cm-content")!).lineHeight,
    );
    const withCode = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (el) => el.querySelector(".md-inline-code") && !el.className.includes("md-line-h"),
    )!;
    const height = withCode.getBoundingClientRect().height;
    return { row, height, rows: height / row };
  });

  expect(
    rhythm.rows,
    `a code line of ${rhythm.height}px is not whole rows of ${rhythm.row}px`,
  ).toBeCloseTo(Math.round(rhythm.rows), 1);
});

test("the backticks stay on screen and stay quiet", async ({ page }) => {
  const marks = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (el) => el.textContent?.includes("renderMarkdown") && !el.className.includes("md-line-h"),
    )!;
    const run = line.querySelector<HTMLElement>(".md-inline-code");
    const mark = line.querySelector<HTMLElement>(".md-code-mark");
    const probe = document.createElement("span");
    probe.style.color = "var(--text-muted)";
    document.body.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    return {
      onScreen: (run?.textContent ?? "").includes("`"),
      markColour: mark ? getComputedStyle(mark).color : null,
      muted,
      targetLine: line.getAttribute("data-focus"),
    };
  });

  // The decision put single backticks in the *stays literal* list, so unlike a
  // link's brackets they are still here — and §5.2 keeps every marker `text.muted`.
  expect(marks.onScreen, "the backticks were hidden").toBe(true);
  expect(marks.markColour, "the backticks are not marked as notation").not.toBeNull();
});

test("inline code in a heading keeps the heading's size and Mono Regular face", async ({
  page,
}) => {
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-line-h3", { hasText: "Calling" }),
    "the heading with inline code",
  );
  const heading = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (el) => el.className.includes("md-line-h3") && el.textContent?.includes("renderMarkdown"),
    );
    const run = line?.querySelector<HTMLElement>(".md-inline-code");
    return line && run
      ? {
          runSize: getComputedStyle(run).fontSize,
          headingSize: getComputedStyle(line).fontSize,
          runFamily: getComputedStyle(run).fontFamily,
          runWeight: getComputedStyle(run).fontWeight,
        }
      : null;
  });

  // Finding F10 and the 2026-08-03 decision: heading code keeps the heading's
  // size and line height but stays Mono Regular instead of inheriting Bold.
  // Dropping to body inline-code size mid-heading is the original defect.
  expect(heading, "no heading carried an inline code run").not.toBeNull();
  expect(heading!.runSize, "the run dropped to body size inside a heading").toBe(
    heading!.headingSize,
  );
  expect(heading!.runFamily.toLowerCase()).toContain("mono");
  expect(heading!.runWeight, "the run inherited the heading's Bold weight").toBe("400");
});
