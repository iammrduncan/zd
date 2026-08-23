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
  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.threadRemove = thread.id;
  remove.setAttribute("aria-label", `Remove ${thread.name}`);
  remove.title = `Remove ${thread.name}`;
  remove.textContent = "×";
  actions.append(rename, remove);

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

  rename.addEventListener("click", () => {
    name.value = thread.name;
    renameForm.hidden = false;
    name.focus();
    name.select();
  });
  name.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    name.value = thread.name;
    renameForm.hidden = true;
    rename.focus();
  });
  renameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextName = name.value.trim();
    if (!nextName) return;
    renameForm.hidden = true;
    if (nextName === thread.name) return;
    void performThreadAction(status, () => controller.renameThread(thread.id, nextName));
  });
  remove.addEventListener("click", () => {
    void performThreadAction(status, () => controller.removeThread(thread.id));
  });
  wrapper.append(actions, renameForm);
}
