/**
 * The one destructive window choice the document owns.
 *
 * The platform can report that its window was asked to close, but only the
 * document knows whether that would lose work. Keep the choice here as a real
 * dialog with real buttons: WebKit did not present `window.confirm` in the app,
 * which left a refused Cmd+W with nothing visible to act on.
 */
export function closeConfirmation(host: HTMLElement, closeWindow: () => void) {
  let open: HTMLDialogElement | null = null;

  const dismiss = () => {
    if (!open) return;
    const dialog = open;
    open = null;
    dialog.close();
    dialog.remove();
  };

  const show = () => {
    if (open) {
      open.querySelector<HTMLButtonElement>('[data-close-choice="cancel"]')?.focus();
      return;
    }

    const dialog = document.createElement("dialog");
    dialog.className = "md-close-confirmation";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "md-close-title");
    dialog.setAttribute("aria-describedby", "md-close-message");

    const title = document.createElement("h2");
    title.id = "md-close-title";
    title.textContent = "Unsaved changes";

    const message = document.createElement("p");
    message.id = "md-close-message";
    message.textContent = "This document has unsaved changes. Close without saving?";

    const actions = document.createElement("div");
    actions.className = "md-close-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.closeChoice = "cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", dismiss);

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
