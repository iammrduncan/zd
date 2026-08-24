import type { Editor } from "@/editor";
import { setGranularity } from "@/editor/focus";
import {
  workbenchSettingsPreferences,
  type WorkbenchSettingsPreferences,
} from "../settings-preferences";

/** Keep the mounted editor aligned with the durable Reading group. */
export function attachReadingSettings(
  surface: HTMLElement,
  editor: () => Editor | null,
): { readonly apply: () => void; readonly dispose: () => void } {
  const applyPreferences = (preferences: WorkbenchSettingsPreferences): void => {
    const current = editor();
    if (!current) return;
    if (current.isFocusMode() !== preferences.reading.focus) current.toggleFocus();
    if (current.isTypewriter() !== preferences.reading.typewriter) current.toggleTypewriter();
    if (current.isWrapped() !== preferences.reading.wordWrap) current.toggleWrap();
    const column = surface.querySelector<HTMLElement>(".md-editor");
    if (column) setGranularity(column, preferences.reading.granularity);
  };
  const apply = () => applyPreferences(workbenchSettingsPreferences());
  const onChange = (event: Event) => {
    applyPreferences(
      (event as CustomEvent<WorkbenchSettingsPreferences>).detail ?? workbenchSettingsPreferences(),
    );
  };
  window.addEventListener("zd-workbench-settings-change", onChange);
  return {
    apply,
    dispose: () => window.removeEventListener("zd-workbench-settings-change", onChange),
  };
}
