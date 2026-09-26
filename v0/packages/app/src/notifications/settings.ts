import type { AttentionNotificationSettings, CompletionSound } from "./types";

export const supportedAttentionAgents = ["codex", "claude-code", "opencode"] as const;
export const completionSounds = ["subtle", "bright", "gentle"] as const;

export function isCompletionSound(value: unknown): value is CompletionSound {
  return completionSounds.some((sound) => sound === value);
}

export function defaultAttentionSettings(): AttentionNotificationSettings {
  return {
    desktopEnabled: false,
    soundEnabled: false,
    muted: false,
    volume: 0.5,
    agentSounds: {
      codex: "subtle",
      "claude-code": "gentle",
      opencode: "bright",
    },
  };
}
