import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { continueParsedMarkdown } from "../../../src/editor/markdown/continuation";

describe("Markdown structure continuation", () => {
  it("continues a quote before the background parser reaches a newly focused line", () => {
    const source = `${"plain\n".repeat(1_000)}> quote`;
    const state = EditorState.create({
      doc: source,
      selection: { anchor: source.length },
      extensions: [markdown({ addKeymap: false })],
    });
    let next = state;

    const handled = continueParsedMarkdown({
      state,
      dispatch: (transaction) => {
        next = transaction.state;
      },
    });

    expect(handled).toBe(true);
    expect(next.doc.sliceString(next.doc.length - 16)).toBe("plain\n> quote\n> ");
  });
});
