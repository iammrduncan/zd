import { describe, expect, it } from "vitest";

import { reconcile, saveWouldClobber, type FileStamp } from "@/workbench/current-file/reconcile";

/*
 * External changes to an open file — vision §6.3: "detected and reconciled, not
 * silently clobbered."
 *
 * The decision is a pure function of what we knew, what is on disk, and whether
 * the buffer is dirty, which is the whole reason it was separated from the doing:
 * the case that matters most — a dirty buffer over a file someone else has
 * written — needs no filesystem, no clock, and no second process to state.
 */

const stamp = (modified: number, length: number): FileStamp => ({ modified, length });

const OPENED = stamp(1000, 500);

describe("nothing has happened", () => {
  it("does nothing when the file is as we left it", () => {
    expect(reconcile({ known: OPENED, onDisk: OPENED, dirty: false }).action).toBe("none");
  });

  it("does nothing merely because the buffer is dirty", () => {
    // Unsaved edits are the normal state of writing. Only the *file* moving is an
    // external change.
    expect(reconcile({ known: OPENED, onDisk: OPENED, dirty: true }).action).toBe("none");
  });
});

describe("someone else wrote the file", () => {
  it("reloads when the buffer has nothing to lose", () => {
    const result = reconcile({ known: OPENED, onDisk: stamp(2000, 512), dirty: false });

    // Nothing on screen differs from what was on disk, so taking the newer version
    // destroys nothing and is not a decision anyone needs to be asked about.
    expect(result.action).toBe("reload");
  });

  it("keeps both versions when the buffer is dirty", () => {
    const result = reconcile({ known: OPENED, onDisk: stamp(2000, 512), dirty: true });

    /*
     * The guarantee. Two versions exist and this program is not entitled to pick
     * one — reloading would destroy the edits on screen, and saving would destroy
     * the ones on disk.
     */
    expect(result.action).toBe("keep");
    expect(result.action === "keep" && result.notice).toContain("unsaved");
  });

  it("notices a change of the same length", () => {
    // Length alone cannot see a character swapped for another, which is why the
    // stamp carries the modified time too.
    expect(reconcile({ known: OPENED, onDisk: stamp(2000, 500), dirty: false }).action).toBe(
      "reload",
    );
  });

  it("notices a change within the same timestamp tick", () => {
    // And the mirror: a coarse filesystem clock can put two writes in one tick, so
    // the length is what catches it.
    expect(reconcile({ known: OPENED, onDisk: stamp(1000, 512), dirty: false }).action).toBe(
      "reload",
    );
  });
});

describe("the file is gone", () => {
  it("keeps what is on screen and says so", () => {
    const result = reconcile({ known: OPENED, onDisk: null, dirty: false });

    /*
     * Clean or dirty, this is never a reload-to-empty. The buffer may now be the
     * only copy of the document anywhere, and §6.3's promise is about not losing
     * work rather than about mirroring the disk.
     */
    expect(result.action).toBe("vanished");
    expect(result.action === "vanished" && result.notice).toContain("unsaved");
  });

  it("says the same thing when the buffer is dirty", () => {
    expect(reconcile({ known: OPENED, onDisk: null, dirty: true }).action).toBe("vanished");
  });

  it("treats a file that has appeared as a change too", () => {
    // Opened against a path that did not exist, and now something is there.
    expect(reconcile({ known: null, onDisk: OPENED, dirty: false }).action).toBe("reload");
  });
});

describe("whether a save would clobber", () => {
  it("allows a save when the file is the one we read", () => {
    expect(saveWouldClobber(OPENED, OPENED)).toBe(false);
  });

  it("refuses when the file moved under us", () => {
    expect(saveWouldClobber(OPENED, stamp(2000, 512))).toBe(true);
  });

  it("refuses even when the buffer is clean", () => {
    /*
     * The case a check written as "only warn if I have edits" would let straight
     * through. Saving a clean buffer over a file someone else has changed still
     * replaces their work with bytes this program read before they wrote — which
     * is why this function does not take `dirty` at all.
     */
    expect(saveWouldClobber(OPENED, stamp(2000, 500))).toBe(true);
  });

  it("refuses when the file has been deleted", () => {
    // Writing here recreates a file someone deliberately removed. Cheap to allow,
    // impossible to undo, so it goes through the same door as every other surprise.
    expect(saveWouldClobber(OPENED, null)).toBe(true);
  });
});
