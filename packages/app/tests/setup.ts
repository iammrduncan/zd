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

HTMLDialogElement.prototype.showModal ??= function showModal(): void {
  this.open = true;
};

HTMLDialogElement.prototype.close ??= function close(): void {
  this.open = false;
};
