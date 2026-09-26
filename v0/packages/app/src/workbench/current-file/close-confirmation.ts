import type { TransientCoordinator } from "../transients";

/**
 * The one destructive window choice the current-file owner presents.
 *
 * The platform can report that its window was asked to close, but only the
 * document knows whether that would lose work. Keep the choice here as a real
 * dialog with real buttons: WebKit did not present `window.confirm` in the app,
 * which left a refused Cmd+W with nothing visible to act on.
 */
export function closeConfirmation(
  host: HTMLElement,
  closeWindow: () => void,
  transients?: TransientCoordinator,
) {
  let open: HTMLDialogElement | null = null;
  let returnFocus: HTMLElement | null = null;

  const dismiss = (restoreFocus = true) => {
    if (!open) return;
    const dialog = open;
    open = null;
    dialog.close();
    dialog.remove();
    transients?.closed("close-window-confirmation");
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  };

  const show = () => {
    if (open) {
      open.querySelector<HTMLButtonElement>('[data-close-choice="cancel"]')?.focus();
      return;
    }
    if (
      transients &&
      !transients.open("close-window-confirmation", "safety", (restoreFocus) =>
        dismiss(restoreFocus),
      )
    ) {
      return;
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : host;

    const dialog = document.createElement("dialog");
    dialog.className = "current-file-close-confirmation";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "current-file-close-title");
    dialog.setAttribute("aria-describedby", "current-file-close-message");

    const title = document.createElement("h2");
    title.id = "current-file-close-title";
    title.textContent = "Unsaved changes";

    const message = document.createElement("p");
    message.id = "current-file-close-message";
    message.textContent = "This document has unsaved changes. Close without saving?";

    const actions = document.createElement("div");
    actions.className = "current-file-close-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.closeChoice = "cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dismiss());

    const close = document.createElement("button");
    close.type = "button";
    close.dataset.closeChoice = "close";
    close.textContent = "Close";
    close.addEventListener("click", () => {
      dismiss();
      closeWindow();
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismiss();
    });
    actions.append(cancel, close);
    dialog.append(title, message, actions);
    host.append(dialog);
    open = dialog;
    dialog.showModal();
    cancel.focus();
  };

  return { show, dismiss };
}
