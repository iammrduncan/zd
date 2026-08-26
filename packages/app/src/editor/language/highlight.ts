import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

/**
 * Syntax roles are semantic classes so the shared theme remains the only colour
 * owner. Languages may grow without growing a parallel palette.
 */
const CATEGORIES = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    class: "md-syn-comment",
  },
  {
    tag: [
      tags.string,
      tags.special(tags.string),
      tags.character,
      tags.docString,
      tags.attributeValue,
      tags.regexp,
      tags.escape,
      tags.color,
      tags.url,
    ],
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
      tags.self,
      tags.null,
    ],
    class: "md-syn-keyword",
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName, tags.namespace, tags.typeOperator],
    class: "md-syn-type",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: "md-syn-function",
  },
  {
    tag: [tags.number, tags.bool],
    class: "md-syn-number",
  },
  {
    tag: [tags.operator, tags.punctuation],
    class: "md-syn-punctuation",
  },
]);

export function codeHighlighting(): Extension {
  return syntaxHighlighting(CATEGORIES);
}

const MARKDOWN_SOURCE = HighlightStyle.define([
  {
    tag: [
      tags.heading,
      tags.heading1,
      tags.heading2,
      tags.heading3,
      tags.heading4,
      tags.heading5,
      tags.heading6,
    ],
    class: "md-syn-keyword",
  },
  { tag: [tags.link, tags.url], class: "md-syn-string" },
  { tag: [tags.emphasis, tags.strong, tags.strikethrough], class: "md-syn-type" },
  { tag: tags.monospace, class: "md-syn-function" },
  {
    tag: [tags.contentSeparator, tags.list, tags.quote, tags.meta],
    class: "md-syn-punctuation",
  },
]);

/** Extra source roles used only when Markdown is presented as a code plane. */
export function markdownSourceHighlighting(): Extension {
  return syntaxHighlighting(MARKDOWN_SOURCE);
}
