import "@/design/index.css";
import "../styles/md.css";
import "../styles/content.css";

import { createEditor, languageFor } from "@/editor";
import { setGranularity } from "./focus";
import { typewriterY } from "./typewriter";
import { lineCount, showStatus, wordCount } from "../status";
import { setWordWrap, wordWrap } from "@/workbench/preferences";
import { registerReference } from "@/workbench/reference";
import { attachShortcuts, commands, register } from "@/workbench/shortcuts";
import { anchorY, type FocusGranularity } from "../focus";

/*
 * A document with a caret in it, for looking at and for testing against.
 *
 * `npm run dev` has no filesystem, so a dev page is the only way to put a real
 * document on screen in the browser shell.
 * Dev-only — Vite ships index.html alone.
 */

const SAMPLE = `# Typing in the document

Everything that makes reading good stays true while you type. This is not a
second mode: it is the same surface, and this is what it does when a caret is
in it.

A paragraph here should be indistinguishable from a paragraph in the reader —
same family, same size, same line height, same colour, same measure. If it is
not, the claim above is decoration rather than design.

## Notation

Notation is visible but lives outside the prose column, so the reading column
stays a clean straight line. Unordered items show their literal marker:

- the source is what is on screen
- a typeset bullet would be a second version of the truth
- an item with a nested list beneath it:
  - the nested level advances exactly fourteen pixels, and a nested item long
    enough to wrap comes back to its own text origin rather than its parent's
  - another nested item
- an item long enough to wrap has to come back to its own text origin rather
  than to the left margin, which is the whole of finding F12

Ordered markers cross into three digits here on purpose: the column fits two,
so a wider marker has to overhang it rather than push its own prose out of line.

99. a double-digit step
100. a three-digit step, whose text starts exactly where the one above does

### Every level has to read as its own level

Sizes sit close together on purpose, so the space above each level is what
carries the hierarchy rather than the type growing louder.

#### Four steps down

#### and a second one, to show two of the same level in sequence

##### Five steps down

###### Six steps down, the same size as prose and still a heading

## A hash is not always a heading

The line below is a shell comment inside a fence. A regex would typeset it as an
H1; the parser knows better, which is the entire reason there is a parser here.

\`\`\`sh
# install and run
npm run dev
\`\`\`

A declared Rust block colours keywords, strings, and comments, and nothing else —
DESIGN.md 5.2 fixes that inventory at exactly three categories:

\`\`\`rust
// Read a document and hand it back as prose.
fn read(path: &str) -> Result<String, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
    Ok(raw)
}
\`\`\`

> A blockquote continues on Enter and leaves on a second Enter, the way a chat
> composer does.

Underscores inside an identifier stay literal: HEADING_SENTINEL_01 is a name,
not emphasis — unlike _this run_, **this stronger one**, and **strong _and italic_**, which are.

## Inline code

A paragraph that mentions \`renderMarkdown\`, then \`--type-inline-code-size\`, and
then \`document.fonts.ready\` runs long enough to wrap, so the line rhythm has to
survive a \`code\` run appearing on more than one line.

### Calling \`renderMarkdown\` from a heading

A heading that carries a code run keeps its own size and baseline, so the run
never drops to body inline-code size in the middle of a heading.

## Tables

| Construct | Resting state |
| --- | --- |
| Blockquote | Indentation and one quiet hairline |
| Rule | The same hairline, as content |
| Table | Hairlines only, no frame or striping |
| \`--hairline\` | A cell can hold inline code |
| [a link](https://example.com/cell) | and a link, rendered as one |

A setext heading underlined
===========================

Its text takes the same typography an ATX heading of the same level does.

A second level, underlined too
------------------------------

The underline is notation on a row of its own, so it is not drawn.

An indented block is code too, four spaces instead of a fence:

    zd md README.md
      --focus section
    opening README.md

## Rules

A horizontal rule is the one place a line is the content rather than decoration.

---

The paragraph after it starts a new stretch of the document.

## Images

A remote image is never fetched: ![a diagram that will not load](https://example.com/diagram.png)
sits in the line as quiet text instead.

A local one renders: ![a dot](data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=)

## Links

A link shows [its label](https://example.com/spec) and not its destination, and a
[relative one](../vision.md) reads exactly the same way. A bare
<https://example.com/autolink> has no label to show, so it shows its own address.
`;

/*
 * A file that is not markdown, for §6.2 — reachable at `/dev/editor.html?doc=code`.
 *
 * Every line here is a markdown trap on purpose, because the reported harm was
 * never "a `.ts` file went uncoloured" — it was markdown *rules being applied to
 * source*. Left as markdown this sample grows a 30px H1, a link whose destination
 * is hidden, an italic run in the middle of an identifier, a horizontal rule, and
 * a table. Every one of those rewrites the file on screen.
 */
const CODE_SAMPLE = `import { readFile } from "node:fs/promises";

const HEADING_SENTINEL_01 = "underscores here are a name, not emphasis";

/*
 * A comment that would be read as markdown if anything were reading it as markdown.
 *
 * ## This is not a heading
 *
 * Neither is [this a link](https://example.com/not-a-link), and the row of
 * dashes below is not a horizontal rule.
 */

// ---

export async function load(path: string): Promise<string> {
  const shell = \`# install and run
npm run dev\`;
  const row = "| Construct | Resting state |";
  return [await readFile(path, "utf8"), shell, row].join("\\n");
}
`;

/** A deterministic multi-megabyte text fixture without a multi-megabyte repository blob. */
function largeSample(): string {
  const lines = Array.from({ length: 48_000 }, (_, index) => {
    const id = String(index).padStart(5, "0");
    return `record_${id} alpha beta gamma delta epsilon zeta eta theta value=${id};`;
  });
  lines[100] = "LARGE_FIND_TARGET first bounded search result";
  lines[24_000] = "LARGE_FIND_TARGET second bounded search result";
  lines[47_900] = "LARGE_FIND_TARGET third bounded search result";
  lines[36_000] = `LONG_LINE_START ${"x".repeat(256 * 1024)} LONG_LINE_END`;
  return lines.join("\n");
}

const host = document.getElementById("zd");
if (!host) throw new Error("dev/editor.html is missing the #zd host element");

/*
 * Which document this page is showing. `?doc=code` opens the sample above as
 * `sample.ts`; anything else is the markdown sample, which is what every existing
 * spec navigates to.
 *
 * A query parameter rather than a second dev page, because the point of §6.2 is
 * that a non-markdown file opens *on the same surface* — a separate page would
 * quietly let the two diverge, which is the failure mode this repo keeps finding.
 */
const documentKind = new URLSearchParams(window.location.search).get("doc");
const source =
  documentKind === "code" ? CODE_SAMPLE : documentKind === "large" ? largeSample() : SAMPLE;
const path =
  documentKind === "code" ? "sample.ts" : documentKind === "large" ? "sample.log" : "sample.md";

// Two elements, two jobs: the surface scrolls and carries the insets; the column
// holds the measure. See styles/md.css.
const surface = document.createElement("main");
surface.className = "md-surface";

const column = document.createElement("div");
column.className = "md-editor";
surface.append(column);
host.append(surface);

/*
 * The dev page has no filesystem — platform.ts is deliberate about that — so a
 * save here records what *would* have been written rather than pretending to
 * write it. That is enough to check everything on this side of the boundary; the
 * atomic write on the other side is tested in packages/tauri/src/fs.rs.
 */
const saves: string[] = [];
const editor = createEditor(column, source, {
  onSave: (text) => {
    saves.push(text);
  },
  // The same call the mini app makes, from the same function — a fixture that
  // hand-built a language object would be testing its own copy of the rule.
  language: languageFor(path),
  // The same read the mini app makes, so the dev page persists what the app does.
  wrap: wordWrap(),
});

/*
 * The document's commands and the one listener that reaches them (§7.1).
 *
 * `boot` does this in the real app; a dev page mounts without it, so it wires the
 * same two pieces itself. Registering here rather than inside `createEditor` is
 * the point of the registry — the editor performs commands and never owns a
 * chord.
 */
register({
  id: "document.save",
  chord: { key: "s", mod: true },
  description: "Save the document",
  run: () => {
    editor.save();
    return true;
  },
});

register({
  id: "document.status",
  chord: { key: "i", mod: true },
  description: "Show the buffer's counts, read time, and unsaved state",
  run: () => {
    const text = editor.text();
    showStatus(host, {
      words: wordCount(text),
      characters: text.length,
      lines: lineCount(text),
      dirty: editor.isDirty(),
    });
    return true;
  },
});

register({
  id: "document.raw",
  /*
   * Provisional, like the status strip's `Mod-i` was before the registry existed.
   * Neither vision §6.1 nor DESIGN.md §7.4 names a chord for raw mode — both
   * describe the toggle and stop. `Mod-e` is unclaimed by every binding the design
   * does name, takes one modifier, and avoids the reload chords a webview cares
   * about. It moves the moment the Shortcut Reference gets reviewed.
   */
  chord: { key: "e", mod: true },
  description: "Raw mode: show the literal markdown",
  run: () => {
    editor.toggleRaw();
    return true;
  },
});

register({
  id: "file.find",
  chord: { key: "f", mod: true },
  description: "Find in the current file",
  available: () => true,
  run: () => {
    editor.find.open();
    return true;
  },
});

register({
  id: "document.dropCaret",
  // The product routes this through `workbench.escape`; the standalone fixture
  // keeps one direct owner because it has no root workbench attachment.
  chord: { key: "Escape" },
  description: "Dismiss Find, or drop the caret and follow the reading anchor again",
  available: () => editor.find.isOpen() || editor.hasCaret(),
  run: () => editor.find.close() || editor.dropCaret(),
});

register({
  id: "document.wrap",
  /*
   * `Mod-Alt-z` — the chord the first prototype used, and the one VS Code uses for
   * the same command, so it is looked up rather than invented like `Mod-e` was.
   *
   * Alt chords match the physical key in the registry, and they have to: Option is a
   * compose key, so macOS delivers this as `key: "\u03a9"`. F03 records the first
   * prototype hitting exactly that —
   * `command_option_z_consumes_the_composed_text_event_before_the_editor_sees_it`.
   */
  chord: { key: "z", mod: true, alt: true },
  description: "Word wrap: stop lines wrapping, or start again",
  run: () => {
    setWordWrap(editor.toggleWrap());
    return true;
  },
});

register({
  id: "document.typewriter",
  /*
   * Provisional, like `Mod-e` and `Mod-i` — neither vision §6.1 nor DESIGN.md §7.6
   * names a chord for this one. Paired with word wrap's `Mod-Alt-z` above on
   * purpose: both change how the document sits on the surface rather than what it
   * says, and Alt keeps them clear of the single-modifier chords a webview claims.
   */
  chord: { key: "t", mod: true, alt: true },
  description: "Typewriter mode: hold the caret's line in place",
  // §7.6: "Typewriter Mode needs a caret, so it is available whenever there is one."
  available: () => editor.hasCaret(),
  run: () => {
    editor.toggleTypewriter();
    return true;
  },
});

/*
 * The focus-block jump. See the note beside the same pair in miniapps/md/index.ts —
 * that copy is the product's and this one is the fixture's, and the fact that there
 * are two is filed in docs/planning/objectives/agent-findings.md rather than fixed here.
 */
register({
  id: "document.jumpNext",
  chord: { key: "ArrowDown", alt: true },
  description: "Jump to the next focus block",
  // §4.1 makes placing a caret a one-way door, so a motion key does not cross it.
  available: () => editor.hasCaret(),
  run: () => editor.jumpBlock("next"),
});

register({
  id: "document.jumpPrevious",
  chord: { key: "ArrowUp", alt: true },
  description: "Jump to the previous focus block",
  available: () => editor.hasCaret(),
  run: () => editor.jumpBlock("previous"),
});

registerReference(host);
attachShortcuts();

/*
 * Focus granularity is a real user setting (§7) whose Settings row arrives in
 * session 4.4. Until then this is how it is reached: a test that poked
 * `dataset.granularity`
 * directly would be exercising its own DOM write rather than the app's.
 */
declare global {
  interface Window {
    zdEditor?: {
      setGranularity: (value: FocusGranularity) => void;
      isDirty: () => boolean;
      isRaw: () => boolean;
      /** The buffer as it stands — what a save would write. */
      text: () => string;
      /** Where the caret is, so a test can ask what a key press actually did. */
      selection: () => { from: number; to: number; head: number; line: number };
      /** Put the caret somewhere known, so key presses are what is measured. */
      setCaret: (at: number) => void;
      /** Has a caret been placed? What Escape acts on. */
      hasCaret: () => boolean;
      /** Viewport y of the middle of the caret's row, from the view that knows. */
      caretY: () => number | null;
      /** Is the caret's line pinned to the midpoint? */
      isTypewriter: () => boolean;
      /** Are lines wrapping? What the word wrap command toggles. */
      isWrapped: () => boolean;
      /** Viewport y of the reading anchor, from the module that owns the ratio. */
      anchorY: () => number;
      /** Viewport y of the line Typewriter Mode pins to, from the module that owns it. */
      typewriterY: () => number;
      /** Browser-relative time when the large CodeMirror state was usable. */
      readyAt: number;
      /** UTF-8 fixture size, recorded without teaching the editor about bytes. */
      sourceBytes: number;
      saves: string[];
    };
    /**
     * A way to put a command into the registry from a test.
     *
     * Same reason `zdEditor.setGranularity` exists: the alternative is a test
     * that hand-builds a Reference row, which measures its own DOM write rather
     * than the app's rendering. Availability in particular has no other honest
     * trigger — every real command on this page happens to be available, and
     * contriving one that is not would be less clear than asking for one.
     *
     * Dev-only. This file is not in the product bundle.
     */
    zdTest?: { register: typeof register; commands: typeof commands };
  }
}

window.zdTest = { register, commands };

window.zdEditor = {
  setGranularity: (value) => setGranularity(column, value),
  isDirty: () => editor.isDirty(),
  isRaw: () => editor.isRaw(),
  text: () => editor.text(),
  selection: () => editor.selection(),
  setCaret: (at) => editor.setCaret(at),
  hasCaret: () => editor.hasCaret(),
  caretY: () => editor.caretY(),
  isTypewriter: () => editor.isTypewriter(),
  isWrapped: () => editor.isWrapped(),
  /*
   * A spec that wants to know where the anchor is must ask the module that owns
   * the ratio. Recomputing `height / 3` in a test is a second copy of a design
   * decision, and the last time two copies existed they agreed with each other
   * and not with the product.
   */
  anchorY: () => {
    const surface = document.querySelector(".md-surface");
    return surface ? anchorY(surface) : 0;
  },
  typewriterY: () => {
    const surface = document.querySelector(".md-surface");
    return surface ? typewriterY(surface) : 0;
  },
  readyAt: performance.now(),
  sourceBytes: new TextEncoder().encode(source).byteLength,
  saves,
};
