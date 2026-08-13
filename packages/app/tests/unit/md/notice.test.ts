import { describe, expect, it } from "vitest";

import {
  clearPersistentNotice,
  documentNotice,
  persistentNotice,
  PERSISTENT_NOTICE,
} from "@/miniapps/md/notice";

/*
 * The persistent document-local notice — DESIGN.md §7.3.
 *
 *   "When the open path disappears, retain the last rendered content and place one
 *    persistent document-local notice line above it: 'file no longer exists.' This
 *    line is the BDD's deletion banner, but is rendered as text on the document
 *    plane rather than decorative chrome. It withdraws when the path reappears and
 *    never carries a button."
 *
 * Audit finding M3 is that this surface did not exist, so the three §6.3 messages
 * whose entire job is to prevent loss rode the ten-second status strip instead:
 * "look away for ten seconds and the only evidence of a refused save is gone."
 *
 * Every clause of §7.3 is a claim here. "One line" is the one that needs a test
 * rather than a reading — a notice that stacked would be the toast §7.10 forbids,
 * arrived at by accident.
 */

function column(): HTMLElement {
  const element = document.createElement("div");
  element.className = "md-editor";
  element.append(document.createElement("div"));
  return element;
}

describe("the persistent notice", () => {
  it("puts one line above the content", () => {
    const host = column();

    persistentNotice(host, "This file no longer exists.");

    const line = host.querySelector(PERSISTENT_NOTICE);
    expect(line, "no notice was placed").not.toBeNull();
    // §7.3: "above it". First in the column, so it reads before the document does
    // rather than after it.
    expect(host.firstElementChild).toBe(line);
    expect(line!.textContent).toBe("This file no longer exists.");
  });

  it("replaces rather than stacking", () => {
    const host = column();

    persistentNotice(host, "first");
    persistentNotice(host, "second");

    // §7.3 says *one* line, and §7.10 forbids stacked toasts. Two conditions at
    // once is a real possibility — a file that vanished while a save was refused —
    // and the second message is the newer truth.
    expect(host.querySelectorAll(PERSISTENT_NOTICE)).toHaveLength(1);
    expect(host.querySelector(PERSISTENT_NOTICE)!.textContent).toBe("second");
  });

  it("withdraws when asked, and says nothing when there is nothing to withdraw", () => {
    const host = column();

    // §7.3: "It withdraws when the path reappears" — on the condition clearing,
    // never on a timer. Clearing an absent notice is a no-op rather than an error,
    // because every caller clears on the good path and none of them should have to
    // know whether there was a bad one first.
    clearPersistentNotice(host);
    persistentNotice(host, "gone");
    clearPersistentNotice(host);
    clearPersistentNotice(host);

    expect(host.querySelectorAll(PERSISTENT_NOTICE)).toHaveLength(0);
  });

  it("never carries a button", () => {
    const host = column();

    persistentNotice(host, "This file no longer exists.");

    // §7.3 in as many words. Asserted rather than trusted because the pull towards
    // "…and a Reload button" is exactly what turns a line of text into the chrome
    // §2 spends its whole list forbidding.
    const line = host.querySelector(PERSISTENT_NOTICE)!;
    expect(line.querySelectorAll("button, a, input, [role='button']")).toHaveLength(0);
  });

  it("is the same kind of text as a one-off document notice", () => {
    // Both are §7.10's "a sentence on the canvas". The persistent one differs in
    // when it leaves, not in what it looks like — so it carries the same class and
    // is told apart by an attribute rather than by a second appearance.
    const host = column();
    persistentNotice(host, "standing");

    expect(host.querySelector(PERSISTENT_NOTICE)!.className).toBe(
      documentNotice("one-off").className,
    );
  });
});
