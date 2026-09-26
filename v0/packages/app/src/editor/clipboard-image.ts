import { StateEffect, StateField, type Extension, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const MAX_CLIPBOARD_IMAGE_BYTES = 16 * 1024 * 1024;

export type ClipboardImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ClipboardImage {
  readonly mediaType: ClipboardImageMediaType;
  readonly bytes: Uint8Array;
}

export interface ClipboardImagePasteOptions {
  /** Persist the image and return the exact text to insert at the paste selection. */
  readonly save: (image: ClipboardImage) => Promise<string>;
  /** Report a refused or failed paste without changing the document. */
  readonly onProblem: (message: string) => void;
}

interface PendingPaste {
  readonly id: number;
  readonly from: number;
  readonly to: number;
  readonly head: number;
  readonly touched: boolean;
}

const addPendingPaste = StateEffect.define<PendingPaste>();
const removePendingPaste = StateEffect.define<number>();

function touchesSelection(transaction: Transaction, paste: PendingPaste): boolean {
  let touched = false;
  transaction.changes.iterChangedRanges((from, to) => {
    if (touched) return;
    touched =
      from === to ? from >= paste.from && from <= paste.to : from < paste.to && to > paste.from;
  });
  return touched;
}

const pendingPastes = StateField.define<readonly PendingPaste[]>({
  create: () => [],
  update: (pastes, transaction) => {
    const mapped = pastes.map((paste) => {
      const touched = paste.touched || touchesSelection(transaction, paste);
      const head = transaction.changes.mapPos(paste.head, 1);
      return touched
        ? { ...paste, from: head, to: head, head, touched }
        : {
            ...paste,
            from: transaction.changes.mapPos(paste.from, -1),
            to: transaction.changes.mapPos(paste.to, 1),
            head,
          };
    });
    return transaction.effects.reduce<readonly PendingPaste[]>((next, effect) => {
      if (effect.is(addPendingPaste)) return [...next, effect.value];
      if (effect.is(removePendingPaste)) return next.filter(({ id }) => id !== effect.value);
      return next;
    }, mapped);
  },
});

function mediaType(value: string): ClipboardImageMediaType | null {
  switch (value.toLowerCase()) {
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
      return value.toLowerCase() as ClipboardImageMediaType;
    default:
      return null;
  }
}

function clipboardImage(event: ClipboardEvent): {
  file: File;
  mediaType: ClipboardImageMediaType;
} | null {
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    const supported = mediaType(item.type);
    if (item.kind !== "file" || !supported) continue;
    const file = item.getAsFile();
    if (file) return { file, mediaType: supported };
  }
  return null;
}

let nextPasteId = 0;

/**
 * Intercept only supported clipboard images and insert text only after native persistence succeeds.
 *
 * The pending selection maps through intervening edits. If the user edits that selection while the
 * native write is in flight, the eventual link collapses to the mapped caret instead of overwriting
 * the newer text.
 */
export function clipboardImagePaste(options: ClipboardImagePasteOptions): Extension {
  return [
    pendingPastes,
    EditorView.domEventHandlers({
      paste(event, view) {
        const image = clipboardImage(event);
        if (!image) return false;
        event.preventDefault();

        if (image.file.size === 0) {
          options.onProblem("The clipboard image is empty.");
          return true;
        }
        if (image.file.size > MAX_CLIPBOARD_IMAGE_BYTES) {
          options.onProblem("The clipboard image exceeds the 16 MiB limit.");
          return true;
        }

        const selection = view.state.selection.main;
        const id = ++nextPasteId;
        view.dispatch({
          effects: addPendingPaste.of({
            id,
            from: selection.from,
            to: selection.to,
            head: selection.head,
            touched: false,
          }),
        });

        void (async () => {
          try {
            const bytes = new Uint8Array(await image.file.arrayBuffer());
            if (bytes.length === 0 || bytes.length > MAX_CLIPBOARD_IMAGE_BYTES) {
              throw new Error("The clipboard image is outside the supported size limit.");
            }
            const insertion = await options.save({ mediaType: image.mediaType, bytes });
            if (!view.dom.isConnected) return;
            const pending = view.state.field(pendingPastes).find((paste) => paste.id === id);
            if (!pending) return;
            view.dispatch({
              changes: { from: pending.from, to: pending.to, insert: insertion },
              selection: { anchor: pending.from + insertion.length },
              effects: removePendingPaste.of(id),
              userEvent: "input.paste",
            });
          } catch (error) {
            if (view.dom.isConnected) {
              view.dispatch({ effects: removePendingPaste.of(id) });
            }
            options.onProblem(
              error instanceof Error && error.message
                ? error.message
                : "The clipboard image could not be saved.",
            );
          }
        })();
        return true;
      },
    }),
  ];
}
