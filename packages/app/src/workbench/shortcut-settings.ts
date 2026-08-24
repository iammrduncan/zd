import "./shortcut-settings.css";

import {
  chordFromEvent,
  chordLabel,
  commandCategories,
  commands,
  resetCommandChord,
  setCommandChord,
} from "./shortcuts";
import { clearShortcutBinding, setShortcutBinding, shortcutBindings } from "./preferences";
import type { Unmount } from "./runtime";

export interface ShortcutSettingsOptions {
  readonly heading?: boolean;
  readonly reference?: boolean;
}

/** Apply durable bindings after every production command has registered. */
export function restoreShortcutBindings(): readonly string[] {
  const notices: string[] = [];
  for (const [commandId, chord] of Object.entries(shortcutBindings())) {
    const result = setCommandChord(commandId, chord);
    if (!result.updated) notices.push(`Shortcut ${commandId}: ${result.problem}`);
  }
  return notices;
}

/** Mount immediate shortcut editing from the same live registry the app dispatches. */
export function mountShortcutSettings(
  host: HTMLElement,
  options: ShortcutSettingsOptions = {},
): Unmount {
  const section = document.createElement("section");
  section.className = "zd-shortcut-settings";
  section.dataset.shortcutSettings = "true";
  const heading = document.createElement("h3");
  heading.textContent = "SHORTCUTS";
  const list = document.createElement("div");
  list.className = "zd-shortcut-settings-list";
  list.setAttribute("role", "table");
  list.setAttribute("aria-label", "Keyboard shortcuts");
  const status = document.createElement("p");
  status.className = "zd-shortcut-settings-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const query = document.createElement("input");
  query.type = "search";
  query.className = "zd-shortcut-settings-filter";
  query.placeholder = "Filter shortcuts";
  query.setAttribute("aria-label", "Filter shortcuts");
  query.setAttribute("autocomplete", "off");
  if (options.heading !== false) section.append(heading);
  if (options.reference) section.append(query);
  section.append(list, status);
  host.append(section);

  const render = (): void => {
    const persisted = shortcutBindings();
    list.replaceChildren();
    const header = document.createElement("div");
    header.className = "zd-shortcut-setting-header";
    header.setAttribute("role", "row");
    for (const label of ["Shortcut", "Command", "Action"]) {
      const column = document.createElement("span");
      column.setAttribute("role", "columnheader");
      column.textContent = label;
      header.append(column);
    }
    list.append(header);
    const terms = query.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    const visible = commands().filter((command) => {
      const category = command.category ?? "Help/System";
      const haystack =
        `${command.description} ${command.id} ${category} ${command.chord ? chordLabel(command.chord) : "Unassigned"}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    for (const category of commandCategories) {
      const categoryCommands = visible
        .filter((command) => (command.category ?? "Help/System") === category)
        .map((command, index) => ({
          command,
          index,
          available: command.available ? command.available() : true,
        }))
        .sort(
          (left, right) =>
            Number(right.available) - Number(left.available) || left.index - right.index,
        );
      if (categoryCommands.length === 0) continue;
      const categoryRow = document.createElement("div");
      categoryRow.className = "zd-shortcut-setting-category";
      categoryRow.setAttribute("role", "row");
      const categoryCell = document.createElement("h3");
      categoryCell.setAttribute("role", "cell");
      categoryCell.textContent = category;
      categoryRow.append(categoryCell);
      list.append(categoryRow);
      for (const { command, available } of categoryCommands) {
        const row = document.createElement("div");
        row.className = options.reference
          ? "zd-shortcut-setting-row zd-reference-row"
          : "zd-shortcut-setting-row";
        row.setAttribute("role", "row");
        row.dataset.category = category;
        row.dataset.available = String(available);
        if (!available) row.setAttribute("aria-disabled", "true");
        const chordCell = document.createElement("span");
        chordCell.className = options.reference
          ? "zd-shortcut-setting-chord zd-reference-chord"
          : "zd-shortcut-setting-chord";
        chordCell.setAttribute("role", "cell");
        const description = document.createElement("span");
        description.className = options.reference ? "zd-reference-description" : "";
        description.setAttribute("role", "cell");
        description.textContent = command.description;
        if (!available) {
          const note = document.createElement("span");
          note.className = "zd-reference-note";
          note.textContent = "not available here";
          description.append(" ", note);
        }
        const actionCell = document.createElement("span");
        actionCell.className = "zd-shortcut-setting-action";
        actionCell.setAttribute("role", "cell");
        const binding = document.createElement("button");
        const currentBinding = command.chord ? chordLabel(command.chord) : "Unassigned";
        binding.type = "button";
        binding.className = "zd-shortcut-setting-binding";
        binding.textContent = currentBinding;
        binding.disabled = command.scope === "global";
        binding.setAttribute(
          "aria-label",
          command.scope === "global"
            ? `${command.description}; ${currentBinding}; managed by the operating system`
            : `Change shortcut for ${command.description}; current ${currentBinding}`,
        );
        binding.addEventListener("click", () => {
          binding.dataset.shortcutRecorder = "true";
          binding.textContent = "Press shortcut";
          status.textContent = `Recording ${command.description}. Press Escape to cancel.`;
        });
        binding.addEventListener("keydown", (event) => {
          if (binding.dataset.shortcutRecorder !== "true") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            delete binding.dataset.shortcutRecorder;
            binding.textContent = currentBinding;
            status.textContent = "Shortcut change cancelled.";
            return;
          }
          const chord = chordFromEvent(event);
          if (!chord) {
            status.textContent = "Use Cmd or Ctrl, or Alt, with a non-modifier key.";
            return;
          }
          const result = setCommandChord(command.id, chord);
          if (!result.updated) {
            status.textContent = result.problem;
            return;
          }
          setShortcutBinding(command.id, chord);
          status.textContent = `${command.description} now uses ${chordLabel(chord)}.`;
          render();
        });
        chordCell.append(binding);

        if (command.scope !== "global" && command.id in persisted) {
          const reset = document.createElement("button");
          reset.type = "button";
          reset.className = "zd-shortcut-setting-reset";
          reset.textContent = "Reset";
          reset.disabled = !(command.id in persisted);
          reset.setAttribute("aria-label", `Reset shortcut for ${command.description}`);
          reset.addEventListener("click", () => {
            const result = resetCommandChord(command.id);
            if (!result.updated) {
              status.textContent = result.problem;
              return;
            }
            clearShortcutBinding(command.id);
            status.textContent = `${command.description} restored to its default.`;
            render();
          });
          actionCell.append(reset);
        } else {
          if (command.scope === "global") {
            const managed = document.createElement("span");
            managed.className = "zd-shortcut-setting-managed";
            managed.textContent = "System managed";
            actionCell.append(managed);
          }
        }

        row.append(chordCell, description, actionCell);
        list.append(row);
      }
    }
    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "zd-shortcut-settings-empty";
      empty.textContent = "No shortcuts match.";
      list.append(empty);
    }
  };

  query.addEventListener("input", render);
  render();
  return () => section.remove();
}
