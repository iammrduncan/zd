import type { ThreadAgent, ThreadAttentionEventV1, ThreadWorkbenchSnapshot } from "@/threads";
import type { TransitionResult } from "@/workbench/state";

export const NOTIFICATION_SCHEMA_VERSION = 1 as const;

export type NotificationPermission = "granted" | "denied" | "prompt" | "unsupported";
export type NotificationAction = "view" | "close";
export type CompletionSound = "subtle" | "bright" | "gentle";
export type SupportedAttentionAgent = Extract<ThreadAgent, "codex" | "claude-code" | "opencode">;

/** The complete native presentation payload. Content, paths, and executable input cannot fit. */
export interface ThreadNotificationRequestV1 {
  readonly schemaVersion: typeof NOTIFICATION_SCHEMA_VERSION;
  readonly notificationId: string;
  readonly eventId: string;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly threadId: string;
  readonly title: "zd";
  readonly body: string;
}

/** A native action returns only the stable target identities from its closed request. */
export interface NotificationActionV1 {
  readonly schemaVersion: typeof NOTIFICATION_SCHEMA_VERSION;
  readonly notificationId: string;
  readonly action: NotificationAction;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly threadId: string;
}

export interface CompletionSoundRequest {
  readonly sound: CompletionSound;
  readonly volume: number;
}

export type NotificationPresentationResult =
  | { readonly status: "presented"; readonly problem: null }
  | {
      readonly status: "denied" | "unsupported" | "failed";
      readonly problem: string | null;
    };

export type CompletionSoundResult =
  | { readonly status: "played"; readonly problem: null }
  | { readonly status: "unsupported" | "failed"; readonly problem: string | null };

export interface AttentionNotificationAdapter {
  permission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  show(request: ThreadNotificationRequestV1): Promise<NotificationPresentationResult>;
  onAction(listener: (action: NotificationActionV1) => void): () => void;
  playSound(request: CompletionSoundRequest): Promise<CompletionSoundResult>;
}

export interface AttentionNotificationSettings {
  readonly desktopEnabled: boolean;
  readonly soundEnabled: boolean;
  readonly muted: boolean;
  readonly volume: number;
  readonly agentSounds: Readonly<Record<SupportedAttentionAgent, CompletionSound>>;
}

export interface AttentionThreadSource {
  snapshot(): ThreadWorkbenchSnapshot;
  subscribeAttention(listener: (event: ThreadAttentionEventV1) => void): () => void;
  activateThread(threadId: string): Promise<TransitionResult>;
}

export interface AttentionWindowSource {
  isFocused(): boolean;
  targetThreadOwnsFocus(threadId: string): boolean;
  showWorkbench(): Promise<unknown>;
}

export interface NotificationRoutingProblem {
  readonly notificationId: string;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly threadId: string;
  readonly summary: string;
}

export type NotificationInstrumentationOperation =
  | "notification.present"
  | "notification.sound"
  | "notification.action.view"
  | "notification.action.close";

export interface NotificationInstrumentationEvent {
  readonly operation: NotificationInstrumentationOperation;
  readonly outcome: "ok" | "cancelled" | "refused" | "failed" | "unavailable";
  readonly projectId: string;
  readonly worktreeId: string;
  readonly threadId: string;
}

export interface AttentionNotificationCoordinatorOptions {
  readonly adapter: AttentionNotificationAdapter;
  readonly threads: AttentionThreadSource;
  readonly settings: () => AttentionNotificationSettings;
  readonly window: AttentionWindowSource;
  readonly reportProblem?: (problem: NotificationRoutingProblem) => void;
  readonly record?: (event: NotificationInstrumentationEvent) => void | Promise<void>;
  readonly now?: () => number;
}
