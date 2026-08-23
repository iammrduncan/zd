import "./command-list.css";

import {
  chordLabel,
  commands,
  executeCommand,
  registerCommandTarget,
  type Command,
} from "./shortcuts";
import type { Unmount } from "./runtime";

/** Mount the command registry's searchable, executable transient surface. */
export function mountCommandList(host: HTMLElement): Unmount {
  let plane: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;

  const close = (): boolean => {
    if (!plane) return false;
    plane.remove();
    plane = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    return true;
  };

  const open = (): boolean => {
    if (plane) return true;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : host;

    const nextPlane = document.createElement("section");
    nextPlane.className = "zd-command-list";
    nextPlane.dataset.commandList = "true";
    nextPlane.setAttribute("role", "dialog");
    nextPlane.setAttribute("aria-modal", "true");
    nextPlane.setAttribute("aria-label", "Command List");

    const column = document.createElement("div");
    column.className = "zd-command-list-column";
    const query = document.createElement("input");
    query.className = "zd-command-list-query";
    query.type = "text";
    query.placeholder = "Type a command";
    query.setAttribute("aria-label", "Filter commands");
    query.setAttribute("aria-controls", "zd-command-list-results");
    query.setAttribute("autocomplete", "off");
    query.setAttribute("spellcheck", "false");
    const results = document.createElement("div");
    results.id = "zd-command-list-results";
    results.className = "zd-command-list-results";
    results.setAttribute("role", "listbox");
    results.setAttribute("aria-label", "Commands");
    column.append(query, results);
    nextPlane.append(column);
    host.append(nextPlane);
    plane = nextPlane;

    let visible: readonly Command[] = [];
    let selected = 0;

    const activate = (command: Command): void => {
      if (!executeCommand(command)) return;
      close();
    };

    const render = (): void => {
      const terms = query.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
      visible = commands().filter((command) => {
        const haystack =
          `${command.description} ${command.id} ${command.chord ? chordLabel(command.chord) : ""}`.toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
      selected = Math.min(selected, Math.max(visible.length - 1, 0));
      results.replaceChildren();

      if (visible.length === 0) {
        const empty = document.createElement("p");
        empty.className = "zd-command-list-empty";
        empty.textContent = "No matching commands";
        results.append(empty);
        query.removeAttribute("aria-activedescendant");
        return;
      }

      visible.forEach((command, index) => {
        const available = command.available ? command.available() : true;
        const option = document.createElement("button");
        option.id = `zd-command-list-option-${index}`;
        option.className = "zd-command-list-option";
        option.type = "button";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === selected));
        option.disabled = !available;
        option.dataset.commandId = command.id;
        const description = document.createElement("span");
        description.textContent = command.description;
        const binding = document.createElement("kbd");
        binding.textContent = command.chord ? chordLabel(command.chord) : "";
        option.append(description, binding);
        option.addEventListener("pointermove", () => {
          if (selected === index) return;
          selected = index;
          render();
        });
        option.addEventListener("click", () => activate(command));
        results.append(option);
      });
      query.setAttribute("aria-activedescendant", `zd-command-list-option-${selected}`);
    };

    query.addEventListener("input", () => {
      selected = 0;
      render();
    });
    query.addEventListener("keydown", (event) => {
      if (visible.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selected = (selected + 1) % visible.length;
        render();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selected = (selected - 1 + visible.length) % visible.length;
        render();
      } else if (event.key === "Enter") {
        event.preventDefault();
        activate(visible[selected]!);
      }
    });

    render();
    query.focus();
    return true;
  };

  const stopOpen = registerCommandTarget({
    id: "workbench.command-list.open",
    commandId: "command.list",
    priority: 100,
    available: () => plane === null,
    run: open,
  });
  const stopDismiss = registerCommandTarget({
    id: "workbench.command-list.dismiss",
    commandId: "workbench.escape",
    priority: 500,
    available: () => plane !== null,
    run: close,
  });

  return () => {
    close();
    stopDismiss();
    stopOpen();
  };
}
