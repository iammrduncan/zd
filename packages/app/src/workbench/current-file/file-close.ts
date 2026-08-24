import type { TransientCoordinator } from "../transients";

interface FileCloseOptions {
  readonly host: HTMLElement;
  readonly relativePath: string;
  readonly isDirty: () => boolean;
  readonly canClose: () => boolean;
  readonly close: (discard: boolean) => void;
  readonly transients?: TransientCoordinator;
}

/** One file-lifecycle action, with the destructive choice kept behind confirmation. */
export function fileCloseAction(options: FileCloseOptions): {
  readonly button: HTMLButtonElement;
  readonly dismiss: () => void;
} {
  const transientId = "current-file-close-confirmation";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "×";
  button.title = "Close file";
  button.setAttribute("aria-label", `Close ${options.relativePath}`);
  let dialog: HTMLDialogElement | null = null;

  const dismiss = (restoreFocus = true): void => {
    if (!dialog) return;
    const current = dialog;
    dialog = null;
    current.close();
    current.remove();
    options.transients?.closed(transientId);
    if (restoreFocus && button.isConnected) button.focus({ preventScroll: true });
  };

  const confirmDiscard = (): void => {
    if (dialog) {
      dialog.querySelector<HTMLButtonElement>('[data-file-close-choice="cancel"]')?.focus();
      return;
    }
    if (
      options.transients &&
      !options.transients.open(transientId, "safety", (restoreFocus) => dismiss(restoreFocus))
    ) {
      return;
    }

    const confirmation = document.createElement("dialog");
    confirmation.className = "current-file-close-confirmation";
    confirmation.setAttribute("role", "alertdialog");
    confirmation.setAttribute("aria-modal", "true");
    confirmation.setAttribute("aria-labelledby", "current-file-discard-title");
    confirmation.setAttribute("aria-describedby", "current-file-discard-message");
    const title = document.createElement("h2");
    title.id = "current-file-discard-title";
    title.textContent = "Unsaved changes";
    const message = document.createElement("p");
    message.id = "current-file-discard-message";
    message.textContent = `Close ${options.relativePath} without saving?`;
    const actions = document.createElement("div");
    actions.className = "current-file-close-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.fileCloseChoice = "cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dismiss());
    const discard = document.createElement("button");
    discard.type = "button";
    discard.dataset.fileCloseChoice = "discard";
    discard.textContent = "Close without Saving";
    discard.addEventListener("click", () => {
      dismiss(false);
      options.close(true);
    });
    confirmation.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismiss();
    });
    actions.append(cancel, discard);
    confirmation.append(title, message, actions);
    options.host.append(confirmation);
    dialog = confirmation;
    confirmation.showModal();
    cancel.focus();
  };

  button.addEventListener("click", () => {
    if (!options.canClose()) return;
    if (options.isDirty()) confirmDiscard();
    else options.close(false);
  });

  return { button, dismiss: () => dismiss(false) };
}
