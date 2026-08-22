import { afterEach, beforeEach } from "vitest";

/*
 * jsdom has no layout engine, so a handful of DOM methods that depend on one
 * simply do not exist. They are stubbed here rather than guarded in the app:
 * the app runs in a real browser where they are always present, and a
 * `typeof x === "function"` check in production code to satisfy a test
 * environment is exactly the kind of defensive noise that hides real bugs.
 *
 * Anything that needs real geometry belongs in tests/e2e, where Playwright has
 * an engine that can measure it — see the note in vitest.config.ts.
 */

Element.prototype.scrollIntoView ??= function scrollIntoView(): void {
  // No layout, nothing to scroll.
};

Range.prototype.getClientRects ??= function getClientRects(): DOMRectList {
  // CodeMirror asks while applying a scroll-into-view selection. jsdom has no
  // boxes to return; the real navigation geometry is covered in Playwright.
  return [] as unknown as DOMRectList;
};

HTMLDialogElement.prototype.showModal ??= function showModal(): void {
  this.open = true;
};

HTMLDialogElement.prototype.close ??= function close(): void {
  this.open = false;
};

/**
 * Give every unit test the same clean, non-opaque browser-storage boundary.
 *
 * Preference tests used to clean up only their own file. A test elsewhere could
 * therefore leave a suite preference behind and make the next file depend on
 * worker order. The configured jsdom URL makes Storage available; these hooks
 * make each test the complete lifetime of anything it stores.
 */
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
