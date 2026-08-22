import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { createEditorFind, editorFindExtension, type EditorFind } from "@/editor/find";

import { caretFocus, dropCaret, hasCaret } from "./focus";
import { markdownStructure } from "./markdown/continuation";
import { isTypewriter, setTypewriter, typewriterMode } from "./typewriter";
import { MARKDOWN_DOCUMENT, type DocumentLanguage } from "./language";
import { listIndentation } from "./markdown/lists";
import { jumpFocusBlock, settledMotion } from "./motion";
import { markdownNotation } from "./markdown/notation";
import { autoPairing } from "./pairing";
import { isRaw, rawModeState, setRaw } from "./markdown/raw";
import { hiddenNotationRows } from "./markdown/notation/rows";
import { markdownTables } from "./markdown/table";
import { reviewAnnotations, setCommentTags, type CommentTag, type ReviewSelection } from "./review";

import "./styles/editor.css";

/**
 * A document you can put a caret in.
 *
 * Deliberately four methods wide. CodeMirror is a large, capable library and
 * every one of its concepts that reaches a caller is a concept the caller has to
 * learn — so `EditorView`, `EditorState`, transactions, and extensions all stop
 * here. What escapes is the text, the caret, and teardown.
 */
export interface Editor {
  /** The document as it stands right now. */
  text(): string;
  /** The one current-file Find/Replace session for this document. */
  readonly find: EditorFind;
  /** Put the caret in the document. */
  focus(): void;
  /** True while the caret is in this editor. */
  hasFocus(): boolean;
  /**
   * Take the caret out of the document, handing focus back to the reading anchor.
   *
   * Vision §4.1's two states, and the way back from the second one. Returns false
   * when there was no caret to drop, so the key that asked can fall through rather
   * than be swallowed — DESIGN.md §8: "With nothing transient open it does nothing,
   * because there is no mode to unwind."
   */
  dropCaret(): boolean;
  /** True once a caret has been placed, whether or not the window still has focus. */
  hasCaret(): boolean;
  /**
   * Viewport y of the middle of the caret's row, or null when it cannot be measured.
   *
   * Screen coordinates, unlike `selection` right below — the one question about the
   * caret that is about where it is *painted* rather than where it is in the document.
   */
  caretY(): number | null;
  /**
   * Where the caret is, and what it has selected.
   *
   * Document offsets, not screen coordinates — this is the caller's handle on the
   * caret as a position in the text, which is what navigation and document-local
   * annotations actually need. `head` is the moving end.
   */
  selection(): { from: number; to: number; head: number; line: number };
  /** Replace the visible review tags attached to this document's lines. */
  setCommentTags(tags: readonly CommentTag[]): void;
  /**
   * Put the caret at a document offset.
   *
   * The counterpart of `selection()`. §4.3's outline and §4.5's find both navigate
   * to a position, so this is theirs as much as it is a test's — and a test of
   * arrow-key movement has to start from a known place by some means other than
   * clicking, since where a click lands is one of the things being measured.
   */
  setCaret(at: number): void;
  /**
   * True when the document differs from what was last written.
   *
   * A comparison, not a flag. Undo an edit back to the text that was saved and
   * there is genuinely nothing to write, so this goes false again — which is
   * what a reader of the state expects and what a boolean set on every keystroke
   * gets wrong.
   */
  isDirty(): boolean;
  /** True when selection is allowed but document mutation and saving are not. */
  isReadOnly(): boolean;
  /**
   * Write the document through `onSave` and mark it saved.
   *
   * A method rather than a key binding, because §7.1 gives every binding to the
   * workbench's one registry — the editor performs the command and the registry
   * decides which chord reaches it. Calling this with no `onSave` is a quiet
   * no-op, which is what makes the dev page and the tests honest.
   */
  save(): Promise<void>;
  /** Enable or disable the document's explicit focus treatment. */
  toggleFocus(): boolean;
  /** True only after Focus Mode has been explicitly enabled. */
  isFocusMode(): boolean;
  /**
   * Show the literal source of every rendered construct, or stop showing it.
   *
   * A method rather than a binding, same as `save` — §7.1 gives every chord to the
   * workbench registry. Returns the state it landed in, so a caller wiring a command
   * does not have to ask again to know what happened.
   */
  toggleRaw(): boolean;
  /** True while the literal source is revealed. */
  isRaw(): boolean;
  /**
   * Turn soft wrapping on or off, immediately. Returns the state it landed in.
   *
   * §6.1: "Word wrap is an explicit setting with a keyboard shortcut, and it
   * persists. It is always available — there is no mode in which wrapping stops
   * being a choice." Finding F03 asks for the change to reach the open editor with
   * no reload, which is why this is a live reconfiguration rather than an option
   * read at construction.
   */
  toggleWrap(): boolean;
  /** True while lines wrap rather than scrolling sideways. */
  isWrapped(): boolean;
  /**
   * Pin the caret's line, or stop pinning it. Returns the state it landed in.
   *
   * §6.1: "Typewriter mode is available as a toggle: the caret line holds its
   * vertical position while the document moves under it." §7.6 adds that it "needs
   * a caret, so it is available whenever there is one" — which is the caller's
   * business, since the registry is what decides whether a command can run.
   */
  toggleTypewriter(): boolean;
  /** True while the caret's line is pinned to the midpoint. */
  isTypewriter(): boolean;
  /**
   * Move the caret to the start of the next or previous focus block.
   *
   * A method rather than a key binding, for the same reason `save` and `toggleWrap`
   * are: §7.1 gives every chord a reader would look up to the workbench's one registry,
   * and the Reference renders that registry. It was a CodeMirror keymap until
   * 2026-07-30 and therefore invisible in the Reference by construction — reported as
   * "it should be listed in the shortcuts listing". See the note on `settledMotion`
   * in motion.ts for which chords stay keymap entries and why.
   *
   * Always returns true, including at the ends of the document; see `jumpFocusBlock`.
   */
  jumpBlock(direction: "next" | "previous"): boolean;
  /**
   * Replace the whole document, as if it had just been opened.
   *
   * §6.3's reconciliation: the file changed underneath and the buffer had nothing
   * of its own to lose, so the newer version takes its place. Marks the result
   * saved, because it is now exactly what is on disk — leaving it dirty would
   * offer to write the file back over itself.
   *
   * Only for that. Everything a *person* does to the text goes through the caret.
   */
  setText(text: string): void;
  /** Remove the editor and everything it attached. */
  destroy(): void;
}

/** What the caller supplies that the editor cannot work out for itself. */
export interface EditorOptions {
  /** Keep the source selectable while preventing edits, replacement, and save. */
  readOnly?: boolean;
  /**
   * Save this text. Vision §6.3: "`cmd+s` saves."
   *
   * The editor holds text and a caret, not a path — it has no idea what document
   * it is showing or what shell it is running in, and giving it either would put
   * the platform boundary in the wrong place. So it asks, and the caller decides
   * where the bytes go. Omit it and cmd+s is a quiet no-op.
   */
  onSave?: (text: string) => void | Promise<void | boolean>;
  /**
   * Called when the document crosses between saved and unsaved, and only then —
   * not on every keystroke.
   *
   * DESIGN.md §17 makes dirty buffers an explicit local state while §3 forbids a
   * persistent global status bar. The editor therefore reports the crossing and
   * says nothing about presentation; the current-file owner decides how that state
   * guards transitions, saving, and close confirmation.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * How to parse this document — vision §6.2.
   *
   * The resolved language rather than a path, deliberately. `onSave` above records
   * why the editor "holds text and a caret, not a path": it has no idea what
   * document it is showing, and giving it one would put the platform boundary in
   * the wrong place. Detecting a language from a filename is not file I/O, but the
   * invariant is worth keeping anyway — what this surface actually needs to know
   * is how to parse what it was handed, not what it is called. The caller runs
   * `languageFor(path)` and passes the answer.
   *
   * Omitted means markdown, which is what every existing caller meant.
   */
  language?: DocumentLanguage;
  /**
   * Do lines wrap when the document opens?
   *
   * §6.1 makes wrapping "an explicit setting… and it persists", and DESIGN.md §7.6
   * makes it "a workbench preference applied to every document". Neither of those is
   * the editor's business — it owns one document and knows nothing about the
   * others or about what was true yesterday. So the caller reads
   * `wordWrap()` from workbench/preferences.ts and passes the answer, exactly as it
   * does for `language`.
   *
   * Omitted means wrapping, which is §7.6's default and what every existing caller
   * meant.
   */
  wrap?: boolean;
  /** Focus Mode starts off unless an owning surface explicitly opts in. */
  focus?: boolean;
  /** Report a non-empty source selection to an owning review workflow. */
  onSelectionChange?: (selection: ReviewSelection | null) => void;
  /** Activate an inline comment tag through the owning review workflow. */
  onCommentActivate?: (id: string) => void;
}

/**
 * Mount an editing surface inside `parent`.
 *
 * Vision §6: "This is not a second mode — §4 is the surface, and this is what it
 * does when a caret is in it." So this brings no chrome of its own: no line
 * numbers, no fold gutter, no active-line wash, no scroller. Appearance lives in
 * styles/editor.css, because it is type and colour, and type and colour in this
 * project are shared semantic tokens — never values compiled into a script.
 *
 * The extension list is the whole feature set, and it is short on purpose:
 * editing, undo, wrapping, the markdown notation of §6.1, and the caret-driven
 * focus of §4.1. Typewriter mode and the word wrap toggle are their own sessions
 * and their own extensions.
 */
export function createEditor(
  parent: HTMLElement,
  doc: string,
  options: EditorOptions = {},
): Editor {
  /*
   * The document as it was last written — what "unsaved" is measured against.
   *
   * A Text rather than a string, because comparing two of them checks the length
   * first. Typing almost always changes the length, so the common case costs
   * nothing, and §10 makes idle cost part of the design on documents that run to
   * megabytes.
   */
  let written = Text.of(doc.split("\n"));

  const language = options.language ?? MARKDOWN_DOCUMENT;
  const readOnly = options.readOnly ?? false;

  /*
   * The kind of document, on the column, for CSS to read — §6.2's "mono family"
   * is type, and type in this project is a stylesheet reading semantic tokens.
   * Written before the view is built so the first paint already has it and a code
   * file never flashes through the prose face (§2: "Nothing flashes, jumps, or
   * reflows while you work").
   */
  parent.dataset.language = language.markdown ? "markdown" : "code";
  parent.dataset.editable = String(!readOnly);
  let focusMode = options.focus ?? false;
  parent.dataset.focusMode = String(focusMode);
  let dirty = false;
  let find: EditorFind | null = null;

  /**
   * The save in flight, so the next one queues behind it rather than racing it.
   *
   * A resolved promise when nothing is happening, which makes "chain onto it" the
   * only code path and removes the "is one running" branch entirely.
   */
  let saving: Promise<void> = Promise.resolve();

  /*
   * Wrapping, in a compartment so it can change without rebuilding the editor.
   *
   * A plain `EditorView.lineWrapping` in the extension list is fixed for the life of
   * the state, and F03 wants the shortcut to change the document already on screen.
   * Reconfiguring one compartment keeps the caret, the history, and the scroll
   * position, which recreating the view would all throw away.
   */
  const wrapping = new Compartment();
  let wrapped = options.wrap ?? true;

  /** Recheck against `written` and report only a crossing. */
  function recheck(): void {
    const now = !written.eq(view.state.doc);
    if (now === dirty) return;
    dirty = now;
    options.onDirtyChange?.(dirty);
  }

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        /*
         * First, deliberately. `table.ts` and `fence.ts` read this flag while
         * building their initial decorations, and a StateField can only read a
         * field that was initialised before it. `isRaw` defaults to false rather
         * than throwing if that is ever got wrong, but the order is the real fix.
         */
        rawModeState(),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        history(),
        editorFindExtension(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          recheck();
          find?.queueRefresh();
        }),
        /*
         * No chords of our own. Every binding this surface used to own — save,
         * and the former document-info command — is now a workbench command registered by
         * the caller, because §7.1 allows exactly one registry and a second
         * keymap here is F16 starting over. What is left is CodeMirror's own
         * editing and history keys, which are text manipulation rather than
         * application commands.
         *
         * The §6.1 structure keys — Enter and Backspace — go *first*, so they get
         * the key before the generic bindings do and can decline back to them. See
         * continuation.ts for why one of the two commands is ours.
         */
        /*
         * Everything markdown-specific, and nothing at all when the file is not
         * markdown — vision §6.2: "no markdown parsing… it is not treated as if it
         * were." Reported as "html and ts parsed as markdown".
         *
         * One condition rather than a check inside each extension. A `.ts` file
         * that got the notation plugin but not the table widget would be a third
         * kind of document nobody designed, and every one of these reads the same
         * parse tree — turning half of them off would leave the other half
         * decorating a tree that is no longer there.
         *
         * `markdownStructure` and `listIndentation` are in here because they are
         * markdown too: Enter continuing a list marker and Tab nesting one are
         * §6.1 behaviours, and performing them in a TypeScript file would be the
         * same defect as drawing a heading in it.
         */
        language.markdown ? [markdownStructure(), listIndentation()] : [],
        // Pairing and wrapping. After the §6.1 structure keys, which own Enter and
        // Backspace first. See pairing.ts, and notation.ts for which characters
        // pair in markdown.
        autoPairing(),
        // Ahead of defaultKeymap, which is where cmd+left and cmd+right come from.
        // See motion.ts: the commands are the library's, the invariant is ours.
        settledMotion(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        language.markdown
          ? [
              markdownNotation(),
              // Separate from the notation plugin because a table is a block
              // decoration and CodeMirror only accepts those from a StateField.
              // See table.ts.
              markdownTables(),
              // Also a StateField, and for the same reason — hiding a whole row is
              // a block decoration. See notation/rows.ts.
              hiddenNotationRows(),
            ]
          : (language.support ?? []),
        caretFocus(),
        options.onSelectionChange || options.onCommentActivate
          ? reviewAnnotations({
              activate: (id) => options.onCommentActivate?.(id),
              select: (selection) => options.onSelectionChange?.(selection),
            })
          : [],
        // After caretFocus so its own measurement runs first: focus reads where the
        // caret is, this moves the document under it, and §7.6 requires the two to
        // "always identify the same current line". See typewriter.ts.
        typewriterMode(),
        // Wrapping is the default, not the law — §6.1: "there is no mode in which
        // wrapping stops being a choice". The compartment is what makes the toggle
        // live; see the note where it is declared. The *initial* state is the
        // caller's, because §7.6 makes it a workbench preference rather than this
        // document's opinion.
        wrapping.of(wrapped ? EditorView.lineWrapping : []),
      ],
    }),
  });

  find = createEditorFind(parent, view, {
    markdown: language.markdown,
    readOnly,
    raw: () => isRaw(view.state),
  });
  const documentFind = find;

  return {
    text: () => view.state.doc.toString(),
    find: documentFind,
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    selection: () => {
      const range = view.state.selection.main;
      return {
        from: range.from,
        to: range.to,
        head: range.head,
        line: view.state.doc.lineAt(range.head).number,
      };
    },
    setCommentTags: (tags) => setCommentTags(view, tags),
    /**
     * Viewport y of the middle of the caret's row, or null if it cannot be measured.
     *
     * From `coordsAtPos` rather than from the DOM selection, and the difference is the
     * whole reason this exists. There is no `.cm-cursor` element on this surface — the
     * browser draws the caret and editor.css colours it with `caret-color` — so a test
     * has only the collapsed `Range`, and a collapsed range **on a blank line reports no
     * rect at all**. That is a real hole rather than a nuisance: the caret is somewhere,
     * the product knows where, and the measurement went blind exactly on the lines a
     * markdown document is full of.
     *
     * Asked of the view, which is the thing that knows. Same reason `anchorY` is a hook
     * rather than a `height / 3` restated in a spec.
     */
    caretY: () => {
      const at = view.coordsAtPos(view.state.selection.main.head);
      return at ? at.top + (at.bottom - at.top) / 2 : null;
    },
    hasCaret: () => hasCaret(view),
    dropCaret: () => {
      if (!hasCaret(view)) return false;
      // Both halves, in one transaction. The effect clears the sticky flag so the
      // anchor owns the target again; the blur takes the keyboard off the surface,
      // which is what "remove my cursor from the editor" means to a reader.
      view.dispatch({ effects: dropCaret.of(null) });
      view.contentDOM.blur();
      return true;
    },
    setCaret: (at) => {
      // Clamped rather than validated. An offset past the end of a shrinking
      // document is the caller's ordinary case, not an error worth raising.
      const clamped = Math.max(0, Math.min(at, view.state.doc.length));
      view.dispatch({ selection: { anchor: clamped } });
    },
    isDirty: () => dirty,
    isReadOnly: () => readOnly,
    save: () => {
      if (readOnly) return Promise.resolve();
      /*
       * **The document is not saved until the owner says it was.**
       *
       * This used to set `written` first and call the handler afterwards, which
       * made "saved" a claim about having *asked* rather than about the bytes
       * reaching the disk. Every failure path then lied: the clobber refusal, a
       * full disk, a read-only file, a deleted directory. The former document-info
       * surface agreed, and quitting lost the work — filed as audit H1, and the one
       * failure the save contract exists to prevent.
       *
       * So the update moved to the resolution path. A handler that resolves
       * `false` refused; one that rejects failed; either way `written` is left
       * where it was and the buffer stays honestly dirty.
       *
       * The rejection is swallowed rather than re-thrown. Whoever handed us
       * `onSave` is the only party that knows what went wrong and how to say so —
       * it owns the path and the notice — and a command that dispatched a key
       * has nowhere to put an exception.
       */
      const attempt = saving
        .then(() => {
          const now = view.state.doc;
          return Promise.resolve(options.onSave?.(now.toString())).then((outcome) => {
            if (outcome === false) return;
            written = now;
            recheck();
          });
        })
        .catch(() => {
          // Kept dirty on purpose. See above.
        });

      /*
       * Serialised, which is the other half of H1. Each save reads the file's
       * stamp, writes, then re-reads it; two overlapping saves let the second
       * stamp the disk after the first wrote but before the baseline updated, and
       * the reader was warned that their own file had changed underneath them.
       * Chaining removes that without a lock.
       */
      saving = attempt;
      return attempt;
    },
    toggleFocus: () => {
      focusMode = !focusMode;
      parent.dataset.focusMode = String(focusMode);
      return focusMode;
    },
    isFocusMode: () => focusMode,
    toggleRaw: () => {
      const next = !isRaw(view.state);
      view.dispatch({ effects: setRaw.of(next) });
      documentFind.refresh();
      return next;
    },
    isRaw: () => isRaw(view.state),
    toggleWrap: () => {
      wrapped = !wrapped;
      // An empty extension rather than a `false` flag: CodeMirror has no "off" for
      // lineWrapping, so not-wrapping is the absence of it.
      view.dispatch({ effects: wrapping.reconfigure(wrapped ? EditorView.lineWrapping : []) });
      return wrapped;
    },
    isWrapped: () => wrapped,
    toggleTypewriter: () => {
      const next = !isTypewriter(view.state);
      view.dispatch({ effects: setTypewriter.of(next) });
      return next;
    },
    isTypewriter: () => isTypewriter(view.state),
    jumpBlock: (direction) => jumpFocusBlock(view, direction),
    setText: (text) => {
      written = Text.of(text.split("\n"));
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        // The caret is not carried over. The document it pointed into is gone, and
        // an offset that meant something in the old text means somewhere arbitrary
        // in the new one.
        selection: { anchor: 0 },
      });
      recheck();
      documentFind.refresh();
    },
    destroy: () => {
      documentFind.destroy();
      view.destroy();
    },
  };
}
