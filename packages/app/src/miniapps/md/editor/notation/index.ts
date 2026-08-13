import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

import { renderInlineMarkdown } from "../../markdown";
import { codeHighlighting, codeLanguages } from "../highlight";
import { isRaw, rawModeChanged } from "../raw";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Markdown notation on the editing surface.
 *
 * Vision §6.1: "Source typography does not break prose rhythm. A markdown file
 * should not be meaningfully harder to read because it also happens to be
 * editable." So a line is given the reading role and geometry its block earns,
 * and keeps the characters that made it one — the source stays on screen, it
 * just stops being the only thing the line looks like. Where those characters
 * sit is §7.4's answer: block notation hangs in the gutter, outside the prose
 * column, so the reading edge stays straight whatever notation a line carries.
 *
 * This adds a class to a line and nothing else. Every appearance decision is in
 * styles/editor.css, because it is type, space, and colour, and those in this
 * project are CSS reading suite tokens.
 *
 * Notation is only notation when the parser says so. Inside a fence a `#` is a
 * comment and a `-` is a flag in somebody's shell script — and the agent logs
 * this app exists to read are mostly fences. That single case is why the block
 * structure is parsed rather than matched line by line with a regular
 * expression, and it is the reason this file has a syntax tree in it at all.
 */

const ATX_HEADING = /^ATXHeading([1-6])$/;

/** `text` over `===` (level 1) or `---` (level 2). */
const SETEXT_HEADING = /^SetextHeading([12])$/;

const LINE = new Map<string, Decoration>(
  [
    "md-line-h1",
    "md-line-h2",
    "md-line-h3",
    "md-line-h4",
    "md-line-h5",
    "md-line-h6",
    "md-line-quote",
    "md-line-code",
    "md-line-rule",
  ].map((name) => [name, Decoration.line({ class: name })]),
);

/**
 * The run of characters standing between the start of a list line and the start
 * of its text: `- `, `1. `, or on a continuation, the indent the author typed to
 * line it up.
 *
 * Finding F12 is that a wrapped item must come back to its own text origin, and
 * the reader gets that from a marker column outside the content box. There is no
 * such column here — §6.1 keeps the marker as literal text — so this box *is*
 * the column: it is given the column's width rather than assumed to have it,
 * which is precisely what `- ` does not.
 */
const MARKER = Decoration.mark({ class: "md-line-marker" });

/**
 * Block notation that hangs outside the prose column — today a heading's `#`.
 *
 * Separate from `MARKER` above because the two solve opposite problems. A list
 * marker sits *inside* the measure and indents its own item, which is list
 * typography (§5.2). A heading's hash sits *outside* it and indents nothing:
 * §7.4 wants heading text on exactly the edge a paragraph starts on, so the
 * reading column is one straight line whatever notation a line happens to carry.
 */
const NOTATION = Decoration.mark({ class: "md-notation-mark" });

/**
 * A nested item's leading indent, and a continuation's.
 *
 * Both are literal source whitespace, and the width of literal whitespace is
 * whatever the prose face makes it — which is not §5.2's "each nested level
 * advances exactly 14 px". So the run is boxed and the box is given the width
 * the spec asks for, exactly as the marker column is. The characters are still
 * there and still selectable; they have simply stopped deciding the geometry.
 */
const INDENT = Decoration.mark({ class: "md-line-indent" });

/**
 * The whole leading run of a source continuation — indent, and nothing else,
 * because a continuation has no marker.
 *
 * Separate from `INDENT` because it spans a different distance. A nested item's
 * indent covers only the nesting steps and hands over to the marker column; a
 * continuation has no marker to hand over to, so its box is the nesting steps
 * *and* the column, which is what puts its text back on the item's origin.
 */
const CONTINUATION = Decoration.mark({ class: "md-line-cont-fill" });

/**
 * A blockquote's `>`.
 *
 * Its own box rather than the heading gutter, decided 2026-07-29: a quote
 * already owns an indent and a hairline that say where it begins, and notation
 * pushed outside that hairline stops belonging to the block it marks. §7.4's
 * requirement is that the marker hang to the left of the *text* edge, and the
 * quote's own indent is left of its own text edge. See DESIGN.md §7.4.
 */
const QUOTE = Decoration.mark({ class: "md-quote-mark" });

/**
 * A link's label — the only part of `[label](url)` that stays on screen.
 *
 * Decided 2026-07-29: links are in vision §6.1's *renders* list, "links show
 * their label with no brackets or destination", and DESIGN.md §7.3 says the same
 * for reading. Raw mode is the way back to the source; the caret is not — §7.4:
 * notation is never revealed by caret proximity, in either state.
 */
const LINK_LABEL = Decoration.mark({ class: "md-link-label" });

/**
 * Notation taken off the screen entirely.
 *
 * A zero-width replacement rather than `display: none`, because CodeMirror has to
 * know the range is not there to map coordinates and caret motion through it.
 * Hiding it in CSS instead would leave the editor believing the characters
 * occupy space they do not, and every click past a link would land in the wrong
 * place.
 *
 * The document is untouched. What is drawn changes; what a save would write does
 * not — which matters more here than anywhere else, because §6.3 writes exactly
 * what is on screen.
 */
const HIDDEN = Decoration.replace({});

/**
 * A single-backtick code run, backticks included.
 *
 * Unlike a link, nothing is hidden: the 2026-07-29 decision puts single backticks
 * in vision §6.1's *stays literal* list, so what changes is the face and the
 * plane, not what is on screen.
 *
 * The whole node rather than only its content, so the plane covers the run as one
 * thing. In the reader there are no backticks in the DOM to include or exclude;
 * here they are part of the run and reading as one unit is what makes it look like
 * the reader's.
 */
const INLINE_CODE = Decoration.mark({ class: "md-inline-code" });

/** The backticks themselves — notation, so quiet, per §5.2's marker rule. */
const CODE_MARK = Decoration.mark({ class: "md-code-mark" });

/**
 * `_emphasis_` and `**strong**`, delimiters included.
 *
 * The same shape as inline code above, and for the same reason: §6.1 puts emphasis
 * delimiters in the *stays literal* list, so what changes is the face, not what is
 * on screen. Marking the whole node means the italic covers its own delimiters and
 * the run reads as one thing; `EMPHASIS_MARK` then quiets their colour on top,
 * exactly as `CODE_MARK` does for backticks.
 *
 * Two decorations rather than one with a modifier, because a nested
 * `**strong _and italic_**` has to be able to carry both.
 */
const EMPHASIS = Decoration.mark({ class: "md-emphasis" });
const STRONG = Decoration.mark({ class: "md-strong" });

/** The `_` or `**` themselves — notation, so quiet, per §5.2's marker rule. */
const EMPHASIS_MARK = Decoration.mark({ class: "md-emphasis-mark" });

/**
 * An image, drawn instead of written.
 *
 * Shares `![alt](url)`'s shape with a link and needs the opposite treatment: a link
 * shows its label, an image shows the picture the label describes.
 *
 * Built through the surface's shared `renderInlineMarkdown`, which is not a shortcut —
 * it is the only way to keep DESIGN.md §7.3's guarantee: "Remote images are never
 * fetched." That function parses inside an inert `<template>`, where the browser
 * does not load images, and swaps every remote `src` for a quiet placeholder before
 * anything reaches a live node. Constructing an `<img>` here directly would issue
 * the request in the same statement that created it, and a document would be able to
 * announce that it had been opened.
 */
class ImageWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "md-image";
    host.append(renderInlineMarkdown(this.source));
    return host;
  }

  /** Not editable content. The source is reachable through raw mode (§7.4). */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * The line decorations that carry a nesting depth.
 *
 * `--nest` rather than a class per level: depth is unbounded, and CSS can do
 * arithmetic on a number but not on a class name. It also keeps every distance
 * in the stylesheet — this file says how deep the line is, editor.css says what
 * that is worth in pixels.
 */
const NESTED = new Map<string, Decoration>();

function listLine(name: "md-line-item" | "md-line-item-cont", depth: number): Decoration {
  const key = `${name}:${depth}`;
  let deco = NESTED.get(key);
  if (!deco) {
    deco = Decoration.line(
      depth ? { class: name, attributes: { style: `--nest:${depth}` } } : { class: name },
    );
    NESTED.set(key, deco);
  }
  return deco;
}

/**
 * How many list levels enclose `node`, counting from zero at the outermost.
 *
 * Called with a marker's parent or with the item itself, so the item whose depth
 * is being asked about is always inside the walk.
 */
function listDepth(node: SyntaxNode | null): number {
  let levels = 0;
  for (let cursor = node; cursor; cursor = cursor.parent) {
    if (cursor.name === "ListItem") levels++;
  }
  return Math.max(levels - 1, 0);
}

/** Every line start the range touches, without spilling into the line after it. */
function lineStarts(state: EditorState, from: number, to: number): number[] {
  const first = state.doc.lineAt(from).number;
  // A block's end often sits on the newline that terminates it. Stepping back
  // one character keeps that from claiming the blank line below as its own.
  const last = state.doc.lineAt(Math.max(from, to - 1)).number;

  const starts: number[] = [];
  for (let line = first; line <= last; line++) starts.push(state.doc.line(line).from);
  return starts;
}

/** Where the text starts on `line`, counting from the document position `at`. */
function textStart(line: { from: number; text: string }, at: number): number {
  let offset = at - line.from;
  while (offset < line.text.length && /[ \t]/.test(line.text[offset]!)) offset++;
  return line.from + offset;
}

/**
 * What the notation plugin produces: what to draw, and where the caret may not go.
 *
 * Two sets from one pass, because they come from the same decisions. Every range
 * this hides or replaces is a range with no position on screen, and a caret that
 * can be inside one is a caret that appears not to move when a key is pressed —
 * which is what "arrow key navigation is buggy" turned out to mean.
 *
 * Deliberately *not* the whole decoration set. Marks and line decorations must stay
 * out of it: an atomic range covering an inline-code span or a heading would make
 * the caret skip over text that is perfectly visible and perfectly editable, which
 * would be a worse bug than the one being fixed.
 */
interface Notation {
  decorations: DecorationSet;
  /** Hidden and replaced ranges — the caret steps over these as units. */
  atomic: DecorationSet;
}

function notationLines(view: EditorView): Notation {
  const state = view.state;
  const tree = syntaxTree(state);

  // Line decorations are collected as the decoration itself rather than as a
  // name, because a list line's depth is part of which decoration it gets and
  // there is no name that carries a number.
  const marked: { from: number; key: string; deco: Decoration }[] = [];
  const mark = (from: number, name: string) =>
    marked.push({ from, key: `${from}:${name}`, deco: LINE.get(name)! });
  const markList = (from: number, name: "md-line-item" | "md-line-item-cont", depth: number) =>
    marked.push({ from, key: `${from}:${name}:${depth}`, deco: listLine(name, depth) });

  const markers: { from: number; to: number }[] = [];
  const notationMarks: { from: number; to: number }[] = [];
  const indents: { from: number; to: number }[] = [];
  const continuations: { from: number; to: number }[] = [];
  const quoteMarks: { from: number; to: number }[] = [];
  const linkLabels: { from: number; to: number }[] = [];
  const hidden: { from: number; to: number }[] = [];
  const inlineCode: { from: number; to: number }[] = [];
  const codeMarks: { from: number; to: number }[] = [];
  const emphasis: { from: number; to: number }[] = [];
  const strong: { from: number; to: number }[] = [];
  const emphasisMarks: { from: number; to: number }[] = [];
  const images: { from: number; to: number; source: string }[] = [];

  // The lines carrying a list marker, so an item's source continuations can be
  // told apart from them below. A nested item's own marker line lands here too,
  // which is what keeps it an item rather than a continuation of its parent.
  const itemLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const heading = ATX_HEADING.exec(node.name);
        if (heading) {
          mark(state.doc.lineAt(node.from).from, `md-line-h${heading[1]}`);
          return;
        }

        /*
         * A setext heading — `text` over `===` or `---`.
         *
         * Only the *first* line takes the heading role. The node spans both rows, so
         * marking every line it covers would give the underline a 30px face as well,
         * which is the opposite of the point. The underline's row is removed
         * separately, in notation/rows.ts.
         */
        const setext = SETEXT_HEADING.exec(node.name);
        if (setext) {
          mark(state.doc.lineAt(node.from).from, `md-line-h${setext[1]}`);
          return;
        }

        // The `#` run and the space after it, together — the space belongs to the
        // box for the same reason it does on a list marker: left outside, it
        // would push the heading's text one space off the edge every paragraph
        // starts on, which is the straight line this whole task is about.
        //
        // Only an ATX heading's. `HeaderMark` is also the `===` under a setext
        // heading, where there is no text after it on the line and hanging the
        // whole underline into the gutter would empty the row. Setext has its
        // own task.
        if (node.name === "HeaderMark") {
          if (!ATX_HEADING.test(node.node.parent?.name ?? "")) return;
          const line = state.doc.lineAt(node.from);
          notationMarks.push({ from: node.from, to: textStart(line, node.to) });
          return;
        }

        if (node.name === "ListMark") {
          const line = state.doc.lineAt(node.from);
          const depth = listDepth(node.node.parent);
          itemLines.add(line.from);
          markList(line.from, "md-line-item", depth);
          // The marker and the space after it, together.
          markers.push({ from: node.from, to: textStart(line, node.to) });
          // The nesting steps, boxed separately from the marker so each stays
          // one thing: the indent is worth `depth` levels, the marker is worth
          // the column, and neither has to know the other's width.
          if (node.from > line.from) indents.push({ from: line.from, to: node.from });
          return;
        }

        /*
         * `[label](destination)` → `label`.
         *
         * Driven off the `LinkMark` children rather than by counting characters:
         * a label can contain its own inline markup, and a destination can carry
         * a title string, so the only reliable answer to "where does the label
         * end" is the one the parser already has.
         *
         * `Image` is deliberately not handled here even though it shares this
         * shape — `![alt](url)` should show the picture, not the alt text, and
         * that is its own task. Half-doing it here would leave images looking
         * like links, which is worse than leaving them literal.
         */
        /*
         * `\`code\`` keeps its backticks and takes the code role.
         *
         * The run is marked whole and each `CodeMark` child marked again on top,
         * so the plane spans the backticks while the backticks themselves stay
         * muted. Two overlapping marks rather than three ranges, because the
         * content between them can contain nothing else — inline code has no
         * inner markup by definition.
         */
        if (node.name === "InlineCode") {
          inlineCode.push({ from: node.from, to: node.to });
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            if (child.name === "CodeMark") codeMarks.push({ from: child.from, to: child.to });
          }
          return;
        }

        /*
         * `_emphasis_` and `**strong**` take the §5.2 emphasis role.
         *
         * Not returning, unlike the branches above: emphasis nests, and
         * `**strong _and italic_**` needs the walk to carry on into the inner run.
         *
         * Nothing here decides *what* is emphasis — the parser does, and it is
         * already right. Finding F06 is that `HEADING_SENTINEL_01` must not be
         * italicised, and CommonMark's intraword rule means lezer never builds an
         * `Emphasis` node for it, so an identifier simply never reaches this line.
         * That is worth stating because the guarantee is the parser's, not a test
         * this file performs.
         */
        if (node.name === "Emphasis" || node.name === "StrongEmphasis") {
          const runs = node.name === "Emphasis" ? emphasis : strong;
          runs.push({ from: node.from, to: node.to });
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            if (child.name === "EmphasisMark") {
              emphasisMarks.push({ from: child.from, to: child.to });
            }
          }
        }

        /*
         * `![alt](url)` → the picture.
         *
         * Before the `Link` branch on purpose: lezer gives an `Image` the same
         * `LinkMark` children, so the link rule would otherwise reduce an image to
         * its alt text — which looks like a working link to a place that is not
         * there.
         */
        if (node.name === "Image") {
          if (!isRaw(state)) {
            images.push({
              from: node.from,
              to: node.to,
              source: state.doc.sliceString(node.from, node.to),
            });
          }
          return;
        }

        /*
         * `<https://…>` → the address, without its angle brackets.
         *
         * Its own branch because lezer parses it as `Autolink`, not `Link` — which
         * is why the link work missed it entirely. The shape underneath is the same
         * (`LinkMark`, `URL`, `LinkMark`), but the meaning differs: there is no
         * label, so the URL *is* the label and hiding it would leave nothing. Only
         * the delimiters go.
         */
        if (node.name === "Autolink") {
          const marks: { from: number; to: number }[] = [];
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            if (child.name === "LinkMark") marks.push({ from: child.from, to: child.to });
          }
          if (marks.length < 2) return;

          const open = marks[0]!;
          const close = marks.at(-1)!;
          if (close.from > open.to) linkLabels.push({ from: open.to, to: close.from });
          if (!isRaw(state)) {
            hidden.push({ from: open.from, to: open.to });
            hidden.push({ from: close.from, to: close.to });
          }
          return;
        }

        if (node.name === "Link") {
          const marks: { from: number; to: number }[] = [];
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            if (child.name === "LinkMark") marks.push({ from: child.from, to: child.to });
          }
          // Fewer than two marks is `[` with no closing bracket — incomplete
          // syntax, which §7.4 keeps as editable plain text.
          if (marks.length < 2) return;

          const open = marks[0]!;
          const close = marks[1]!;
          if (close.from > open.to) linkLabels.push({ from: open.to, to: close.from });

          // Under raw mode the brackets and destination stay on screen. The label
          // keeps its colour either way: it is still the label, and §7.4 says raw
          // mode "reveals the literal source" — it does not say it un-styles what
          // was already legible.
          if (!isRaw(state)) {
            hidden.push({ from: node.from, to: open.to });
            hidden.push({ from: close.from, to: node.to });
          }
          return;
        }

        /*
         * `---` → a drawn line.
         *
         * The dashes are replaced and the *row is kept*, which is different from how
         * a table or a fence marker is handled and better where it is possible: the
         * caret can still land on the line, so the one rendered construct whose
         * source you might want to delete stays reachable without raw mode. §7.3
         * calls a rule "the one place a line is the content rather than decoration",
         * and an empty row carrying a hairline is exactly that.
         */
        if (node.name === "HorizontalRule") {
          const line = state.doc.lineAt(node.from);
          mark(line.from, "md-line-rule");
          if (!isRaw(state) && node.to > node.from) {
            hidden.push({ from: node.from, to: node.to });
          }
          return;
        }

        // One per quoted line, since every row of a blockquote carries its own
        // `>`. The trailing space joins the box for the same reason it does
        // everywhere else here: left loose, it decides the text origin.
        if (node.name === "QuoteMark") {
          const line = state.doc.lineAt(node.from);
          quoteMarks.push({ from: node.from, to: textStart(line, node.to) });
          return;
        }

        /*
         * A four-space indented block is code written the other way.
         *
         * The plane comes from the same `md-line-code` the fenced form uses, and the
         * four-space marker is hidden per row — exactly four, so *relative*
         * indentation inside the block survives. markdown-it strips it too when it
         * builds `<pre><code>`, which is the point: two ways of writing one construct
         * must not sit at two different origins.
         */
        if (node.name === "CodeBlock") {
          for (const start of lineStarts(state, node.from, node.to)) {
            mark(start, "md-line-code");
            if (isRaw(state)) continue;

            const line = state.doc.lineAt(start);
            const indent = /^ {1,4}/.exec(line.text)?.[0];
            if (indent) hidden.push({ from: line.from, to: line.from + indent.length });
          }
          return;
        }

        if (node.name === "Blockquote" || node.name === "FencedCode") {
          const name = node.name === "Blockquote" ? "md-line-quote" : "md-line-code";
          for (const line of lineStarts(state, node.from, node.to)) mark(line, name);
        }
      },
    });
  }

  // Second pass for the continuations. It has to wait for the first: a line is
  // only a continuation once every marker in the document has had its say, and
  // the marker that settles it can be a nested item's, parsed after its parent.
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "ListItem") return;
        const depth = listDepth(node.node);
        for (const start of lineStarts(state, node.from, node.to)) {
          if (itemLines.has(start)) continue;
          markList(start, "md-line-item-cont", depth);

          // The indent the author typed to line this up with the item's text
          // stands in for the nesting steps *and* the marker column, since a
          // continuation has neither. A continuation left flush needs no box:
          // the line's own padding already puts it on the origin.
          const line = state.doc.lineAt(start);
          const to = textStart(line, start);
          if (to > start) continuations.push({ from: start, to });
        }
      },
    });
  }

  // A block straddling the edge of two visible ranges is reported by both, so
  // the same decoration can be collected twice. Dropping repeats here is far
  // easier to read than reasoning about when that can happen.
  const placed = new Set<string>();
  const ranges = [];
  /** The subset the caret must step over rather than into. */
  const atomic: ReturnType<Decoration["range"]>[] = [];

  for (const { from, key, deco } of marked) {
    if (placed.has(`line:${key}`)) continue;
    placed.add(`line:${key}`);
    ranges.push(deco.range(from, from));
  }

  const spans: [string, { from: number; to: number }[], Decoration][] = [
    ["mark", markers, MARKER],
    ["notation", notationMarks, NOTATION],
    ["indent", indents, INDENT],
    ["cont", continuations, CONTINUATION],
    ["quote", quoteMarks, QUOTE],
    ["link", linkLabels, LINK_LABEL],
    ["hidden", hidden, HIDDEN],
    ["inlinecode", inlineCode, INLINE_CODE],
    ["codemark", codeMarks, CODE_MARK],
    ["emphasis", emphasis, EMPHASIS],
    ["strong", strong, STRONG],
    ["emphasismark", emphasisMarks, EMPHASIS_MARK],
  ];

  for (const { from, to, source } of images) {
    const key = `image:${from}:${to}`;
    if (placed.has(key)) continue;
    placed.add(key);
    const range = Decoration.replace({ widget: new ImageWidget(source) }).range(from, to);
    ranges.push(range);
    // A picture is one thing to step past, not one thing per character of the
    // `![alt](url)` it was built from.
    atomic.push(range);
  }

  for (const [label, list, deco] of spans) {
    for (const { from, to } of list) {
      const key = `${label}:${from}:${to}`;
      if (placed.has(key)) continue;
      placed.add(key);
      const range = deco.range(from, to);
      ranges.push(range);
      if (deco === HIDDEN) atomic.push(range);
    }
  }

  // `sort` rather than a RangeSetBuilder: line decorations and marks are
  // collected in two different orders and have to interleave by position, and
  // the builder would rather throw than sort them.
  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomic, true) };
}

const notation = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomic } = notationLines(view));
    }

    update(update: ViewUpdate) {
      // The tree comparison is the one that matters while typing: the parser
      // works incrementally and can finish a region a frame or two after the
      // edit that changed it, so docChanged alone would leave a block plain
      // until the next keystroke happened to repaint it.
      const reparsed = syntaxTree(update.startState) !== syntaxTree(update.state);
      const raw = rawModeChanged(update.startState, update.state);
      if (update.docChanged || update.viewportChanged || reparsed || raw) {
        ({ decorations: this.decorations, atomic: this.atomic } = notationLines(update.view));
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Hidden notation is not somewhere the caret can be.
 *
 * `EditorView.atomicRanges` is what makes cursor motion treat a range as one step.
 * Without it every hidden bracket, destination and marker is still a position the
 * caret walks through one character at a time, invisibly — so crossing a rendered
 * link took as many presses as the *source* is long while the screen showed nothing
 * happening. Reported as "arrow key navigation is buggy" and "caret placement …
 * work[s] in raw code mode but not in rendered editing mode" (2026-07-30).
 *
 * Reads the plugin's own second set rather than its decorations, so marks and line
 * decorations are excluded by construction — see the note on `Notation`.
 */
const atomicNotation = EditorView.atomicRanges.of(
  (view) => view.plugin(notation)?.atomic ?? Decoration.none,
);

/**
 * Parse the document as markdown and mark its notation.
 *
 * `addKeymap` and `pasteURLAsLink` are off deliberately. Both are real features
 * this editor wants — continuing a list on Enter is vision §6.1 and has its own
 * task waiting in the plan — and taking the library's version of them here would
 * quietly answer a question that session is meant to ask. Parsing is what is
 * needed today, so parsing is all that is turned on.
 */
export function markdownNotation(): Extension {
  /*
   * GFM, not bare CommonMark. `markdown()` defaults to `commonmarkLanguage`,
   * which has no `Table` node at all — the reader parses with markdown-it and
   * gets tables, so a CommonMark editor would disagree with its own reference
   * about what a document even contains. Strikethrough and task lists come along,
   * which is the same dialect the reader already reads.
   */
  return [
    markdown({
      base: markdownLanguage,
      addKeymap: false,
      pasteURLAsLink: false,
      /*
       * Parse a declared fence with its own language, which is what gives the
       * highlighter a tree to colour. §5.2's inventory is closed, so this list is
       * the whole of it — an unknown hint leaves the fence as plain text and
       * therefore uncoloured, which is the rule holding by construction.
       */
      codeLanguages,
    }),
    /*
     * Which characters auto-pair in markdown prose — feedback, 2026-07-30: "so if I
     * type [ or { then it auto creates the other side… Need this for back ticks and
     * quotes etc."
     *
     * `closeBrackets` reads its bracket set from language data and falls back to
     * `( [ { ' "`. Markdown declares none, so this is the whole of what markdown
     * says about pairing: the backtick added, and `(` **taken away**.
     *
     * THE BACKTICK because §6.1 names "the single backticks around inline code" as
     * notation that stays literal, which makes it the pair a markdown writer types
     * most and the one the library's default would have missed. The one case it
     * still gets wrong — a run of three — is vetoed in pairing.ts.
     *
     * NOT `(`, and this is the interesting one. Measured 2026-07-30: typing
     * `see [here](http://x.dev)` one character at a time produced
     * `see [here]()http://x.dev)`. The auto-inserted `)` *completes the link*, the
     * notation plugin renders it that same update, the destination becomes a hidden
     * atomic range, and the caret is pushed out of it — so every character after
     * the paren lands outside the link. Nothing is wrong with the pairing or with
     * the rendering; they are simply incompatible on this construct, because
     * pairing finishes a thing the writer had only started.
     *
     * Without pairing there is no collision at all: `[x](url` is not a link until
     * the closing paren, so nothing renders while it is being typed and the caret
     * is already past the construct when it does. `(` was never in the report, and
     * a code file keeps it — this is language data, so `.ts` gets the library's
     * default list.
     *
     * On the *language* rather than on the editor, so it resolves per position: a
     * fenced Rust block is a nested language and gets Rust's answer, not prose's.
     *
     * `<` is deliberately absent too. §6.1 gives `>` to blockquotes and `<…>` to
     * autolinks, so pairing it would put a closer in the way of the one character
     * that starts a quote.
     */
    markdownLanguage.data.of({
      closeBrackets: { brackets: ["[", "{", "'", '"', "`"] },
    }),
    codeHighlighting(),
    notation,
    atomicNotation,
  ];
}
