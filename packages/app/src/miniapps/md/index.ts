import type { WorkbenchRuntimeContext, Unmount } from "@/workbench/runtime";
import { launchResource } from "@/workbench/resources";
import { createEditor, languageFor, type Editor } from "@/editor";
import { setWordWrap, wordWrap } from "@/workbench/preferences";
import { register, registerCommandTarget } from "@/workbench/shortcuts";
import { clearStatus, lineCount, showNotice, showStatus, wordCount } from "./status";
import { clearPersistentNotice, documentNotice, persistentNotice } from "./notice";
import { reconcile, saveWouldClobber, type FileStamp } from "./reconcile";
import { closeConfirmation } from "./close-confirmation";
import { mountWorkspace, type MountedDocument } from "./workspace";
import type { ReviewDocument } from "./review";
import "./styles/md.css";
import "./styles/content.css";
import "./styles/review.css";

/** Feedback asks for the launch lesson to stay long enough to read once. */
const LAUNCH_HINT_MS = 5_000;

/**
 * Briefly teach the motion command that is useful as soon as the caret appears.
 *
 * This belongs to the successful document mount, not workbench boot: a read failure,
 * the Home surface, and thread content have neither an editor to
 * focus nor a focus block to jump. It is removed from the DOM rather than merely
 * hidden so an assistive reader cannot discover stale launch advice later.
 */
function teachFocusJump(host: HTMLElement): () => void {
  const hint = document.createElement("p");
  hint.className = "md-launch-hint";
  hint.textContent = "Use opt+down-arrow to shift your focus while reading";
  host.append(hint);

  const timer = window.setTimeout(() => hint.remove(), LAUNCH_HINT_MS);
  return () => {
    window.clearTimeout(timer);
    hint.remove();
  };
}

/**
 * The document's source, or why there isn't any.
 *
 * Reading a file is the only thing here that can fail, and DESIGN.md §7.10 puts
 * read state "at the Document" — so every outcome, including every failure,
 * resolves to something the surface can show. Callers get one or the other,
 * never an exception.
 */
async function documentSource(
  ctx: WorkbenchRuntimeContext,
): Promise<{ text: string } | { problem: string }> {
  if (ctx.launch.problem) return { problem: ctx.launch.problem };
  const resource = launchResource(ctx.launch);
  if (!resource) return { problem: "No document open. The Home surface lands in session 2.4." };

  try {
    return { text: await ctx.platform.readTextFile(resource) };
  } catch (cause) {
    // The path came from the user's own command line, so naming it back is
    // help rather than disclosure.
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { problem: `Could not read ${resource.relativePath} — ${reason}` };
  }
}

/**
 * The retained Markdown document surface inside the `zd` workbench.
 *
 * The document surface is the editor. Vision §6: "This is not a second mode —
 * §4 is the surface, and this is what it does when a caret is in it." Opening a
 * file puts its source on screen with a caret available, rather than a rendered
 * copy you have to leave in order to change anything.
 *
 *   editor/    CodeMirror, notation, focus, saving     (sessions 3.1–3.5)
 *   workspace/ sidebar, quick open, recents, git       (sessions 2.1–2.4, 4.5)
 *
 * See docs/VISION.md.
 */
const documentApp = {
  async mount(
    host: HTMLElement,
    ctx: WorkbenchRuntimeContext,
    review?: ReviewDocument,
  ): Promise<MountedDocument> {
    // Two elements, two jobs: the surface scrolls, the column holds the measure.
    // Keeping them separate is what lets the insets belong to the scrollable
    // extent while the column stays centred — see styles/md.css.
    const surface = document.createElement("main");
    surface.className = "md-surface";
    surface.dataset.launchPath = launchResource(ctx.launch)?.relativePath ?? "";

    /** One calm sentence about the file, on the strip §7.10 already owns. */
    const notify = (message: string) => showNotice(host, message);

    /**
     * The document's measure column, once there is one. The persistent notice
     * belongs above the text rather than at the top of a scroll extent.
     */
    let documentColumn: HTMLElement | null = null;

    /**
     * A warning that must outlast a glance — audit finding M3.
     *
     * The routing rule, said once: **a message about work that might be lost
     * persists; everything else rides the strip.** A refused save, a failed write,
     * a file changed or gone underneath, and a close request refused over unsaved
     * work are all evidence that what is on screen is the only copy — and evidence
     * that expires after ten seconds is not evidence. Everything else here is
     * informational ("reloaded"), where the strip's own dwell is exactly right.
     *
     * The close refusal was on the wrong side of that line until 2026-07-30, filed
     * as an instruction rather than as evidence. **The test is not whether the
     * message tells you to do something — it is whether the state it describes
     * outlives it.** The arming behind that one clears on a save and on nothing
     * else, so the strip left and the state stayed. See the note beside it.
     *
     * Falls back to the strip when there is no column, which is the read-failure
     * case: there is no document to stand above, and the whole surface is already
     * one sentence saying so.
     */
    const warn = (message: string) =>
      documentColumn ? persistentNotice(documentColumn, message) : notify(message);

    /** The condition ended, so the warning has nothing left to say. §7.3: it withdraws. */
    const withdraw = () => {
      if (documentColumn) clearPersistentNotice(documentColumn);
    };

    const source = await documentSource(ctx);
    let editor: Editor | null = null;
    let clearLaunchHint = () => {};
    let disconnectReview = () => {};
    const unregister: (() => void)[] = [];

    const confirmClose = closeConfirmation(host, () => void ctx.platform.closeWindow());

    /*
     * The file as we last agreed with it — §6.3: "External changes to an open file
     * are detected and reconciled, not silently clobbered."
     *
     * Set at open and after each of our own saves, so "changed" always means
     * changed *by someone else*. Held here rather than in the editor for the reason
     * the path is: the editor owns a buffer and a caret, and this is a fact about a
     * file.
     */
    let known: FileStamp | null = null;

    if ("problem" in source) {
      // No caret over a document that is not there. §6.3 saving writes what is
      // on screen, so an editable blank over a file that failed to load is one
      // cmd+s away from destroying it.
      const column = document.createElement("article");
      column.className = "md-document-error";
      column.append(documentNotice(source.problem));
      surface.append(column);
    } else {
      const column = document.createElement("div");
      column.className = "md-editor";
      surface.append(column);
      documentColumn = column;

      // The join. The editor holds text and a caret and knows nothing about
      // files; the platform writes bytes and knows nothing about documents.
      // This is the only place that knows both, which is why the path is here
      // and not inside either of them.
      const resource = launchResource(ctx.launch)!;

      // Its first value. What "the file as we last agreed with it" means is on the
      // declaration above — audit finding L3: this paragraph was written out twice,
      // an artefact of `known` moving out of this block.
      known = await ctx.platform.fileStamp(resource).catch(() => null);

      editor = createEditor(column, source.text, {
        /*
         * Returns whether the bytes reached the disk, and the editor believes it.
         *
         * `false` and a rejection both leave the buffer dirty — see the note on
         * `save` in editor.ts. This side owns the path and the notice, so it is
         * also the side that says what went wrong; the editor has nowhere to put
         * an exception and nothing to say about a filesystem.
         */
        onSave: async (text) => {
          /*
           * The guarantee, at the one moment it can be broken. A save replaces
           * every byte on disk, so writing over a file that is no longer the one
           * we read destroys work this program never showed anyone.
           *
           * Checked regardless of whether the buffer is dirty: saving a *clean*
           * buffer over someone else's edit is the same loss, and it is exactly
           * what a check phrased as "only warn if I have changes" lets through.
           */
          const onDisk = await ctx.platform.fileStamp(resource).catch(() => known);
          if (saveWouldClobber(known, onDisk)) {
            warn(
              "This file changed on disk. Nothing was written — copy your work, then reopen it.",
            );
            return false;
          }

          try {
            await ctx.platform.writeTextFile(resource, text);
          } catch (cause) {
            /*
             * A full disk, a read-only file, a directory that is gone. This used
             * to reject inside a `void (async () => …)()` with no catch: the
             * rejection was unhandled, the reader saw nothing, and the editor
             * said "saved" over work that had not been written anywhere.
             */
            const reason = cause instanceof Error ? cause.message : String(cause);
            warn(`Could not save — ${reason}. Your work is still here and still unsaved.`);
            return false;
          }

          // Now the file is ours again, so the next save has a fresh baseline.
          known = await ctx.platform.fileStamp(resource).catch(() => null);
          // The work is on disk, so §7.3's standing notice has nothing left to
          // warn about. A later close can now proceed without confirmation.
          withdraw();
          return true;
        },
        // §6.2. Resolved here for the same reason `onSave` is: this is the only
        // place that knows the path, and the editor is kept knowing only how to
        // parse what it was handed.
        language: languageFor(resource.relativePath),
        // §7.6: "a suite preference applied to every document". Read here rather
        // than inside the editor, which owns one document and knows nothing about
        // what was chosen in another or yesterday.
        wrap: wordWrap(),
        onSelectionChange: (selection) => review?.selection(selection),
        onCommentActivate: (id) => review?.openFeedback(id),
      });
      disconnectReview = review?.connect((tags) => editor?.setCommentTags(tags)) ?? (() => {});

      /*
       * The document's commands, in the suite's one registry (§7.1). They live
       * here rather than inside the editor because this is the only place that
       * knows both the editing surface and the host the strip is drawn on — and
       * because §7.1 allows no second place for a binding to exist.
       *
       * Registered on mount and removed on unmount, so a chord is listed exactly
       * while it can actually run.
       */
      const document_ = editor;
      unregister.push(
        register({
          id: "document.save",
          chord: { key: "s", mod: true },
          description: "Save the document",
          run: () => {
            void document_.save();
            // Claimed whether or not a path is wired up. In a webview this key
            // is "save page as", and offering that over a document being
            // written would be worse than doing nothing.
            return true;
          },
        }),
        register({
          id: "document.raw",
          // Provisional chord — see the note in editor/fixture.ts. Neither the
          // vision nor DESIGN.md names one for raw mode.
          chord: { key: "e", mod: true },
          description: "Raw mode: show the literal markdown",
          run: () => {
            document_.toggleRaw();
            return true;
          },
        }),
        registerCommandTarget({
          id: "document.dropCaret",
          commandId: "workbench.escape",
          priority: 10,
          available: () => document_.hasCaret(),
          run: () => document_.dropCaret(),
        }),
        register({
          id: "document.wrap",
          /*
           * `Mod-Alt-z` — the chord the first prototype used and the one VS Code uses
           * for the same command, so this one is looked up rather than invented the
           * way `Mod-e` and `Mod-i` were.
           *
           * Alt chords match the physical key in the registry, and they have to:
           * Option is a compose key, so macOS delivers this with `key: "Ω"`. F03
           * records the first prototype hitting precisely that.
           */
          chord: { key: "z", mod: true, alt: true },
          description: "Word wrap: stop lines wrapping, or start again",
          run: () => {
            // Toggle, then remember. §6.1: the setting "persists" — one place
            // decides the new value and the same place records it, so the shortcut
            // and the stored preference cannot drift.
            setWordWrap(document_.toggleWrap());
            return true;
          },
        }),
        register({
          id: "document.typewriter",
          /*
           * Provisional, like `Mod-e` and `Mod-i` — neither vision §6.1 nor
           * DESIGN.md §7.6 names a chord for this one either. Paired with word
           * wrap's `Mod-Alt-z` on purpose: both change how the document sits on the
           * surface rather than what it says, and Alt keeps them clear of the
           * single-modifier chords a webview claims. It moves when the Shortcut
           * Reference is reviewed.
           */
          chord: { key: "t", mod: true, alt: true },
          description: "Typewriter mode: hold the caret's line in place",
          // §7.6: "Typewriter Mode needs a caret, so it is available whenever there
          // is one." The registry is what makes that honest in the Reference (§7.1).
          available: () => document_.hasCaret(),
          run: () => {
            document_.toggleTypewriter();
            return true;
          },
        }),
        register({
          id: "document.jumpNext",
          /*
           * The focus-block jump, in the registry rather than in a CodeMirror keymap —
           * "it should be listed in the shortcuts listing" (feedback, 2026-07-30), and
           * §7.1 leaves no other way to list it: the Reference renders the registry and
           * nothing else, so a binding outside it is invisible by construction.
           *
           * `Alt+arrow` on every platform. Unlike `cmd+arrow` there is no existing
           * meaning to preserve elsewhere — Alt+arrow is some flavour of word or
           * paragraph motion everywhere — and a focus-block jump is the better answer on
           * all of them.
           *
           * Safe from the macOS compose problem that forced `physicalKey` on the other
           * Alt chords, but it goes through it anyway: Option+ArrowDown has no printable
           * form so `event.key` stays `ArrowDown`, and `physicalKey` returns a non-letter
           * name unchanged.
           */
          chord: { key: "ArrowDown", alt: true },
          description: "Jump to the next focus block",
          /*
           * §4.1 makes placing a caret a one-way door out of anchor-following, so a
           * motion key must not cross it on the reader's behalf. With no caret this is
           * genuinely unavailable, and §7.1 wants that said out loud in the Reference
           * rather than listed as working.
           */
          available: () => document_.hasCaret(),
          run: () => document_.jumpBlock("next"),
        }),
        register({
          id: "document.jumpPrevious",
          chord: { key: "ArrowUp", alt: true },
          description: "Jump to the previous focus block",
          available: () => document_.hasCaret(),
          run: () => document_.jumpBlock("previous"),
        }),
        register({
          id: "document.status",
          chord: { key: "i", mod: true },
          description: "Show the buffer's counts, read time, and unsaved state",
          run: () => {
            const text = document_.text();
            showStatus(host, {
              words: wordCount(text),
              characters: text.length,
              lines: lineCount(text),
              dirty: document_.isDirty(),
            });
            return true;
          },
        }),
      );
    }

    host.append(surface);

    if (editor) {
      // Focus only after the surface is in the document. Browsers ignore focus
      // on detached nodes, which made the earlier call look right to a spy while
      // opening a real window with no caret. The accompanying sentence names the
      // focus motion once, then leaves; feedback, 2026-07-31.
      editor.focus();
      clearLaunchHint = teachFocusJump(host);
    }

    /*
     * Checked when the window comes back, and only then.
     *
     * A person edits a file elsewhere and tabs back — that is the whole of the
     * reported shape, and it costs nothing while idle. §10 makes idle cost part of
     * the design, so a timer polling the disk forever to catch a case that only
     * matters when someone is looking would be the wrong trade.
     */
    const onFocus = () => {
      const open = editor;
      const resource = launchResource(ctx.launch);
      if (!open || !resource) return;

      void (async () => {
        const onDisk = await ctx.platform.fileStamp(resource).catch(() => known);
        const decision = reconcile({ known, onDisk, dirty: open.isDirty() });
        if (decision.action === "none") {
          // §7.3: the notice "withdraws when the path reappears". Nothing is wrong
          // with the file any more, so anything standing about it is stale.
          withdraw();
          return;
        }

        if (decision.action === "reload") {
          // Nothing on screen differs from what was on disk, so taking the newer
          // version destroys nothing — see reconcile.ts for why this case alone is
          // allowed to act without asking.
          const text = await ctx.platform.readTextFile(resource).catch(() => null);
          if (text === null) return;
          open.setText(text);
          known = onDisk;
        }

        /*
         * `reload` is the one case where nothing was at risk — the buffer matched
         * the disk, so taking the newer version lost nothing and the sentence is
         * informational. The other two are §6.3 loss warnings and stand.
         */
        if (decision.action === "reload") notify(decision.notice);
        else warn(decision.notice);
      })();
    };
    window.addEventListener("focus", onFocus);

    /*
     * Quitting with unsaved work — vision §6.3, which promises that what you wrote
     * is still there. The shell refuses every close and asks here, because this is
     * the only side that knows whether anything is unsaved. See `on_window_event`
     * in lib.rs for why the refusal is unconditional.
     *
     * The explicit confirmation is deliberate. An earlier implementation armed a
     * second Cmd+W after showing a sentence on the document. That made a repeated
     * shortcut destructive without requiring the explicit click the reader asked
     * for. Every dirty close now presents the same confirm-or-cancel choice; there
     * is no hidden state for another close request to bypass.
     */
    const stopListening = ctx.platform.onCloseRequested(() => {
      const open = editor;
      if (open?.isDirty()) {
        confirmClose.show();
        return;
      }
      confirmClose.dismiss();
      void ctx.platform.closeWindow();
    });

    return {
      canSwitch: () => {
        if (!editor?.isDirty()) return true;
        warn("Save this file before opening another. Your work is still here.");
        return false;
      },
      unmount: () => {
        stopListening();
        confirmClose.dismiss();
        window.removeEventListener("focus", onFocus);
        unregister.forEach((remove) => remove());
        clearStatus(host);
        clearLaunchHint();
        disconnectReview();
        editor?.destroy();
        surface.remove();
      },
    };
  },
};

export function mountCurrentWorkspace(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
): Promise<Unmount> {
  return mountWorkspace(host, context, documentApp.mount);
}
