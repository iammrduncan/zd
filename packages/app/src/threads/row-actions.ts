import type { ThreadsController } from "./controller";
import type { ThreadRecord } from "./types";
import { performThreadAction } from "./view-actions";

export function renderThreadActions(
  wrapper: HTMLElement,
  thread: ThreadRecord,
  controller: ThreadsController,
  status: HTMLElement,
): void {
  const actions = document.createElement("div");
  actions.className = "zd-thread-actions";
  const rename = document.createElement("button");
  rename.type = "button";
  rename.dataset.threadRename = thread.id;
  rename.setAttribute("aria-label", `Rename ${thread.name}`);
  rename.title = `Rename ${thread.name}`;
  rename.textContent = "✎";
  const close = document.createElement("button");
  close.type = "button";
  close.dataset.threadClose = thread.id;
  close.setAttribute("aria-label", `Close ${thread.name}`);
  close.title = `Close ${thread.name}`;
  close.textContent = "×";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.threadRemove = thread.id;
  remove.setAttribute("aria-label", `Remove ${thread.name}`);
  remove.title = `Remove ${thread.name}`;
  remove.textContent = "−";
  actions.append(rename, close, remove);

  const renameForm = document.createElement("form");
  renameForm.className = "zd-thread-rename";
  renameForm.dataset.threadRenameForm = thread.id;
  renameForm.hidden = true;
  const name = document.createElement("input");
  name.value = thread.name;
  name.required = true;
  name.maxLength = 160;
  name.setAttribute("aria-label", `New name for ${thread.name}`);
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  renameForm.append(name, save, cancel);

  rename.addEventListener("click", () => {
    renameForm.hidden = false;
    name.focus();
    name.select();
  });
  cancel.addEventListener("click", () => {
    renameForm.hidden = true;
  });
  renameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void performThreadAction(status, () => controller.renameThread(thread.id, name.value));
  });
  close.addEventListener("click", () => {
    void performThreadAction(status, () => controller.closeThread(thread.id));
  });
  remove.addEventListener("click", () => {
    void performThreadAction(status, () => controller.removeThread(thread.id));
  });
  wrapper.append(actions, renameForm);
}
