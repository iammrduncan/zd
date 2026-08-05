import type { Page } from "@playwright/test";

/** Resolve a viewport-relative design token to pixels in the browser engine. */
export async function tokenPx(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute; visibility:hidden; height:var(${name})`;
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }, token);
}
