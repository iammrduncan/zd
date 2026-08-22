import { createEditor, type Editor, type EditorOptions } from "@/miniapps/md/editor/editor";

import type { EditorBuffer } from "./buffer";
import "./surface.css";
import "@/miniapps/md/styles/md.css";
import "@/miniapps/md/styles/content.css";

export interface MountedEditorBuffer {
  readonly buffer: EditorBuffer;
  readonly editor: Editor | null;
  focus(): boolean;
  destroy(): void;
}

export type MountEditorBufferOptions = Omit<EditorOptions, "language" | "readOnly">;

/** Mount one exhaustive buffer state without teaching the shell about CodeMirror. */
export function mountEditorBuffer(
  host: HTMLElement,
  buffer: EditorBuffer,
  options: MountEditorBufferOptions = {},
): MountedEditorBuffer {
  const surface = document.createElement("section");
  surface.className = "editor-buffer md-surface";
  surface.dataset.bufferKind = buffer.kind;
  surface.dataset.hasContent = String(buffer.content !== null);
  surface.setAttribute("role", "region");
  surface.setAttribute(
    "aria-label",
    `${buffer.path}, ${buffer.language.label}${buffer.editable ? "" : ", read-only"}`,
  );

  if (buffer.reason) {
    const reason = document.createElement("p");
    reason.className = "editor-buffer-reason";
    reason.textContent = buffer.reason;
    surface.append(reason);
  }

  let editor: Editor | null = null;
  if (buffer.content !== null) {
    const content = document.createElement("div");
    content.className = "md-editor editor-buffer-content";
    surface.append(content);
    editor = createEditor(content, buffer.content, {
      ...options,
      language: buffer.language,
      readOnly: !buffer.editable,
    });
  }

  host.append(surface);

  return {
    buffer,
    editor,
    focus: () => {
      if (!editor) return false;
      editor.focus();
      return true;
    },
    destroy: () => {
      editor?.destroy();
      surface.remove();
    },
  };
}
