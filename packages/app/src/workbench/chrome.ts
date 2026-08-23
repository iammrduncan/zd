import { commands, executeCommand } from "./shortcuts";
import type { Unmount } from "./runtime";

/** Populate the reserved native drag strip with its two compact command affordances. */
export function mountWindowChrome(root: ParentNode = document): Unmount {
  const chrome = root.querySelector<HTMLElement>(".zd-window-drag-region");
  if (!chrome) return () => {};

  const action = (label: string, text: string, commandId: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zd-window-chrome-action";
    button.setAttribute("aria-label", label);
    button.textContent = text;
    button.addEventListener("click", () => {
      const command = commands().find(({ id }) => id === commandId);
      if (command) executeCommand(command);
    });
    return button;
  };

  const settings = action("Settings", "[s]", "settings.open");
  const shortcuts = action("Keyboard shortcuts", "[h]", "help.shortcuts");
  chrome.removeAttribute("aria-hidden");
  chrome.setAttribute("role", "toolbar");
  chrome.setAttribute("aria-label", "Window controls");
  chrome.replaceChildren(settings, shortcuts);

  return () => {
    chrome.replaceChildren();
    chrome.removeAttribute("role");
    chrome.removeAttribute("aria-label");
    chrome.setAttribute("aria-hidden", "true");
  };
}
