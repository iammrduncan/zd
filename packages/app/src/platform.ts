import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  DiagnosticStatus,
  DiagnosticWriteOutcome,
  PreparedDiagnosticRecord,
} from "@/instrumentation";
import type {
  AttentionNotificationAdapter,
  CompletionSoundResult,
  NotificationActionV1,
  NotificationPermission,
  NotificationPresentationResult,
} from "@/notifications";
import type { BoundedFileRead } from "@/editor";
import { unavailableFileTreeAdapter, type FileTreeAdapter } from "@/files";
import { unavailableGitAdapter, type GitAdapter } from "@/git";
import { unavailableTerminalAdapter, type TerminalAdapter } from "@/terminal";
import {
  homeLaunch,
  type FileResource,
  type LaunchRequest,
  type ProjectGrant,
  type RecentWorkspace,
} from "@/workbench/resources";
import { connectServedHostClient, pairServedBrowser } from "@/platform/served-client";
import type { ServedHostClient } from "@/platform/served-client";
import { createServedWorkbenchHost } from "@/platform/served";
import { composePlatform, type ClientShell } from "@/platform/composition";
import {
  chooseRemoteProject,
  type RemoteProjectPickerSnapshot,
} from "@/platform/remote-project-picker";
import {
  createMemoryDurableStateAdapter,
  type DurableStateAdapter,
} from "@/platform/durable-state";

export type {
  DurableFileDraft,
  DurableReviewComment,
  DurableReviewLedger,
  DurableStateAdapter,
  DurableStateBundle,
  DurableStateMutation,
  DurableStateRevision,
} from "@/platform/durable-state";

export type { ClientShell, WorkbenchHost } from "@/platform/composition";

/**
 * The only file in the frontend that knows what shell it is running in.
 *
 * Everything above this line is portable. If Tauri ever stops being the right
 * shell, this file is the change — see
 * docs/adr/suite/0002-put-native-authority-behind-platform-boundary_H.md.
 */
/**
 * Identity enough to notice someone else wrote the file. See the host service's
 * `file_stamp` operation in packages/host/src/service.rs, which produces it.
 *
 * Here rather than beside the code that reconciles with it — audit finding L1. It
 * describes what a platform command returns, and the platform is the bottom
 * layer. A feature-owned type placed here would make every other file consumer
 * depend on that feature's source directory.
 */
export interface FileStamp {
  modified: number | null;
  length: number;
}

export type ClipboardImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** A bounded image write whose destination and filename remain native-owned. */
export interface ClipboardImageWriteRequest {
  readonly projectId: string;
  readonly worktreeId: string;
  readonly mediaType: ClipboardImageMediaType;
  readonly bytes: Uint8Array;
}

export interface SavedClipboardImage {
  readonly relativePath: string;
}

/** Validated raster bytes read below one native-approved project/worktree. */
export interface ProjectImage {
  readonly mediaType: ClipboardImageMediaType;
  readonly bytes: readonly number[];
}

export interface WorkspaceFile {
  resource: FileResource;
  relative: string;
}

export interface WorkspaceListing {
  projectId: string;
  worktreeId: string;
  root: string;
  files: WorkspaceFile[];
}

/** One bounded, non-executable theme file discovered by the native shell. */
export interface ThemeConfigFile {
  readonly fileName: string;
  readonly contents: string | null;
  readonly problem: string | null;
}

export type WindowPresentation = "ordinary" | "quick-access";

export interface GlobalShortcutRegistration {
  readonly supported: boolean;
  readonly registered: boolean;
  readonly shortcut: string;
  readonly problem: string | null;
}

export interface CreateThreadWorktreeRequest {
  readonly projectId: string;
  readonly name: string;
  readonly branch: string;
  readonly baseRevision: string | null;
}

export type WorktreeRefusalKind =
  | "unknown-project"
  | "not-repository"
  | "invalid-name"
  | "invalid-revision"
  | "collision"
  | "locked"
  | "git-failed";

export type CreateThreadWorktreeResult =
  | { readonly status: "created"; readonly worktree: ProjectGrant["worktrees"][number] }
  | {
      readonly status: "refused";
      readonly kind: WorktreeRefusalKind;
      readonly reason: string;
    };

export function unavailableThreadWorktree(): Promise<CreateThreadWorktreeResult> {
  return Promise.resolve({
    status: "refused",
    kind: "git-failed",
    reason: "thread worktree creation requires the desktop shell",
  });
}

export interface Platform {
  readonly kind: "tauri" | "browser";
  /** Whether this client must ignore origin storage and use the host snapshot. */
  readonly usesHostDurableState: boolean;
  /** Closed, revisioned host persistence for recovery-critical workbench state. */
  readonly durableState: DurableStateAdapter;
  /** What the process was launched to open. */
  launchRequest(): Promise<LaunchRequest>;
  /** A native file-open request is waiting. Returns an unsubscribe. */
  onOpenRequested(handler: () => void): () => void;
  /** Inspect the oldest native request without changing active native context. */
  pendingOpenRequest(): Promise<LaunchRequest | null>;
  /** Accept that inspected request after the root transition guards approve it. */
  acceptOpenRequest(): Promise<LaunchRequest | null>;
  /** All roots approved by native launch/open/picker/worktree flows. */
  projectGrants(): Promise<readonly ProjectGrant[]>;
  /** Recent native-owned single-project and multi-project workspace setups. */
  recentWorkspaces(): Promise<readonly RecentWorkspace[]>;
  /** Persist the ordered set of already-approved project identities as one setup. */
  saveWorkspace(projectIds: readonly string[]): Promise<RecentWorkspace>;
  /** Reapprove the native roots behind one previously issued workspace identity. */
  openWorkspace(workspaceId: string): Promise<readonly ProjectGrant[]>;
  /** Open the native folder picker and mint or reuse one canonical project grant. */
  chooseProject(): Promise<ProjectGrant | null>;
  /** Locate an unavailable project through the native picker without changing its identity. */
  recoverProjectGrant(projectId: string): Promise<ProjectGrant | null>;
  /** Create and approve one native-derived Git worktree for a thread. */
  createThreadWorktree(request: CreateThreadWorktreeRequest): Promise<CreateThreadWorktreeResult>;
  /** Revoke an inactive project after root lifecycle guards approve it. */
  removeProjectGrant(projectId: string): Promise<ProjectGrant>;
  /** Read direct `<name>.theme.config` children of the platform `zd` config directory. */
  themeConfigFiles(): Promise<readonly ThemeConfigFile[]>;
  /** Register the one native summon chord, returning a conflict instead of failing launch. */
  registerGlobalSummon(): Promise<GlobalShortcutRegistration>;
  /** Mirror native show, hide, repeated summon, and focus-loss changes into root state. */
  onWindowPresentationChanged(handler: (presentation: WindowPresentation) => void): () => void;
  /** Toggle the existing root window between hidden and quick-access presentation. */
  toggleQuickAccess(): Promise<WindowPresentation>;
  /** Hide quick access without closing or tearing down the root window. */
  hideQuickAccess(): Promise<WindowPresentation>;
  /** Restore the one ordinary workbench window for an explicit notification action. */
  showWorkbench(): Promise<WindowPresentation>;
  /** Read native application-window focus for foreground attention policy. */
  isWindowFocused(): Promise<boolean>;
  /** Observe native application-window focus without polling. */
  onWindowFocusChanged(handler: (focused: boolean) => void): () => void;
  /** Privacy-closed desktop notification and completion-sound presentation. */
  readonly notifications: AttentionNotificationAdapter;
  /** Inspect the local, opt-in diagnostic session without enabling it. */
  diagnosticsStatus(): Promise<DiagnosticStatus>;
  /** Start one bounded host diagnostic session. */
  enableDiagnostics(): Promise<DiagnosticStatus>;
  /** Flush and stop the current host diagnostic session. */
  disableDiagnostics(): Promise<DiagnosticStatus>;
  /** Write one already-validated closed-schema diagnostic record. */
  recordDiagnostic(record: PreparedDiagnosticRecord): Promise<DiagnosticWriteOutcome>;
  /** Reveal the native diagnostic directory without exposing its path to the webview. */
  revealDiagnostics(): Promise<void>;
  /** Structured, project-scoped native terminal lifecycle; never arbitrary process execution. */
  readonly terminal: TerminalAdapter;
  /** Complete bounded snapshots for one native-approved project/worktree. */
  readonly fileTree: FileTreeAdapter;
  /** Read-only status, bounded history, and comparisons for an approved scope. */
  readonly git: GitAdapter;
  /** Read a UTF-8 text file. */
  readTextFile(resource: FileResource): Promise<string>;
  /** Classify and read at most one bounded text file without guessing an encoding. */
  readBoundedFile(resource: FileResource): Promise<BoundedFileRead>;
  /** Read one bounded, signature-validated raster image through native project authority. */
  readProjectImage(resource: FileResource): Promise<ProjectImage>;
  /** Markdown files inside one already-approved project/worktree root. */
  workspaceFiles(projectId: string, worktreeId: string): Promise<WorkspaceListing>;
  /**
   * Save a UTF-8 text file. Vision §6.3: writes are atomic, so a save that is
   * interrupted leaves the previous document intact rather than a truncated one.
   * The guarantee lives on the other side of this boundary — see
   * packages/host/src/atomic_write.rs.
   */
  writeTextFile(resource: FileResource, contents: string): Promise<void>;
  /** Persist one supported image below the fixed `docs/screenshots` project directory. */
  saveClipboardImage(request: ClipboardImageWriteRequest): Promise<SavedClipboardImage>;
  /**
   * Identity enough to notice someone else wrote the file, or null if it is gone.
   *
   * Vision §6.3's "detected", and deliberately a question rather than a
   * subscription: a watcher would be a plugin, a background thread, and a stream of
   * events to debounce, none of which is needed to answer "is the file still the
   * one I read?". See packages/host/src/service.rs.
   */
  fileStamp(resource: FileResource): Promise<FileStamp | null>;
  /**
   * The window was asked to close. Returns an unsubscribe.
   *
   * The shell refuses the close and asks instead, because only this side knows
   * whether there is unsaved work — vision §6.3's whole promise is that what you
   * wrote is still there, and a window that closes on the first ask cannot keep
   * it. Nothing happens until someone calls `closeWindow`.
   */
  onCloseRequested(handler: () => void): () => void;
  /** Close the window for real, having decided it is safe to. */
  closeWindow(): Promise<void>;
  /** Hand a genuinely external URL to the system browser. */
  openExternal(url: string): Promise<void>;
}

const unavailableNotifications: AttentionNotificationAdapter = {
  permission: async () => "unsupported",
  requestPermission: async () => "unsupported",
  show: async () => ({
    status: "unsupported",
    problem: "desktop notifications require a supported desktop shell",
  }),
  onAction: () => () => {},
  playSound: async () => ({
    status: "unsupported",
    problem: "completion sounds require a supported desktop shell",
  }),
};

/** Honest attention capabilities for typed fixtures that do not own a desktop window. */
export const unavailableAttentionPlatform = {
  usesHostDurableState: false,
  durableState: {
    load: async () => ({
      revision: { preferences: 0, project: 0 },
      preferences: null,
      workbench: null,
      drafts: [],
      reviewLedgers: [],
    }),
    snapshot: () => ({
      revision: { preferences: 0, project: 0 },
      preferences: null,
      workbench: null,
      drafts: [],
      reviewLedgers: [],
    }),
    mutate: async () => false,
    flush: async () => {},
    onProblem: () => () => {},
  },
  showWorkbench: async () => "ordinary" as const,
  isWindowFocused: async () => false,
  onWindowFocusChanged: () => () => {},
  notifications: unavailableNotifications,
} satisfies Pick<
  Platform,
  | "usesHostDurableState"
  | "durableState"
  | "showWorkbench"
  | "isWindowFocused"
  | "onWindowFocusChanged"
  | "notifications"
>;

/**
 * Used by `npm run dev` in a plain browser and by Playwright. It is not a mock
 * of the Tauri backend — it is the honest answer for "there is no desktop shell
 * here", so tests that need real files must go through the Tauri build.
 */
const browser: Platform = {
  kind: "browser",
  usesHostDurableState: false,
  durableState: createMemoryDurableStateAdapter(),
  launchRequest: async () => homeLaunch(),
  onOpenRequested: () => () => {},
  pendingOpenRequest: async () => null,
  acceptOpenRequest: async () => null,
  projectGrants: async () => [],
  recentWorkspaces: async () => [],
  saveWorkspace: async () => {
    throw new Error("workspace persistence requires the desktop shell");
  },
  openWorkspace: async () => {
    throw new Error("recent workspaces require the desktop shell");
  },
  chooseProject: async () => null,
  recoverProjectGrant: async () => null,
  createThreadWorktree: unavailableThreadWorktree,
  removeProjectGrant: async (projectId) => {
    throw new Error(`no project grants in the browser shell: ${projectId}`);
  },
  themeConfigFiles: async () => [],
  registerGlobalSummon: async () => ({
    supported: false,
    registered: false,
    shortcut: "CmdOrCtrl+Shift+Space",
    problem: null,
  }),
  onWindowPresentationChanged: () => () => {},
  toggleQuickAccess: async () => "ordinary",
  hideQuickAccess: async () => "ordinary",
  showWorkbench: async () => "ordinary",
  isWindowFocused: async () => document.hasFocus(),
  onWindowFocusChanged: (handler) => {
    const focused = () => handler(true);
    const blurred = () => handler(false);
    window.addEventListener("focus", focused);
    window.addEventListener("blur", blurred);
    return () => {
      window.removeEventListener("focus", focused);
      window.removeEventListener("blur", blurred);
    };
  },
  notifications: unavailableNotifications,
  diagnosticsStatus: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: null,
  }),
  enableDiagnostics: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: "host diagnostics require the desktop shell",
  }),
  disableDiagnostics: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: null,
  }),
  recordDiagnostic: async () => ({ recorded: false, problem: null }),
  revealDiagnostics: async () => {
    throw new Error("host diagnostics require the desktop shell");
  },
  terminal: unavailableTerminalAdapter,
  fileTree: unavailableFileTreeAdapter,
  git: unavailableGitAdapter,
  workspaceFiles: async (projectId, worktreeId) => {
    throw new Error(`no filesystem in the browser shell: ${projectId}/${worktreeId}`);
  },
  readTextFile: async (resource) => {
    throw new Error(`no filesystem in the browser shell: ${resource.relativePath}`);
  },
  readBoundedFile: async () => ({
    status: "unavailable",
    problem: "bounded file reads require the desktop shell",
  }),
  readProjectImage: async (resource) => {
    throw new Error(`project image reads require the desktop shell: ${resource.relativePath}`);
  },
  writeTextFile: async (resource) => {
    throw new Error(`no filesystem in the browser shell: ${resource.relativePath}`);
  },
  saveClipboardImage: async () => {
    throw new Error("clipboard image saving requires the desktop shell");
  },
  // Null rather than a throw: "there is no file here" is the honest answer in a
  // browser, and it makes the reconcile path a no-op instead of an error to catch.
  fileStamp: async () => null,
  /*
   * A browser tab is not this app's window to close, and `beforeunload` is the
   * platform's own affair rather than something to reimplement. So nothing ever
   * asks, and `closeWindow` is a no-op — the honest answer for "there is no
   * desktop shell here", same as every other method on this object.
   */
  onCloseRequested: () => () => {},
  closeWindow: async () => {},
  openExternal: async (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

const browserShell: ClientShell = {
  onOpenRequested: browser.onOpenRequested,
  pendingOpenRequest: browser.pendingOpenRequest,
  acceptOpenRequest: browser.acceptOpenRequest,
  chooseProject: browser.chooseProject,
  recoverProjectGrant: browser.recoverProjectGrant,
  registerGlobalSummon: browser.registerGlobalSummon,
  onWindowPresentationChanged: browser.onWindowPresentationChanged,
  toggleQuickAccess: browser.toggleQuickAccess,
  hideQuickAccess: browser.hideQuickAccess,
  showWorkbench: browser.showWorkbench,
  isWindowFocused: browser.isWindowFocused,
  onWindowFocusChanged: browser.onWindowFocusChanged,
  notifications: browser.notifications,
  onCloseRequested: browser.onCloseRequested,
  closeWindow: browser.closeWindow,
  openExternal: browser.openExternal,
};

const tauriShell: ClientShell = {
  onOpenRequested: (handler) => {
    let active = true;
    const pending = listen("open-requested", () => {
      if (active) handler();
    }).then(async (unlisten) => {
      const waiting = await invoke<boolean>("has_pending_open_request");
      if (active && waiting) handler();
      return unlisten;
    });
    return () => {
      active = false;
      void pending.then((unlisten) => unlisten());
    };
  },
  pendingOpenRequest: () => invoke<LaunchRequest | null>("pending_open_request"),
  acceptOpenRequest: () => invoke<LaunchRequest | null>("accept_open_request"),
  chooseProject: () => invoke<ProjectGrant | null>("choose_project"),
  recoverProjectGrant: (projectId) =>
    invoke<ProjectGrant | null>("recover_project_grant", { projectId }),
  registerGlobalSummon: () => invoke<GlobalShortcutRegistration>("register_global_summon"),
  onWindowPresentationChanged: (handler) => {
    let active = true;
    const pending = listen<WindowPresentation>("window-presentation-changed", (event) => {
      if (active) handler(event.payload);
    });
    return () => {
      active = false;
      void pending.then((unlisten) => unlisten());
    };
  },
  toggleQuickAccess: () => invoke<WindowPresentation>("toggle_quick_access"),
  hideQuickAccess: () => invoke<WindowPresentation>("hide_quick_access"),
  showWorkbench: () => invoke<WindowPresentation>("show_workbench"),
  isWindowFocused: () => getCurrentWindow().isFocused(),
  onWindowFocusChanged: (handler) => {
    let active = true;
    const pending = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (active) handler(payload);
    });
    return () => {
      active = false;
      void pending.then((unlisten) => unlisten());
    };
  },
  notifications: {
    permission: () => invoke<NotificationPermission>("notification_permission"),
    requestPermission: () => invoke<NotificationPermission>("notification_request_permission"),
    show: (request) =>
      invoke<NotificationPresentationResult>("show_thread_notification", { request }),
    onAction: (handler) => {
      let active = true;
      const pending = listen<NotificationActionV1>("notification-action", (event) => {
        if (active) handler(event.payload);
      }).then(async (unlisten) => {
        const waiting = await invoke<readonly NotificationActionV1[]>(
          "pending_notification_actions",
        );
        if (active) waiting.forEach((action) => handler(action));
        return unlisten;
      });
      return () => {
        active = false;
        void pending.then((unlisten) => unlisten());
      };
    },
    playSound: (request) => invoke<CompletionSoundResult>("play_completion_sound", { request }),
  },
  onCloseRequested: (handler) => {
    const pending = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      handler();
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  },
  closeWindow: () => invoke<void>("close_window"),
  openExternal: (url) => invoke<void>("open_external", { url }),
};

interface DesktopBootstrap {
  readonly origin: string;
  readonly sessionEpoch: string;
  readonly secret: string;
}

type ServedConnector = (options: {
  readonly origin: string;
  readonly secret: string | null;
}) => Promise<ServedHostClient>;

function urlToken(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[A-Za-z0-9_-]+$/.test(value);
}

function desktopBootstrap(value: unknown): DesktopBootstrap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("the desktop bootstrap is invalid");
  }
  const candidate = value as Partial<DesktopBootstrap>;
  if (candidate.origin !== window.location.origin) {
    throw new Error("the desktop bootstrap origin does not match this page");
  }
  if (!urlToken(candidate.sessionEpoch, 22) || !urlToken(candidate.secret, 43)) {
    throw new Error("the desktop bootstrap credentials are invalid");
  }
  return {
    origin: candidate.origin,
    sessionEpoch: candidate.sessionEpoch,
    secret: candidate.secret,
  };
}

export async function connectDesktopServedPlatform(
  connect: ServedConnector = connectServedHostClient,
): Promise<Platform> {
  const bootstrap = desktopBootstrap(await invoke<unknown>("take_desktop_bootstrap"));
  const client = await connect({ origin: bootstrap.origin, secret: bootstrap.secret });
  return composePlatform("tauri", createServedWorkbenchHost(client), tauriShell);
}

export async function connectServedPlatform(secret: string | null): Promise<Platform> {
  if (secret !== null) {
    await pairServedBrowser(window.location.origin, secret);
  }
  const client = await connectServedHostClient({ origin: window.location.origin, secret: null });
  const servedBrowserShell: ClientShell = {
    ...browserShell,
    chooseProject: () =>
      chooseRemoteProject({
        start: () => client.request<RemoteProjectPickerSnapshot>("projectPicker.start", {}),
        search: (request) =>
          client.request<RemoteProjectPickerSnapshot>("projectPicker.search", request),
        open: (request) =>
          client.request<RemoteProjectPickerSnapshot>("projectPicker.open", request),
        choose: (request) => client.request<ProjectGrant>("projectPicker.choose", request),
        cancel: async (request) => {
          await client.request<null>("projectPicker.cancel", request);
        },
      }),
  };
  return composePlatform("browser", createServedWorkbenchHost(client), servedBrowserShell);
}

export function isTauriWindow(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function detectPlatform(): Platform {
  if (isTauriWindow()) {
    throw new Error("the desktop workbench must connect through its served host");
  }
  return browser;
}
