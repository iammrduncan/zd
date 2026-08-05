import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

/**
 * Syntax highlighting inside fenced code, on the editing surface.
 *
 * Finding F08 asks for "language-appropriate syntax highlighting when a language
 * is declared", and DESIGN.md §5.2 bounds it: Rust, the JavaScript/TypeScript
 * family, and HTML; three shared categories; "an absent or unknown language
 * remains honest monospace text rather than receiving misleading language
 * colour"; and colour "through the active DesignSystem… never with
 * miniapp-local colours".
 *
 * CodeMirror needs incremental decorations over a live buffer. The classifier
 * emits semantic class names; the stylesheet is the only place a colour is named.
 */

/**
 * §5.2's closed inventory. Adding a language is a deliberate edit here.
 *
 * `support` rather than `load`, so the grammar is present before the first paint.
 * The async `load` form is for editors that fetch grammars on demand, and using
 * it here meant a fence rendered as plain text and then flashed into colour a
 * tick later — §2: "Nothing flashes, jumps, or reflows while you work." The
 * inventory is intentionally small and bundled, so there is nothing to defer.
 */
const RUST = LanguageDescription.of({
  name: "rust",
  alias: ["rs"],
  support: rust(),
});

const JAVASCRIPT = LanguageDescription.of({
  name: "javascript",
  alias: ["js", "mjs", "cjs"],
  support: javascript(),
});

const JSX = LanguageDescription.of({
  name: "jsx",
  support: javascript({ jsx: true }),
});

const TYPESCRIPT = LanguageDescription.of({
  name: "typescript",
  alias: ["ts"],
  support: javascript({ typescript: true }),
});

const TSX = LanguageDescription.of({
  name: "tsx",
  support: javascript({ jsx: true, typescript: true }),
});

const HTML = LanguageDescription.of({
  name: "html",
  alias: ["htm"],
  support: html(),
});

export const codeLanguages = [RUST, JAVASCRIPT, JSX, TYPESCRIPT, TSX, HTML];

/**
 * Lezer highlight tags mapped onto the reader's three category classes.
 *
 * Classes rather than colours, for the reason above. `HighlightStyle` normally
 * takes `{ color: "#..." }`; giving it a class instead is what keeps every real
 * colour in tokens.css where the design system owns it, and is the direct
 * equivalent of the reader's sentinel-colour trick.
 *
 * The tag lists are deliberately broad within each category and empty outside it.
 * Type and tag names join the keyword role: the approved comparison used one
 * structural colour for all three, and preserving that three-role palette avoids
 * turning a wider grammar inventory into a wider design system.
 */
const CATEGORIES = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    class: "md-syn-comment",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.character, tags.docString],
    class: "md-syn-string",
  },
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.typeName,
      tags.className,
      tags.tagName,
      tags.self,
      tags.null,
      tags.bool,
    ],
    class: "md-syn-keyword",
  },
]);

/**
 * Colour the three categories inside a declared fence.
 *
 * `syntaxHighlighting` walks whatever tree the parser produced, so this only ever
 * colours a fence whose language actually loaded — an unknown hint leaves the
 * fence as one plain text node, and plain text carries no tags to match. The
 * "unsupported languages stay honest" rule therefore holds by construction rather
 * than by a check that could be forgotten.
 */
export function codeHighlighting(): Extension {
  return syntaxHighlighting(CATEGORIES);
}
