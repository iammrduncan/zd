import MarkdownIt from "markdown-it";

/*
 * Markdown source to DOM.
 *
 * Everything about how rendered editor fragments are parsed — which dialect,
 * what is allowed through, how the nodes get built — stays in here, so table
 * widgets never learn that markdown-it exists.
 */

const parser = new MarkdownIt({
  /*
   * Documents come off disk and are not ours. `html: false` means raw HTML in a
   * source file is escaped and shown as text rather than parsed, which removes
   * the injection surface at the trust boundary instead of trying to sanitise
   * afterwards. markdown-it also validates link protocols, so `javascript:` and
   * friends do not survive into an href.
   */
  html: false,

  /*
   * Off deliberately, both of them. This reads agent logs and source markdown,
   * where the file is evidence: turning "quotes" into curly quotes, `--` into an
   * en dash, or a bare URL into a link would show the user something other than
   * what is in the file. Only real markdown links become links, which is also
   * what lets §4.3 draw a clean line between in-reader navigation and the system
   * browser.
   */
  typographer: false,
  linkify: false,
});

/** Anything that would leave the process to load: `http:`, `https:`, or `//host`. */
function isRemote(src: string): boolean {
  return /^\s*(https?:)?\/\//i.test(src);
}

/**
 * Replace remote images with a text placeholder before they can be fetched.
 *
 * DESIGN.md §7.3: "Remote images are never fetched. Missing and blocked images
 * receive a quiet, size-stable text placeholder." The app's CSP already refuses
 * remote `img-src`, but that is a backstop — a document should not be able to
 * announce that it was opened, and a blocked image with a broken-image icon is
 * not a quiet placeholder.
 *
 * Safe to do here because `<template>` content is inert: the browser does not
 * load images inside it, so nothing has been requested by the time this runs.
 */
function blockRemoteImages(fragment: DocumentFragment): void {
  for (const image of fragment.querySelectorAll("img")) {
    const src = image.getAttribute("src") ?? "";
    if (!isRemote(src)) continue;

    const placeholder = document.createElement("span");
    placeholder.className = "md-image-blocked";
    // The alt text is the author's own description; falling back to the word
    // keeps the line readable when there is none.
    placeholder.textContent = image.getAttribute("alt")?.trim() || "image";
    placeholder.dataset.blockedSrc = src.trim();
    image.replaceWith(placeholder);
  }
}

/**
 * One run of *inline* markdown to DOM — no paragraph wrapper.
 *
 * For places that hold inline content inside something the caller already built,
 * which today means a table cell in the editor. The editor parses structure with
 * Lezer and renders that cell's contents with this, so a link or a code span
 * inside a cell looks the way the same markup looks anywhere else, by
 * construction rather than by two implementations agreeing.
 *
 * Same parser, so the same guarantees: `html: false` escapes raw HTML at the
 * trust boundary, link protocols are validated, and remote images are replaced
 * before anything can fetch them. A second inline renderer would be a second
 * place for all three to be got wrong.
 */
export function renderInlineMarkdown(source: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = parser.renderInline(source);
  blockRemoteImages(template.content);
  return template.content;
}
