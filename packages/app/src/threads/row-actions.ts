import type { ThreadsController } from "./controller";
import type { ThreadRecord } from "./types";
import { performThreadAction } from "./view-actions";

export interface ThreadRenameControl {
  readonly begin: (returnFocus: HTMLElement) => void;
}

export function renderThreadRename(
  wrapper: HTMLElement,
  thread: ThreadRecord,
  controller: ThreadsController,
  status: HTMLElement,
): ThreadRenameControl {
  const renameForm = document.createElement("form");
  renameForm.className = "zd-thread-rename";
  renameForm.dataset.threadRenameForm = thread.id;
  renameForm.dataset.threadRenameInline = "true";
  renameForm.hidden = true;
  const name = document.createElement("input");
  name.value = thread.name;
  name.required = true;
  name.maxLength = 160;
  name.setAttribute("aria-label", `New name for ${thread.name}`);
  renameForm.append(name);

  let returnFocus: HTMLElement | null = null;
  const begin = (nextReturnFocus: HTMLElement) => {
    returnFocus = nextReturnFocus;
    name.value = thread.name;
    renameForm.hidden = false;
    name.focus();
    name.select();
  };
  name.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    name.value = thread.name;
    renameForm.hidden = true;
    returnFocus?.focus();
  });
  renameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextName = name.value.trim();
    if (!nextName) return;
    renameForm.hidden = true;
    if (nextName === thread.name) return;
    void performThreadAction(status, () => controller.renameThread(thread.id, nextName));
  });
  wrapper.append(renameForm);
  return { begin };
}
