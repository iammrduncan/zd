import "./shortcut-settings.css";

import {
  chordFromEvent,
  chordLabel,
  commands,
  resetCommandChord,
  setCommandChord,
} from "./shortcuts";
import { clearShortcutBinding, setShortcutBinding, shortcutBindings } from "./preferences";
import type { Unmount } from "./runtime";

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
export function mountShortcutSettings(host: HTMLElement): Unmount {
  const section = document.createElement("section");
  section.className = "zd-shortcut-settings";
  section.dataset.shortcutSettings = "true";
  const heading = document.createElement("h3");
  heading.textContent = "SHORTCUTS";
  const list = document.createElement("div");
  list.className = "zd-shortcut-settings-list";
  const status = document.createElement("p");
  status.className = "zd-shortcut-settings-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  section.append(heading, list, status);
  host.append(section);

  const render = (): void => {
    const persisted = shortcutBindings();
    list.replaceChildren();
    for (const command of commands()) {
      const row = document.createElement("div");
      row.className = "zd-shortcut-setting-row";
      const description = document.createElement("span");
      description.textContent = command.description;
      const controls = document.createElement("span");
      controls.className = "zd-shortcut-setting-controls";
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
      controls.append(binding);

      if (command.scope !== "global") {
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
        controls.append(reset);
      }

      row.append(description, controls);
      list.append(row);
    }
  };

  render();
  return () => section.remove();
}
