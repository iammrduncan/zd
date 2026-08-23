import {
  editorBufferFromRead,
  mountEditorBuffer,
  type BoundedFileRead,
  type ClipboardImage,
  type MountedEditorBuffer,
} from "@/editor";
import { screenshotLink } from "./clipboard-image";
import { closeConfirmation } from "./close-confirmation";
import { FileDraftStore } from "./drafts";
import { reconcile, saveWouldClobber } from "./reconcile";
import type { FileStamp } from "@/platform";
import type { FileResource } from "../resources";
import { setWordWrap, wordWrap } from "../preferences";
import type { Unmount, WorkbenchRuntimeContext } from "../runtime";
import { register, registerCommandTarget } from "../shortcuts";
import type { TransitionRecovery, WorkbenchState } from "../state";
import "./styles.css";

export interface MountCurrentFileOptions {
  /** Whether this surface currently owns editor commands. Lifecycle guards remain active. */
  readonly isActive?: () => boolean;
  /** Shared recovery state used by the editor and Files tree. */
  readonly drafts?: FileDraftStore;
}

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
  options: MountCurrentFileOptions = {},
): Promise<Unmount> {
  const drafts = options.drafts ?? new FileDraftStore();
  let mounted: MountedEditorBuffer | null = null;
  let active = true;
  let generation = 0;
  let reconciliation = 0;
  let currentResource: FileResource | null = null;
  let known: FileStamp | null = null;
  let pendingImageSaves = 0;
  let notice: HTMLParagraphElement | null = null;
  const surface = document.createElement("div");
  surface.className = "current-file";
  host.replaceChildren(surface);

  const showNotice = (
    message: string,
    tone: "info" | "warning" = "info",
    recovery?: TransitionRecovery,
  ) => {
    if (!notice) return;
    notice.hidden = false;
    notice.dataset.tone = tone;
    notice.replaceChildren(document.createTextNode(message));
    if (!recovery) return;

    const action = document.createElement("button");
    action.type = "button";
    action.className = "current-file-notice-action";
    action.textContent = recovery.label;
    action.addEventListener("click", () => {
      action.disabled = true;
      void Promise.resolve(recovery.run())
        .catch((cause: unknown) =>
          showNotice(cause instanceof Error ? cause.message : String(cause), "warning"),
        )
        .finally(() => {
          if (action.isConnected) action.disabled = false;
        });
    });
    notice.append(" ", action);
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
    savedText?: string,
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
    const acceptsPastedImages =
      buffer.editable && (buffer.language.markdown || buffer.language.id === "plain-text");
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
          drafts.clear(resource);
          clearNotice();
          await save?.end("ok");
          return true;
        } catch {
          showNotice("Could not save. Your work is still here and still unsaved.", "warning");
          await save?.end("failed");
          return false;
        }
      },
      ...(savedText === undefined ? {} : { savedText }),
      onTextChange: (text, dirty) => {
        if (dirty) drafts.save(resource, text);
        else drafts.clear(resource);
      },
      ...(acceptsPastedImages
        ? {
            onPasteImage: async (image: ClipboardImage) => {
              pendingImageSaves += 1;
              const paste = context.instrumentation.startSpan(
                "file.paste-image",
                diagnosticContext,
              );
              try {
                const saved = await context.platform.saveClipboardImage({
                  projectId: resource.projectId,
                  worktreeId: resource.worktreeId,
                  mediaType: image.mediaType,
                  bytes: image.bytes,
                });
                clearNotice();
                await paste?.end("ok");
                return screenshotLink(resource.relativePath, saved.relativePath);
              } catch (error) {
                await paste?.end("failed");
                throw error;
              } finally {
                pendingImageSaves -= 1;
              }
            },
            onPasteImageProblem: () =>
              showNotice(
                "The screenshot could not be saved. The document was not changed.",
                "warning",
              ),
          }
        : {}),
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
    const draft = drafts.get(resource);
    let savedText: string | undefined;
    if (draft && read.status === "text" && read.writable) {
      if (draft.text === read.text) {
        drafts.clear(resource);
      } else {
        savedText = read.text;
        read = {
          ...read,
          text: draft.text,
          byteLength: new TextEncoder().encode(draft.text).byteLength,
        };
      }
    }
    render(resource, read, requested, true, savedText);
    await span?.end(read.status === "text" ? "ok" : "unavailable");
  };

  const currentEditor = () => mounted?.editor ?? null;
  const ownsCommands = options.isActive ?? (() => true);
  const commandEditor = () => (ownsCommands() ? currentEditor() : null);
  const registrations: Unmount[] = [
    registerCommandTarget({
      id: "current-file.find",
      commandId: "file.find",
      priority: 100,
      available: () => commandEditor() !== null,
      run: () => {
        const editor = commandEditor();
        if (!editor) return false;
        editor.find.open();
        return true;
      },
    }),
    registerCommandTarget({
      id: "current-file.close-find",
      commandId: "workbench.escape",
      priority: 300,
      available: () => commandEditor()?.find.isOpen() ?? false,
      run: () => commandEditor()?.find.close() ?? false,
    }),
    registerCommandTarget({
      id: "current-file.drop-caret",
      commandId: "workbench.escape",
      priority: 20,
      available: () => commandEditor()?.hasCaret() ?? false,
      run: () => commandEditor()?.dropCaret() ?? false,
    }),
    registerCommandTarget({
      id: "current-file.focus-mode",
      commandId: "focus.toggle",
      priority: 100,
      available: () => commandEditor() !== null,
      run: () => {
        const editor = commandEditor();
        if (!editor) return false;
        editor.toggleFocus();
        return true;
      },
    }),
    register({
      id: "document.save",
      chord: { key: "s", mod: true },
      description: "Save the current file",
      available: () => commandEditor() !== null,
      run: () => {
        const editor = commandEditor();
        if (!editor) return false;
        void editor.save();
        return true;
      },
    }),
    register({
      id: "document.raw",
      chord: { key: "e", mod: true },
      description: "Raw mode: show literal Markdown source",
      available: () => Boolean(commandEditor() && mounted?.buffer.language.markdown),
      run: () => {
        const editor = commandEditor();
        if (!editor || !mounted?.buffer.language.markdown) return false;
        editor.toggleRaw();
        return true;
      },
    }),
    register({
      id: "document.wrap",
      chord: { key: "z", mod: true, alt: true },
      description: "Turn line wrapping on or off",
      available: () => commandEditor() !== null,
      run: () => {
        const editor = commandEditor();
        if (!editor) return false;
        setWordWrap(editor.toggleWrap());
        return true;
      },
    }),
    register({
      id: "document.typewriter",
      chord: { key: "t", mod: true, alt: true },
      description: "Turn Typewriter Mode on or off",
      available: () => commandEditor()?.hasCaret() ?? false,
      run: () => commandEditor()?.toggleTypewriter() ?? false,
    }),
    register({
      id: "document.jumpNext",
      chord: { key: "ArrowDown", alt: true },
      description: "Jump to the next focus block",
      available: () => commandEditor()?.hasCaret() ?? false,
      run: () => commandEditor()?.jumpBlock("next") ?? false,
    }),
    register({
      id: "document.jumpPrevious",
      chord: { key: "ArrowUp", alt: true },
      description: "Jump to the previous focus block",
      available: () => commandEditor()?.hasCaret() ?? false,
      run: () => commandEditor()?.jumpBlock("previous") ?? false,
    }),
  ];

  const stopGuard = context.state.registerTransitionGuard({
    id: "workbench.current-file",
    prepare: ({ from, to }) => {
      if (from.fileId === to.fileId) return { status: "ready" };
      if (pendingImageSaves > 0) {
        const reason = "A pasted screenshot is still being saved";
        showNotice(reason, "warning");
        return { status: "refused", reason, presentation: "owner" };
      }
      return { status: "ready" };
    },
  });
  let fileId = context.state.snapshot().active.fileId;
  const stopState = context.state.subscribe((state) => {
    if (state.active.fileId === fileId) return;
    fileId = state.active.fileId;
    void open(activeResource(state));
  });
  const confirmation = closeConfirmation(host, () => void context.platform.closeWindow());
  const stopClose = context.platform.onCloseRequested(() => {
    if (pendingImageSaves > 0) {
      showNotice("Wait for the pasted screenshot to finish saving before closing.", "warning");
    } else if (currentEditor()?.isDirty()) confirmation.show();
    else void context.platform.closeWindow();
  });
  const onFocus = () => {
    const editor = currentEditor();
    const resource = currentResource;
    const expectedGeneration = generation;
    const expectedReconciliation = ++reconciliation;
    if (!editor || !resource || pendingImageSaves > 0) return;

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
  const focusCurrentFile = () => {
    mounted?.focus();
  };
  host.addEventListener("focus", focusCurrentFile);

  await open(activeResource(context.state.snapshot()));

  return () => {
    if (!active) return;
    active = false;
    drafts.flush();
    generation += 1;
    reconciliation += 1;
    host.removeEventListener("focus", focusCurrentFile);
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
