import { describe, expect, it } from "vitest";

import { EditorView } from "@codemirror/view";

import { createEditor, type EditorOptions } from "@/editor";

// The interface, not the library. What CodeMirror does with a keystroke is
// CodeMirror's business and is measured in a real engine — see
// tests/e2e/editor/surface.spec.ts. What matters here is that the handle stays
// four methods wide and that tearing it down leaves nothing behind.

function mount(doc: string) {
  const host = document.createElement("div");
  document.body.append(host);
  return { host, editor: createEditor(host, doc) };
}

describe("the editing surface", () => {
  it("holds the document it was given", () => {
    const { editor } = mount("# Title\n\nA paragraph.");
    expect(editor.text()).toBe("# Title\n\nA paragraph.");
  });

  it("keeps an empty document empty rather than inventing a line", () => {
    const { editor } = mount("");
    expect(editor.text()).toBe("");
  });

  it("puts an editable surface in the element it was handed", () => {
    const { host } = mount("text");
    expect(host.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");
  });

  it("leaves the host empty when destroyed", () => {
    // The mini app's unmount depends on this: an editor that outlives its
    // surface goes on holding key handlers over a document nobody can see.
    const { host, editor } = mount("text");
    expect(host.children.length).toBeGreaterThan(0);

    editor.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("reports where the caret is", () => {
    const { editor } = mount("text");
    expect(editor.hasFocus()).toBe(false);
  });

  it("makes a read-only buffer selectable but not editable", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const editor = createEditor(host, "fixed", { readOnly: true });

    expect(host.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
    expect(editor.isReadOnly()).toBe(true);
  });
});

// Vision §6.3: "`cmd+s` saves." Where it saves to is not the editor's business
// — it holds text and a caret, not a path — so what is asserted here is that the
// key reaches a handler with the current document. The atomic write itself is on
// the other side of the platform boundary and is tested in src-tauri/src/fs.rs
// against a real filesystem, because that is the only place it means anything.

describe("saving", () => {
  // No chord here any more. §7.1 gives every binding to the suite's one registry,
  // so the editor exposes `save()` and the registry decides which key reaches it
  // — which is also why cmd+s now works when the window is focused but the caret
  // is not. The chord itself is covered in shortcuts.test.ts, and md wiring it to
  // a real path is covered in reader.test.ts.
  function editor(doc: string, onSave?: EditorOptions["onSave"]) {
    const host = document.createElement("div");
    document.body.append(host);
    return { host, document_: createEditor(host, doc, onSave ? { onSave } : {}) };
  }

  /**
   * Put text in the document the way a person would, near enough.
   *
   * Through `EditorView.findFromDOM`, which is CodeMirror's own documented way
   * back to a view from the element it built — not a hook added to the product
   * for a test. Real typing needs a real engine and is covered in
   * tests/e2e/editor/surface.spec.ts; what is needed here is only that the buffer
   * genuinely differs from what was last written, because every assertion below
   * is vacuous on a document that is already clean.
   */
  function type(host: HTMLElement, text: string) {
    const view = EditorView.findFromDOM(host)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  }

  it("hands the current document to the save handler", async () => {
    const saved: string[] = [];
    await editor("# Title", (text) => {
      saved.push(text);
    }).document_.save();

    expect(saved).toEqual(["# Title"]);
  });

  it("does nothing at all when no handler was given", () => {
    // An editor with nowhere to save is a real state — the dev fixture is one —
    // and saving in it must be a quiet no-op rather than an exception.
    expect(() => editor("text").document_.save()).not.toThrow();
  });

  it("never saves through a read-only buffer", async () => {
    const saved: string[] = [];
    const host = document.createElement("div");
    document.body.append(host);
    const document_ = createEditor(host, "fixed", {
      readOnly: true,
      onSave: (text) => {
        saved.push(text);
      },
    });

    await document_.save();

    expect(saved).toEqual([]);
    expect(document_.isDirty()).toBe(false);
  });

  /*
   * §6.3's whole point is that what you wrote is still there, and "saved" is the
   * claim the editor makes about that. So the claim has to be made *after* the
   * write, by whoever actually wrote — not before it, by whoever asked.
   *
   * Filed as audit H1 and it is a regression: the clobber refusal and the async
   * write landed 2026-08-01 and `save()` still marked the buffer clean first, so
   * every failure path lied. A refused save, a full disk, a read-only file — the
   * strip said "saved", `cmd+i` agreed, and quitting lost the work.
   */
  it("stays dirty when the write fails", async () => {
    const { host, document_ } = editor("# Title", () => Promise.reject(new Error("disk full")));
    type(host, " more");
    expect(document_.isDirty(), "typing did not make it dirty").toBe(true);

    await document_.save();

    // The assertion the audit asked for, and the whole contract in one line.
    expect(document_.isDirty(), "a failed write reported the document as saved").toBe(true);
  });

  it("stays dirty when the save is refused rather than failing", async () => {
    // The clobber refusal resolves rather than rejects — it is a decision, not an
    // error — so "did it throw" is the wrong question. The handler says whether
    // the bytes reached the disk.
    const { host, document_ } = editor("# Title", () => Promise.resolve(false));
    type(host, " more");

    await document_.save();

    expect(document_.isDirty(), "a refused save reported the document as saved").toBe(true);
  });

  it("becomes clean when the write succeeds", async () => {
    // The control. Both assertions above are "still dirty", which is trivially
    // true of an editor that never becomes clean at all.
    const { host, document_ } = editor("# Title", () => Promise.resolve());
    type(host, " more");

    await document_.save();

    expect(document_.isDirty()).toBe(false);
  });

  it("serialises saves so two in a row do not race", async () => {
    /*
     * Audit H1's third path: each save does stamp-check, write, re-stamp with no
     * serialisation, so a second save can stamp the disk after the first wrote
     * but before the baseline updated — and the user gets a spurious "this file
     * changed on disk" warning for their own write.
     */
    const order: string[] = [];
    let release!: () => void;
    // The gate exists before either save does, so the test never depends on when
    // a handler's microtask happens to run — the first version released it
    // synchronously, before the handler had created it, and deadlocked.
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let held = false;
    const { host, document_ } = editor("# Title", async (text) => {
      order.push(`start:${text.length}`);
      if (!held) {
        held = true;
        await gate;
      }
      order.push(`end:${text.length}`);
    });

    type(host, "a");
    const first = document_.save();
    type(host, "b");
    const second = document_.save();

    release();
    await Promise.all([first, second]);

    // Never two starts before a matching end. Interleaving is the race.
    expect(order[0]!.startsWith("start:")).toBe(true);
    expect(order[1]!.startsWith("end:"), `writes overlapped: ${order.join(" ")}`).toBe(true);
  });
});
