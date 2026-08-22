import {
  editorBufferFromRead,
  mountEditorBuffer,
  type BoundedFileRead,
  type MountedEditorBuffer,
} from "@/editor";
import { closeConfirmation } from "@/miniapps/md/close-confirmation";
import type { FileResource } from "./resources";
import { setWordWrap, wordWrap } from "./preferences";
import type { Unmount, WorkbenchRuntimeContext } from "./runtime";
import { register, registerCommandTarget } from "./shortcuts";
import type { WorkbenchState } from "./state";

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

  const open = async (resource: FileResource | null): Promise<void> => {
    const requested = ++generation;
    if (!resource) {
      mounted?.destroy();
      mounted = null;
      emptyFile(host);
      return;
    }

    const diagnosticContext = {
      projectId: resource.projectId,
      worktreeId: resource.worktreeId,
      logicalPath: resource.relativePath,
    };
    const span = context.instrumentation.startSpan("file.open", diagnosticContext);
    let read: BoundedFileRead;
    try {
      read = await context.platform.readBoundedFile(resource);
    } catch {
      read = { status: "unavailable", problem: "The file boundary is unavailable" };
    }
    if (!active || requested !== generation) return;

    mounted?.destroy();
    mounted = null;
    host.replaceChildren();
    const buffer = editorBufferFromRead(resource.relativePath, read);
    mounted = mountEditorBuffer(host, buffer, {
      wrap: wordWrap(),
      onSave: async (text) => {
        const save = context.instrumentation.startSpan("file.save", diagnosticContext);
        try {
          await context.platform.writeTextFile(resource, text);
          await save?.end("ok");
        } catch (cause) {
          await save?.end("failed");
          throw cause;
        }
      },
    });
    mounted.focus();
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

  await open(activeResource(context.state.snapshot()));

  return () => {
    if (!active) return;
    active = false;
    generation += 1;
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
