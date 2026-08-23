import { expect, type Locator, type Page } from "@playwright/test";

const DEFAULT_VIEWPORT = { width: 1100, height: 800 };

/** Open the real editor fixture and wait for its styled surface, parser, and fonts. */
export async function openEditor(
  page: Page,
  options: { height?: number; url?: string; width?: number } = {},
): Promise<void> {
  await page.setViewportSize({
    width: options.width ?? DEFAULT_VIEWPORT.width,
    height: options.height ?? DEFAULT_VIEWPORT.height,
  });
  await page.goto(options.url ?? "/dev/editor.html");

  const editor = page.locator(".md-editor .cm-content");
  await expect(editor, "the editor fixture did not mount").toBeVisible();
  const requested = options.url ?? "";
  const code = requested.includes("doc=code") || requested.includes("doc=large");
  const mermaid = requested.includes("doc=mermaid");
  if (code) {
    await expect(page.locator('.md-editor[data-language="code"]')).toBeVisible();
    await expect(
      page
        .locator(".md-editor .cm-line", {
          hasText: requested.includes("doc=large") ? "record_00000" : "readFile",
        })
        .first(),
    ).toBeVisible();
  } else if (mermaid) {
    await expect(page.locator('.md-editor[data-language="mermaid"]')).toBeVisible();
  } else {
    await expect(
      page.locator(".md-editor .md-line-h1", { hasText: "Typing in the document" }),
      "the fixture title was not parsed and decorated",
    ).toBeVisible();
  }
  await page.evaluate(async () => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.ready;
  });
}

/**
 * Scroll the product-owned editor surface until one exact semantic target exists.
 *
 * CodeMirror materializes only the viewport. Polling the target after each real
 * surface scroll waits for both virtualization and the parser/decorations that
 * create it. Callers supply the semantic class and unique fixture text; this
 * helper owns only the asynchronous mechanics.
 */
export async function materializeEditorTarget(
  page: Page,
  target: Locator,
  description: string,
): Promise<Locator> {
  await expect
    .poll(
      async () => {
        if ((await target.count()) > 0 && (await target.first().isVisible())) return true;

        return page.locator(".md-surface").evaluate((surface: HTMLElement) => {
          const furthest = Math.max(0, surface.scrollHeight - surface.clientHeight);
          const step = Math.max(200, Math.floor(surface.clientHeight * 0.75));
          surface.scrollTop =
            surface.scrollTop >= furthest - 1 ? 0 : Math.min(furthest, surface.scrollTop + step);
          return false;
        });
      },
      {
        message: `${description} was never materialized and decorated`,
        timeout: 10_000,
      },
    )
    .toBe(true);

  const found = target.first();
  await expect(found, `${description} was materialized but not visible`).toBeVisible();
  return found;
}

/** Wait for browser-owned focus transitions rather than guessing their duration. */
export async function waitForEditorAnimations(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(".md-editor")
        .evaluate((editor) =>
          editor
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== "running"),
        ),
    )
    .toBe(true);
}

/** Wait until the scroll position itself reports that motion has stopped. */
export async function waitForEditorScrollToSettle(page: Page): Promise<number> {
  let previous: number | null = null;
  let stableSince: number | null = null;

  await expect
    .poll(
      async () => {
        const current = await page.locator(".md-surface").evaluate((surface) => surface.scrollTop);
        if (previous !== null && Math.abs(current - previous) <= 0.1) {
          stableSince ??= Date.now();
        } else {
          stableSince = null;
        }
        previous = current;
        return stableSince !== null && Date.now() - stableSince >= 80;
      },
      { intervals: [16], timeout: 5_000 },
    )
    .toBe(true);

  return previous ?? 0;
}

type ScrollSample = { at: number; top: number };

/** Start a per-paint scroll trace which the test stops after its state assertion settles. */
export async function beginEditorScrollTrace(page: Page): Promise<void> {
  await page.locator(".md-surface").evaluate((surface) => {
    type TraceState = { active: boolean; frame: number; samples: ScrollSample[] };
    const host = window as unknown as { zdEditorScrollTrace?: TraceState };
    if (host.zdEditorScrollTrace) {
      host.zdEditorScrollTrace.active = false;
      cancelAnimationFrame(host.zdEditorScrollTrace.frame);
    }

    const state: TraceState = { active: true, frame: 0, samples: [] };
    host.zdEditorScrollTrace = state;
    const record = (at: number) => {
      state.samples.push({ at, top: surface.scrollTop });
      if (state.active) state.frame = requestAnimationFrame(record);
    };
    state.frame = requestAnimationFrame(record);
  });
}

/** Stop and return the trace after the caller has asserted the motion's resting state. */
export async function endEditorScrollTrace(page: Page): Promise<ScrollSample[]> {
  return page.locator(".md-surface").evaluate((surface) => {
    type TraceState = { active: boolean; frame: number; samples: ScrollSample[] };
    const state = (window as unknown as { zdEditorScrollTrace?: TraceState }).zdEditorScrollTrace;
    if (!state) return [];

    state.active = false;
    cancelAnimationFrame(state.frame);
    const last = state.samples[state.samples.length - 1];
    if (!last || Math.abs(last.top - surface.scrollTop) > 0.01) {
      state.samples.push({ at: performance.now(), top: surface.scrollTop });
    }
    return state.samples;
  });
}
