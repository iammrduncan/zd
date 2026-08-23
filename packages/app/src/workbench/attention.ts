import "./attention.css";

import {
  completionSounds,
  supportedAttentionAgents,
  type AttentionNotificationAdapter,
  type AttentionNotificationSettings,
  type CompletionSound,
  type NotificationPermission,
  type NotificationRoutingProblem,
  type SupportedAttentionAgent,
} from "@/notifications";
import {
  attentionSettings,
  setAttentionAgentSound,
  setAttentionDesktopEnabled,
  setAttentionMuted,
  setAttentionSoundEnabled,
  setAttentionVolume,
} from "./preferences";
import type { Unmount } from "./runtime";

export interface AttentionSettingsSnapshot {
  readonly settings: AttentionNotificationSettings;
  readonly permission: NotificationPermission;
  readonly transitioning: boolean;
  readonly problem: string | null;
  readonly routingProblem: NotificationRoutingProblem | null;
}

type Listener = (snapshot: AttentionSettingsSnapshot) => void;

function permissionProblem(permission: NotificationPermission): string | null {
  switch (permission) {
    case "denied":
      return "Desktop notifications were denied in system settings.";
    case "unsupported":
      return "Desktop notifications are unavailable on this platform.";
    default:
      return null;
  }
}

/** Immediate, durable Attention settings with native permission as fallible presentation state. */
export class AttentionSettingsController {
  readonly #adapter: AttentionNotificationAdapter;
  readonly #listeners = new Set<Listener>();
  #state: AttentionSettingsSnapshot;

  constructor(adapter: AttentionNotificationAdapter) {
    this.#adapter = adapter;
    this.#state = {
      settings: attentionSettings(),
      permission: "prompt",
      transitioning: false,
      problem: null,
      routingProblem: null,
    };
  }

  snapshot(): AttentionSettingsSnapshot {
    return this.#state;
  }

  subscribe(listener: Listener): Unmount {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async load(): Promise<void> {
    try {
      const permission = await this.#adapter.permission();
      if (permission !== "granted" && this.#state.settings.desktopEnabled) {
        setAttentionDesktopEnabled(false);
      }
      this.#publish({
        ...this.#state,
        permission,
        settings: attentionSettings(),
        problem: permissionProblem(permission),
      });
    } catch (cause) {
      this.#publish({
        ...this.#state,
        permission: "unsupported",
        problem: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  async setDesktopEnabled(enabled: boolean): Promise<void> {
    if (!enabled) {
      setAttentionDesktopEnabled(false);
      this.#publish({
        ...this.#state,
        settings: attentionSettings(),
        transitioning: false,
        problem: permissionProblem(this.#state.permission),
      });
      return;
    }

    this.#publish({ ...this.#state, transitioning: true, problem: null });
    try {
      const permission = await this.#adapter.requestPermission();
      const granted = permission === "granted";
      setAttentionDesktopEnabled(granted);
      this.#publish({
        ...this.#state,
        permission,
        settings: attentionSettings(),
        transitioning: false,
        problem: permissionProblem(permission),
      });
    } catch (cause) {
      setAttentionDesktopEnabled(false);
      this.#publish({
        ...this.#state,
        permission: "unsupported",
        settings: attentionSettings(),
        transitioning: false,
        problem: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  setSoundEnabled(enabled: boolean): void {
    setAttentionSoundEnabled(enabled);
    this.#refreshSettings();
  }

  setMuted(muted: boolean): void {
    setAttentionMuted(muted);
    this.#refreshSettings();
  }

  setVolume(selectedVolume: number): void {
    setAttentionVolume(selectedVolume);
    this.#refreshSettings();
  }

  setAgentSound(agent: SupportedAttentionAgent, sound: CompletionSound): void {
    const before = this.#state.settings;
    setAttentionAgentSound(agent, sound);
    this.#refreshSettings();
    if (
      before.agentSounds[agent] !== sound &&
      before.soundEnabled &&
      !before.muted &&
      before.volume > 0
    ) {
      void this.#adapter.playSound({ sound, volume: before.volume }).catch(() => {
        // Preview failure cannot prevent the durable selection from applying.
      });
    }
  }

  reportRoutingProblem(problem: NotificationRoutingProblem): void {
    this.#publish({ ...this.#state, routingProblem: problem });
  }

  #refreshSettings(): void {
    this.#publish({ ...this.#state, settings: attentionSettings() });
  }

  #publish(next: AttentionSettingsSnapshot): void {
    this.#state = next;
    for (const listener of this.#listeners) listener(next);
  }
}

function row(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "zd-attention-setting-row";
  const name = document.createElement("span");
  name.textContent = labelText;
  label.append(name, control);
  return label;
}

function checkbox(marker: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset[marker] = "true";
  return input;
}

function agentName(agent: SupportedAttentionAgent): string {
  switch (agent) {
    case "codex":
      return "Codex sound";
    case "claude-code":
      return "Claude Code sound";
    case "opencode":
      return "OpenCode sound";
  }
}

/** Mount the Attention group inside the one compact workbench Settings sheet. */
export function mountAttentionSettings(
  host: HTMLElement,
  controller: AttentionSettingsController,
): Unmount {
  const section = document.createElement("section");
  section.className = "zd-attention-settings";
  section.dataset.attentionSettings = "true";
  const heading = document.createElement("h3");
  heading.textContent = "ATTENTION";

  const desktop = checkbox("notificationsToggle");
  const sound = checkbox("soundToggle");
  const muted = checkbox("soundMute");
  const volume = document.createElement("input");
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.step = "5";
  volume.dataset.soundVolume = "true";

  const selects = new Map<SupportedAttentionAgent, HTMLSelectElement>();
  const agentRows = supportedAttentionAgents.map((agent) => {
    const select = document.createElement("select");
    select.dataset.agentSound = agent;
    for (const choice of completionSounds) {
      const option = document.createElement("option");
      option.value = choice;
      option.textContent = choice;
      select.append(option);
    }
    selects.set(agent, select);
    return row(agentName(agent), select);
  });

  const status = document.createElement("p");
  status.className = "zd-attention-status";
  status.dataset.attentionStatus = "true";
  status.setAttribute("aria-live", "polite");
  const routing = document.createElement("p");
  routing.className = "zd-attention-routing-problem";
  routing.dataset.attentionRoutingProblem = "true";
  routing.setAttribute("role", "status");
  routing.setAttribute("aria-live", "polite");

  section.append(
    heading,
    row("Desktop notifications", desktop),
    row("Completion sound", sound),
    row("Mute sounds", muted),
    row("Sound volume", volume),
    ...agentRows,
    status,
    routing,
  );
  host.append(section);

  const render = (snapshot: AttentionSettingsSnapshot) => {
    desktop.checked = snapshot.settings.desktopEnabled;
    desktop.disabled = snapshot.transitioning || snapshot.permission === "unsupported";
    sound.checked = snapshot.settings.soundEnabled;
    muted.checked = snapshot.settings.muted;
    muted.disabled = !snapshot.settings.soundEnabled;
    volume.value = String(Math.round(snapshot.settings.volume * 100));
    volume.disabled = !snapshot.settings.soundEnabled || snapshot.settings.muted;
    for (const [agent, select] of selects) {
      select.value = snapshot.settings.agentSounds[agent];
      select.disabled = !snapshot.settings.soundEnabled || snapshot.settings.muted;
    }
    status.textContent =
      snapshot.problem ??
      (snapshot.settings.desktopEnabled
        ? "Desktop notifications on."
        : snapshot.permission === "granted"
          ? "Desktop notifications off."
          : "Off. Enable to request permission.");
    routing.textContent = snapshot.routingProblem?.summary ?? "";
    routing.hidden = snapshot.routingProblem === null;
  };
  render(controller.snapshot());
  const stop = controller.subscribe(render);

  const onDesktop = () => void controller.setDesktopEnabled(desktop.checked);
  const onSound = () => controller.setSoundEnabled(sound.checked);
  const onMute = () => controller.setMuted(muted.checked);
  const onVolume = () => controller.setVolume(Number(volume.value) / 100);
  const selectHandlers = new Map<HTMLSelectElement, () => void>();
  desktop.addEventListener("change", onDesktop);
  sound.addEventListener("change", onSound);
  muted.addEventListener("change", onMute);
  volume.addEventListener("input", onVolume);
  for (const [agent, select] of selects) {
    const handler = () => controller.setAgentSound(agent, select.value as CompletionSound);
    selectHandlers.set(select, handler);
    select.addEventListener("change", handler);
  }
  void controller.load();

  return () => {
    stop();
    desktop.removeEventListener("change", onDesktop);
    sound.removeEventListener("change", onSound);
    muted.removeEventListener("change", onMute);
    volume.removeEventListener("input", onVolume);
    for (const [select, handler] of selectHandlers) select.removeEventListener("change", handler);
    section.remove();
  };
}
