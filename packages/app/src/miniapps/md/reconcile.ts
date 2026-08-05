/**
 * What to do when the file under an open document has changed — vision §6.3.
 *
 *   "External changes to an open file are detected and reconciled, not silently
 *    clobbered."
 *
 * The decision, separated from the doing. Everything here is a pure function of
 * three facts, which is what makes the one case that matters — a dirty buffer over
 * a file someone else has written — testable without a filesystem, a clock, or a
 * second process.
 *
 * **The guarantee is the last clause of that sentence.** Detection is in service of
 * it: the failure this exists to prevent is a save that throws away work nobody
 * knew about. Everything else here is a convenience layered on top.
 */

/*
 * `FileStamp` lives in platform.ts, not here — audit finding L1, fixed 2026-07-30.
 *
 * It describes what the `file_stamp` command returns, so the platform is its
 * honest home: the platform is the bottom layer and mini apps consume it through
 * `ctx.platform`, which means the bottom layer naming a type owned by the layer
 * above it was backwards. A future `zd td` that touches files would have
 * inherited a type from `md`'s directory.
 *
 * Re-exported rather than only imported, because every caller that reconciles
 * also reads stamps, and making them import from two files to do one thing would
 * be trading a layering problem for an ergonomics one.
 */
export type { FileStamp } from "@/platform";

import type { FileStamp } from "@/platform";

export interface DocumentState {
  /** The stamp when we last agreed with the file: at open, or after our own save. */
  known: FileStamp | null;
  /** The stamp the file has right now, or null when it is no longer there. */
  onDisk: FileStamp | null;
  /** Does the buffer differ from what was last written? */
  dirty: boolean;
}

export type Reconciliation =
  /** The file is as we left it. */
  | { action: "none" }
  /**
   * The file changed and nothing would be lost by taking it — the buffer has no
   * edits of its own.
   */
  | { action: "reload"; notice: string }
  /**
   * The file changed and so has the buffer. Two versions exist and this program
   * is not entitled to pick one.
   */
  | { action: "keep"; notice: string }
  /** The file is gone. Whatever is on screen may be the only copy left. */
  | { action: "vanished"; notice: string };

/** Did someone else write the file since we last agreed with it? */
function changed(known: FileStamp | null, onDisk: FileStamp | null): boolean {
  if (!known || !onDisk) return known !== onDisk;
  return known.modified !== onDisk.modified || known.length !== onDisk.length;
}

/**
 * What should happen, given what we knew, what is there, and what is unsaved.
 *
 * The asymmetry between `reload` and `keep` is the whole design. Reloading a clean
 * buffer loses nothing — the edits on screen are exactly the bytes that were on
 * disk — so taking the newer version silently is not a decision anyone needs to
 * make. Reloading a *dirty* buffer destroys work, so it is never done here at all:
 * the caller is told, and the person decides.
 *
 * Note what "keep" does **not** do. It does not merge, and it does not write. §6.3
 * says "reconciled", and a three-way merge is a product of its own — what this
 * promises is the part of that sentence that prevents data loss, and it says so
 * rather than implying more.
 */
export function reconcile({ known, onDisk, dirty }: DocumentState): Reconciliation {
  if (!changed(known, onDisk)) return { action: "none" };

  if (!onDisk) {
    return {
      action: "vanished",
      // Never "the file was deleted, reopening" — the buffer may now be the only
      // copy of this document anywhere, so nothing is thrown away on its behalf.
      notice: "This file is no longer on disk. What is on screen is unsaved — save it somewhere.",
    };
  }

  if (dirty) {
    return {
      action: "keep",
      notice: "This file changed on disk, and you have unsaved edits. Neither has been touched.",
    };
  }

  return { action: "reload", notice: "This file changed on disk and has been reloaded." };
}

/**
 * May a save go ahead?
 *
 * The narrowest and most important use of the above. A save is a clobber whenever
 * the file is not the one we read — the bytes about to be replaced are bytes this
 * program never showed anyone.
 *
 * Deliberately independent of `dirty`: saving a *clean* buffer over a file someone
 * else has changed would still destroy their work, and it is exactly the case a
 * check written as "only warn if I have edits" would let through.
 */
export function saveWouldClobber(known: FileStamp | null, onDisk: FileStamp | null): boolean {
  return changed(known, onDisk);
}
