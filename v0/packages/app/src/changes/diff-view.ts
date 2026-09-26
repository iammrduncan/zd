import "./diff-view.css";

import {
  editorBufferFromRead,
  mountEditorBuffer,
  type BoundedFileRead,
  type MountedEditorBuffer,
} from "@/editor";
import type { GitDiffBuffer } from "@/git";
import { registerCommandTarget } from "@/workbench/shortcuts";

import type { ChangesController } from "./controller";

export interface MountChangesDiffOptions {
  readonly isActive?: () => boolean;
}

interface DiffSide {
  readonly root: HTMLElement;
  readonly heading: HTMLElement;
  readonly content: HTMLElement;
  mounted: MountedEditorBuffer | null;
}

interface DiffElements {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly status: HTMLParagraphElement;
  readonly panes: HTMLElement;
  readonly base: DiffSide;
  readonly head: DiffSide;
}

function side(name: "base" | "head"): DiffSide {
  const root = document.createElement("section");
  root.className = "zd-diff-side";
  root.dataset.diffSide = name;
  root.setAttribute("aria-label", name === "base" ? "Before revision" : "After revision");
  const heading = document.createElement("h3");
  heading.className = "zd-diff-side-heading";
  const content = document.createElement("div");
  content.className = "zd-diff-content";
  root.append(heading, content);
  return { root, heading, content, mounted: null };
}

function elements(): DiffElements {
  const root = document.createElement("section");
  root.className = "zd-diff";
  root.setAttribute("aria-label", "Read-only file comparison");
  const toolbar = document.createElement("header");
  toolbar.className = "zd-diff-toolbar";
  const title = document.createElement("h2");
  title.className = "zd-diff-title";
  title.textContent = "FILE COMPARISON";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "zd-diff-close";
  close.setAttribute("aria-label", "Close file comparison");
  close.textContent = "Close";
  toolbar.append(title, close);
  const status = document.createElement("p");
  status.className = "zd-diff-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const panes = document.createElement("div");
  panes.className = "zd-diff-panes";
  const base = side("base");
  const head = side("head");
  panes.append(base.root, head.root);
  root.append(toolbar, status, panes);
  return { root, title, close, status, panes, base, head };
}

function revisionLabel(revision: string): string {
  if (revision === "working-tree") return "Working tree";
  if (revision === "index") return "Index";
  if (revision === "missing") return "Missing";
  return revision.length > 12 ? revision.slice(0, 8) : revision;
}

function boundedRead(buffer: GitDiffBuffer): BoundedFileRead {
  switch (buffer.status) {
    case "text":
      return {
        status: "text",
        text: buffer.text,
        byteLength: buffer.byteLength,
        writable: false,
        reason: `${revisionLabel(buffer.revision)} snapshot is read-only`,
      };
    case "binary":
      return { status: "binary", byteLength: buffer.byteLength };
    case "undecodable":
      return { status: "undecodable", byteLength: buffer.byteLength };
    case "missing":
      return { status: "missing" };
    case "denied":
      return { status: "denied" };
    case "over-limit":
      return {
        status: "over-limit",
        byteLength: buffer.byteLength,
        limit: buffer.limit,
        preview: buffer.preview,
      };
    case "unavailable":
      return { status: "unavailable", problem: buffer.problem };
  }
}

function destroySide(side: DiffSide): void {
  side.mounted?.destroy();
  side.mounted = null;
  side.content.replaceChildren();
}

function mountSide(side: DiffSide, buffer: GitDiffBuffer): void {
  destroySide(side);
  side.heading.textContent = `${buffer.path} · ${revisionLabel(buffer.revision)}`;
  side.mounted = mountEditorBuffer(
    side.content,
    editorBufferFromRead(buffer.path, boundedRead(buffer), buffer.identity),
  );
}

function renderKey(controller: ChangesController): string {
  const snapshot = controller.snapshot();
  return JSON.stringify([
    snapshot.selectedChangeId,
    snapshot.diffLoading,
    snapshot.diff?.availability,
    snapshot.diff?.base.identity,
    snapshot.diff?.head.identity,
    snapshot.diff?.problem,
    snapshot.problem,
  ]);
}

/** Mount one side-by-side, read-only comparison without replacing the live editor buffer. */
export function mountChangesDiff(
  host: HTMLElement,
  controller: ChangesController,
  options: MountChangesDiffOptions = {},
): () => void {
  const ui = elements();
  const isActive = options.isActive ?? (() => true);
  host.append(ui.root);
  let key = "";

  const render = () => {
    const nextKey = renderKey(controller);
    if (key === nextKey) return;
    key = nextKey;
    const snapshot = controller.snapshot();
    const visible =
      snapshot.selectedChangeId !== null || snapshot.diffLoading || snapshot.diff !== null;
    ui.root.hidden = !visible;
    ui.close.disabled = !visible;
    destroySide(ui.base);
    destroySide(ui.head);

    if (!visible) {
      ui.status.textContent = "";
      ui.panes.hidden = true;
      return;
    }
    if (snapshot.diffLoading) {
      ui.status.textContent = "Loading comparison…";
      ui.panes.hidden = true;
      return;
    }
    if (!snapshot.diff || snapshot.diff.availability !== "available") {
      ui.status.textContent =
        snapshot.diff?.problem ?? snapshot.problem ?? "This comparison is unavailable.";
      ui.panes.hidden = true;
      return;
    }
    ui.status.textContent = snapshot.diff.problem ?? "";
    ui.status.hidden = ui.status.textContent.length === 0;
    ui.panes.hidden = false;
    mountSide(ui.base, snapshot.diff.base);
    mountSide(ui.head, snapshot.diff.head);
  };

  const editors = () => [ui.base.mounted?.editor, ui.head.mounted?.editor].filter(Boolean);
  const focusedEditor = () => {
    const activeElement = document.activeElement;
    if (activeElement && ui.base.root.contains(activeElement))
      return ui.base.mounted?.editor ?? null;
    if (activeElement && ui.head.root.contains(activeElement))
      return ui.head.mounted?.editor ?? null;
    return ui.head.mounted?.editor ?? ui.base.mounted?.editor ?? null;
  };
  const openFind = registerCommandTarget({
    id: "changes-diff.find",
    commandId: "file.find",
    priority: 250,
    available: () => isActive() && focusedEditor() !== null,
    run: () => {
      const editor = focusedEditor();
      if (!isActive() || !editor) return false;
      editor.find.open();
      return true;
    },
  });
  const closeFind = registerCommandTarget({
    id: "changes-diff.close-find",
    commandId: "workbench.escape",
    priority: 330,
    available: () => isActive() && editors().some((editor) => editor?.find.isOpen()),
    run: () => {
      if (!isActive()) return false;
      const editor = focusedEditor();
      if (editor?.find.isOpen()) return editor.find.close();
      const open = editors().find((candidate) => candidate?.find.isOpen());
      return open?.find.close() ?? false;
    },
  });
  const closeDiff = registerCommandTarget({
    id: "changes-diff.close",
    commandId: "workbench.escape",
    priority: 230,
    available: () => isActive() && controller.snapshot().selectedChangeId !== null,
    run: () => {
      if (!isActive() || controller.snapshot().selectedChangeId === null) return false;
      controller.closeDiff();
      return true;
    },
  });
  const onClose = () => controller.closeDiff();
  ui.close.addEventListener("click", onClose);
  const stop = controller.subscribe(render);
  render();

  return () => {
    stop();
    closeDiff();
    closeFind();
    openFind();
    ui.close.removeEventListener("click", onClose);
    destroySide(ui.base);
    destroySide(ui.head);
    ui.root.remove();
  };
}
