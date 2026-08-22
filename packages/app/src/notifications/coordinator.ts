import { ThreadAttentionDeduplicator, type ThreadAttentionEventV1 } from "@/threads";
import {
  NOTIFICATION_SCHEMA_VERSION,
  type AttentionNotificationCoordinatorOptions,
  type AttentionNotificationSettings,
  type CompletionSound,
  type NotificationActionV1,
  type NotificationRoutingProblem,
  type SupportedAttentionAgent,
  type ThreadNotificationRequestV1,
} from "./types";

const SOUND_INTERVAL_MS = 1_500;
const LABEL_LIMIT = 80;
const supportedAgents = new Set<SupportedAttentionAgent>(["codex", "claude-code", "opencode"]);

interface NotificationTarget {
  readonly projectId: string;
  readonly worktreeId: string;
  readonly threadId: string;
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

function safeLabel(value: string, fallback: string): string {
  const printable = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");
  const normalized = printable.replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, LABEL_LIMIT);
}

function agentLabel(agent: SupportedAttentionAgent): string {
  switch (agent) {
    case "codex":
      return "Codex";
    case "claude-code":
      return "Claude Code";
    case "opencode":
      return "OpenCode";
  }
}

function volume(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function soundFor(
  settings: AttentionNotificationSettings,
  agent: ThreadAttentionEventV1["agent"],
): CompletionSound | null {
  if (
    !settings.soundEnabled ||
    settings.muted ||
    !supportedAgents.has(agent as SupportedAttentionAgent)
  ) {
    return null;
  }
  const sound = settings.agentSounds[agent as SupportedAttentionAgent];
  return sound === "subtle" || sound === "bright" || sound === "gentle" ? sound : "subtle";
}

/**
 * Presents the already-committed thread attention state. Native failures never flow back into the
 * thread lifecycle, and the only navigation operation is the root's atomic `activateThread`.
 */
export class AttentionNotificationCoordinator {
  readonly #deduplicator = new ThreadAttentionDeduplicator();
  readonly #options: AttentionNotificationCoordinatorOptions;
  readonly #targets = new Map<string, NotificationTarget>();
  readonly #now: () => number;
  #lastSoundStartedAt = Number.NEGATIVE_INFINITY;
  #soundInFlight = false;
  #stop: (() => void) | null = null;

  constructor(options: AttentionNotificationCoordinatorOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  start(): () => void {
    if (this.#stop) return this.#stop;
    const stopAttention = this.#options.threads.subscribeAttention((event) => {
      void this.handleAttention(event);
    });
    const stopActions = this.#options.adapter.onAction((action) => {
      void this.#route(action);
    });
    let active = true;
    this.#stop = () => {
      if (!active) return;
      active = false;
      stopActions();
      stopAttention();
      this.#stop = null;
    };
    return this.#stop;
  }

  async handleAttention(event: ThreadAttentionEventV1): Promise<void> {
    if (!this.#deduplicator.accept(event)) return;
    const resolved = this.#resolveEvent(event);
    if (!resolved) {
      this.#report(event, `Attention target ${event.threadId} is no longer available`);
      return;
    }

    const { request, target } = resolved;
    this.#targets.set(request.notificationId, target);
    if (
      this.#options.window.isFocused() &&
      this.#options.window.targetThreadOwnsFocus(event.threadId)
    ) {
      return;
    }

    const settings = this.#options.settings();
    const work: Promise<unknown>[] = [];
    if (settings.desktopEnabled) work.push(this.#present(request));
    const sound = soundFor(settings, event.agent);
    if (sound) work.push(this.#playSound(sound, volume(settings.volume)));
    await Promise.all(work);
  }

  async #present(request: ThreadNotificationRequestV1): Promise<void> {
    let permission;
    try {
      permission = await this.#options.adapter.permission();
    } catch {
      return;
    }
    if (permission !== "granted") return;
    try {
      const result = await this.#options.adapter.show(request);
      if (result.status === "failed" && result.problem) {
        this.#report(request, result.problem);
      }
    } catch (cause) {
      this.#report(request, cause instanceof Error ? cause.message : String(cause));
    }
  }

  async #playSound(sound: CompletionSound, selectedVolume: number): Promise<void> {
    const now = this.#now();
    if (this.#soundInFlight || now - this.#lastSoundStartedAt < SOUND_INTERVAL_MS) return;
    this.#soundInFlight = true;
    this.#lastSoundStartedAt = now;
    try {
      await this.#options.adapter.playSound({ sound, volume: selectedVolume });
    } catch {
      // The in-app attention row is already committed; audio is optional presentation only.
    } finally {
      this.#soundInFlight = false;
    }
  }

  #resolveEvent(
    event: ThreadAttentionEventV1,
  ): { readonly request: ThreadNotificationRequestV1; readonly target: NotificationTarget } | null {
    if (
      event.schemaVersion !== NOTIFICATION_SCHEMA_VERSION ||
      event.kind !== "waiting" ||
      event.threadType !== "terminal" ||
      !supportedAgents.has(event.agent as SupportedAttentionAgent)
    ) {
      return null;
    }
    const snapshot = this.#options.threads.snapshot();
    const thread = snapshot.threads.find(
      (candidate) =>
        candidate.id === event.threadId &&
        candidate.projectId === event.projectId &&
        candidate.worktree.id === event.worktreeId &&
        candidate.type.agent === event.agent,
    );
    const project = snapshot.projects.find(({ id }) => id === event.projectId);
    if (!thread || !project) return null;
    const target = {
      projectId: event.projectId,
      worktreeId: event.worktreeId,
      threadId: event.threadId,
    };
    return {
      target,
      request: {
        schemaVersion: NOTIFICATION_SCHEMA_VERSION,
        notificationId: `attention:${event.eventId}`,
        eventId: event.eventId,
        ...target,
        title: "zd",
        body: `${safeLabel(project.name, "Project")} · ${safeLabel(thread.name, "Thread")} · ${agentLabel(event.agent as SupportedAttentionAgent)}`,
      },
    };
  }

  #targetForAction(action: NotificationActionV1): NotificationTarget | null {
    if (action.schemaVersion !== NOTIFICATION_SCHEMA_VERSION) return null;
    const target = this.#targets.get(action.notificationId);
    if (
      target &&
      target.projectId === action.projectId &&
      target.worktreeId === action.worktreeId &&
      target.threadId === action.threadId
    ) {
      return target;
    }

    // A delivered notification can relaunch the app. Accept its closed stable identities only when
    // the restored root snapshot still contains that exact project/worktree/thread relationship.
    const snapshot = this.#options.threads.snapshot();
    const thread = snapshot.threads.find(({ id }) => id === action.threadId);
    if (
      !thread ||
      thread.projectId !== action.projectId ||
      thread.worktree.id !== action.worktreeId ||
      !snapshot.projects.some(({ id }) => id === action.projectId)
    ) {
      return null;
    }
    return {
      projectId: action.projectId,
      worktreeId: action.worktreeId,
      threadId: action.threadId,
    };
  }

  async #route(action: NotificationActionV1): Promise<void> {
    const target = this.#targetForAction(action);
    if (!target || action.action === "close") return;
    try {
      await this.#options.window.showWorkbench();
    } catch (cause) {
      this.#report(action, cause instanceof Error ? cause.message : String(cause));
    }
    const result = await this.#options.threads.activateThread(target.threadId);
    if (result.status === "refused") this.#report(action, result.reason);
  }

  #report(
    target: Pick<NotificationTarget, "projectId" | "worktreeId" | "threadId"> & {
      readonly notificationId?: string;
      readonly eventId?: string;
    },
    summary: string,
  ): void {
    const problem: NotificationRoutingProblem = {
      notificationId: target.notificationId ?? `attention:${target.eventId ?? target.threadId}`,
      projectId: target.projectId,
      worktreeId: target.worktreeId,
      threadId: target.threadId,
      summary,
    };
    this.#options.reportProblem?.(problem);
  }
}
