import {
  editorBufferFromRead,
  mountEditorBuffer,
  type BoundedFileRead,
  type MountedEditorBuffer,
} from "@/editor";
import { closeConfirmation } from "@/miniapps/md/close-confirmation";
import { reconcile, saveWouldClobber } from "@/miniapps/md/reconcile";
import type { FileStamp } from "@/platform";
import type { FileResource } from "./resources";
import { setWordWrap, wordWrap } from "./preferences";
import type { Unmount, WorkbenchRuntimeContext } from "./runtime";
import { register, registerCommandTarget } from "./shortcuts";
import type { WorkbenchState } from "./state";
import "./current-file.css";

function activeResource(state: WorkbenchState): FileResource | null {
  const file = state.openFiles.find(({ id }) => id === state.active.fileId);
  return file
    ? {
        projectId: file.projectId,
        worktreeId: file.worktreeId,
        relativePath: file.relativePath,
      }
    : null;
}

function emptyFile(host: HTMLElement): void {
  const message = document.createElement("p");
  message.className = "zd-region-empty";
  message.textContent = "No file selected.";
  host.replaceChildren(message);
}

/** Own the one active editor buffer behind the root workbench's File surface. */
export async function mountCurrentFile(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
): Promise<Unmount> {
  let mounted: MountedEditorBuffer | null = null;
  let active = true;
  let generation = 0;
  let reconciliation = 0;
  let currentResource: FileResource | null = null;
  let known: FileStamp | null = null;
  let notice: HTMLParagraphElement | null = null;
  const surface = document.createElement("div");
  surface.className = "current-file";
  host.replaceChildren(surface);

  const showNotice = (message: string, tone: "info" | "warning" = "info") => {
    if (!notice) return;
    notice.hidden = false;
    notice.dataset.tone = tone;
    notice.textContent = message;
  };
  const clearNotice = () => {
    if (!notice) return;
    notice.hidden = true;
    notice.textContent = "";
    delete notice.dataset.tone;
  };

  const render = (
    resource: FileResource,
    read: BoundedFileRead,
    openedGeneration: number,
    focus: boolean,
  ) => {
    mounted?.destroy();
    mounted = null;
    surface.replaceChildren();
    const buffer = editorBufferFromRead(resource.relativePath, read);
    const diagnosticContext = {
      projectId: resource.projectId,
      worktreeId: resource.worktreeId,
      logicalPath: resource.relativePath,
    };
    mounted = mountEditorBuffer(surface, buffer, {
      wrap: wordWrap(),
      onSave: async (text) => {
        const save = context.instrumentation.startSpan("file.save", diagnosticContext);
        if (!active || openedGeneration !== generation) {
          await save?.end("unavailable");
          return false;
        }
        const onDisk = await context.platform.fileStamp(resource).catch(() => known);
        if (saveWouldClobber(known, onDisk)) {
          showNotice(
            "This file changed on disk. Nothing was written — copy your work, then reopen it.",
            "warning",
          );
          await save?.end("refused");
          return false;
        }
        try {
          await context.platform.writeTextFile(resource, text);
          known = await context.platform.fileStamp(resource).catch(() => null);
          clearNotice();
          await save?.end("ok");
          return true;
        } catch {
          showNotice("Could not save. Your work is still here and still unsaved.", "warning");
          await save?.end("failed");
          return false;
        }
      },
    });
    notice = document.createElement("p");
    notice.className = "current-file-notice";
    notice.hidden = true;
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    surface.append(notice);
    if (focus) mounted.focus();
  };

  const open = async (resource: FileResource | null): Promise<void> => {
    const requested = ++generation;
    reconciliation += 1;
    if (!resource) {
      mounted?.destroy();
      mounted = null;
      currentResource = null;
      known = null;
      notice = null;
      surface.replaceChildren();
      emptyFile(surface);
      return;
    }

    const diagnosticContext = {
      projectId: resource.projectId,
      worktreeId: resource.worktreeId,
      logicalPath: resource.relativePath,
    };
    const span = context.instrumentation.startSpan("file.open", diagnosticContext);
    let read: BoundedFileRead;
    const stamp = context.platform.fileStamp(resource).catch(() => null);
    try {
      read = await context.platform.readBoundedFile(resource);
    } catch {
      read = { status: "unavailable", problem: "The file boundary is unavailable" };
    }
    if (!active || requested !== generation) {
      await span?.end("cancelled");
      return;
    }
    currentResource = resource;
    known = await stamp;
    if (!active || requested !== generation) {
      await span?.end("cancelled");
      return;
    }
    render(resource, read, requested, true);
    await span?.end(read.status === "text" ? "ok" : "unavailable");
  };

  const currentEditor = () => mounted?.editor ?? null;
  const registrations: Unmount[] = [
    registerCommandTarget({
      id: "current-file.find",
      commandId: "file.find",
      priority: 100,
      available: () => currentEditor() !== null,
      run: () => {
        const editor = currentEditor();
        if (!editor) return false;
        editor.find.open();
        return true;
      },
    }),
    registerCommandTarget({
      id: "current-file.close-find",
      commandId: "workbench.escape",
      priority: 300,
      available: () => currentEditor()?.find.isOpen() ?? false,
      run: () => currentEditor()?.find.close() ?? false,
    }),
    registerCommandTarget({
      id: "current-file.drop-caret",
      commandId: "workbench.escape",
      priority: 20,
      available: () => currentEditor()?.hasCaret() ?? false,
      run: () => currentEditor()?.dropCaret() ?? false,
    }),
    registerCommandTarget({
      id: "current-file.focus-mode",
      commandId: "focus.toggle",
      priority: 100,
      available: () => currentEditor() !== null,
      run: () => {
        const editor = currentEditor();
        if (!editor) return false;
        editor.toggleFocus();
        return true;
      },
    }),
    register({
      id: "document.save",
      chord: { key: "s", mod: true },
      description: "Save the current file",
      run: () => {
        void currentEditor()?.save();
        return true;
      },
    }),
    register({
      id: "document.raw",
      chord: { key: "e", mod: true },
      description: "Raw mode: show literal Markdown source",
      available: () => Boolean(currentEditor() && mounted?.buffer.language.markdown),
      run: () => {
        const editor = currentEditor();
        if (!editor || !mounted?.buffer.language.markdown) return false;
        editor.toggleRaw();
        return true;
      },
    }),
    register({
      id: "document.wrap",
      chord: { key: "z", mod: true, alt: true },
      description: "Turn line wrapping on or off",
      available: () => currentEditor() !== null,
      run: () => {
        const editor = currentEditor();
        if (!editor) return false;
        setWordWrap(editor.toggleWrap());
        return true;
      },
    }),
    register({
      id: "document.typewriter",
      chord: { key: "t", mod: true, alt: true },
      description: "Turn Typewriter Mode on or off",
      available: () => currentEditor()?.hasCaret() ?? false,
      run: () => currentEditor()?.toggleTypewriter() ?? false,
    }),
    register({
      id: "document.jumpNext",
      chord: { key: "ArrowDown", alt: true },
      description: "Jump to the next focus block",
      available: () => currentEditor()?.hasCaret() ?? false,
      run: () => currentEditor()?.jumpBlock("next") ?? false,
    }),
    register({
      id: "document.jumpPrevious",
      chord: { key: "ArrowUp", alt: true },
      description: "Jump to the previous focus block",
      available: () => currentEditor()?.hasCaret() ?? false,
      run: () => currentEditor()?.jumpBlock("previous") ?? false,
    }),
  ];

  const stopGuard = context.state.registerTransitionGuard({
    id: "workbench.current-file",
    prepare: ({ from, to }) =>
      from.fileId !== to.fileId && currentEditor()?.isDirty()
        ? { status: "refused", reason: "The current file has unsaved work" }
        : { status: "ready" },
  });
  let fileId = context.state.snapshot().active.fileId;
  const stopState = context.state.subscribe((state) => {
    if (state.active.fileId === fileId) return;
    fileId = state.active.fileId;
    void open(activeResource(state));
  });
  const confirmation = closeConfirmation(host, () => void context.platform.closeWindow());
  const stopClose = context.platform.onCloseRequested(() => {
    if (currentEditor()?.isDirty()) confirmation.show();
    else void context.platform.closeWindow();
  });
  const onFocus = () => {
    const editor = currentEditor();
    const resource = currentResource;
    const expectedGeneration = generation;
    const expectedReconciliation = ++reconciliation;
    if (!editor || !resource) return;

    void (async () => {
      const onDisk = await context.platform.fileStamp(resource).catch(() => known);
      if (!active || expectedGeneration !== generation || expectedReconciliation !== reconciliation)
        return;
      const decision = reconcile({ known, onDisk, dirty: editor.isDirty() });
      if (decision.action === "none") {
        clearNotice();
        return;
      }
      if (decision.action !== "reload") {
        showNotice(decision.notice, "warning");
        return;
      }

      let read: BoundedFileRead;
      try {
        read = await context.platform.readBoundedFile(resource);
      } catch {
        showNotice("This file changed on disk but could not be reloaded.", "warning");
        return;
      }
      if (!active || expectedGeneration !== generation || expectedReconciliation !== reconciliation)
        return;
      if (
        read.status === "text" &&
        mounted !== null &&
        mounted.buffer.content !== null &&
        mounted.buffer.editable === read.writable
      ) {
        editor.setText(read.text);
      } else {
        render(resource, read, expectedGeneration, false);
      }
      known = onDisk;
      showNotice(decision.notice);
    })();
  };
  window.addEventListener("focus", onFocus);

  await open(activeResource(context.state.snapshot()));

  return () => {
    if (!active) return;
    active = false;
    generation += 1;
    reconciliation += 1;
    window.removeEventListener("focus", onFocus);
    stopClose();
    confirmation.dismiss();
    stopState();
    stopGuard();
    for (const unregister of [...registrations].reverse()) unregister();
    mounted?.destroy();
    mounted = null;
    host.replaceChildren();
  };
}
