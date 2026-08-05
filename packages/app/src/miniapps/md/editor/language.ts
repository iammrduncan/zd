import type { Extension } from "@codemirror/state";

import { codeHighlighting, codeLanguages } from "./highlight";

/**
 * What kind of document is this, and how should it be parsed — vision §6.2.
 *
 *   "A non-markdown file opens on the same surface, rendered as code: mono
 *    family, no markdown parsing, language-appropriate highlighting. The calm,
 *    the measure, the focus, and the theme are unchanged — what differs is only
 *    that the file is not markdown, and it is not treated as if it were."
 *
 * Reported as "html and ts parsed as markdown" (feedback, 2026-07-29), and that
 * is the harm worth naming precisely. It is not that a `.ts` file went
 * unhighlighted — it is that markdown *rules were applied to it*. A `#` comment
 * became an H1 at 30px, brackets became a link with its destination hidden,
 * underscores in an identifier became emphasis, and a line of dashes became a
 * horizontal rule. The file was not merely unstyled, it was actively rewritten on
 * screen.
 *
 * **The highlighting inventory stays deliberate.** The accepted comparison adds
 * TypeScript and HTML to Rust while keeping §5.2's shared three-category palette.
 * Anything outside that inventory remains honest monospace rather than receiving
 * a grammar chosen by guesswork.
 */
export interface DocumentLanguage {
  /**
   * True only for markdown, and it gates every markdown-specific extension.
   *
   * A boolean rather than a name comparison at each call site: "should this
   * document continue a list on Enter" and "should this document decorate a
   * heading hash" are the same question asked twice, and the last thing this
   * codebase needs is a second way to ask it.
   */
  markdown: boolean;
  /**
   * The grammar for a *code* document, or null when it stays honest monospace.
   *
   * Always null for markdown: `markdownNotation()` already installs the markdown
   * parser along with the decorations that depend on it, and splitting those two
   * apart so this field could hold one of them would give the surface two places
   * that decide how a markdown file is parsed.
   */
  support: Extension | null;
}

/**
 * What a surface parses as when the caller does not say.
 *
 * Markdown, because this is `zd md` and a document with no stated kind is the one
 * the product is about. Every caller that knows better passes what it knows.
 */
export const MARKDOWN_DOCUMENT: DocumentLanguage = { markdown: true, support: null };

/**
 * Extensions that mean markdown. Everything else is a file we are being polite to.
 *
 * `.mdx` is deliberately absent: it is JSX in markdown's clothing, and parsing it
 * as CommonMark would be the same defect this file exists to fix.
 */
const MARKDOWN = new Set(["md", "markdown"]);

/** The lowercase extension of `path`, or "" when it has none. */
function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  // A leading dot is a whole filename — `.gitignore` has no extension, it *is*
  // its name, and treating "gitignore" as a type would be inventing one.
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * How to parse the file at `path`.
 *
 * A path with no extension is code, not markdown. `LICENSE` and `Makefile` are
 * not CommonMark, and defaulting to markdown is precisely the reported bug — the
 * safe direction here is to do *less* to a file we cannot identify.
 */
export function languageFor(path: string): DocumentLanguage {
  const extension = extensionOf(path);

  if (MARKDOWN.has(extension)) return { markdown: true, support: null };

  /*
   * §5.2's inventory, reached by file extension instead of by a fence's language
   * tag — the same list, the same three colour categories, and the same rule for
   * anything outside it. A fenced TypeScript block and a `.ts` file must not be
   * coloured by two different opinions, so they read the one description.
   */
  const known = codeLanguages.find(
    (language) => language.name === extension || language.alias.includes(extension),
  );
  if (!known?.support) return { markdown: false, support: null };

  return { markdown: false, support: [known.support, codeHighlighting()] };
}
