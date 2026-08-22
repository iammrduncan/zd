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

export function codeHighlighting(): Extension {
  return syntaxHighlighting(CATEGORIES);
}
